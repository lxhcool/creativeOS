import { NextResponse } from "next/server";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { ModelGateway } from "@/services/model/gateway";
import type { ModelGatewayConfig } from "@/services/model/types";
import { toCanvasTextGenerationErrorMessage } from "../lib/errors";

const providerSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "openai",
    "anthropic",
    "google",
    "litellm",
    "openrouter",
    "openai_compatible",
  ]),
  baseUrl: z.string().min(1),
  apiKey: z.string().optional(),
});

const modelSchema = z.object({
  kind: z.literal("text"),
  modelName: z.string().min(1),
  capabilities: z.array(z.string()).default(["text"]),
  contextWindow: z.number().optional(),
  maxOutputTokens: z.number().optional(),
});

const sourceSchema = z.object({
  kind: z.string(),
  text: z.string().optional(),
  prompt: z.string().optional(),
  label: z.string().optional(),
});

const textRoleSchema = z.enum([
  "general",
  "article",
  "novel_setup",
  "novel_outline",
  "novel_chapter_outline",
  "novel_chapter",
  "character",
  "script",
  "storyboard",
  "prompt",
]);

const requestSchema = z.object({
  prompt: z.string().min(1),
  current: sourceSchema.optional(),
  provider: providerSchema,
  model: modelSchema,
  sources: z.array(sourceSchema).default([]),
  resultTextRole: textRoleSchema.default("general"),
});

const workflowMemorySchema = z.object({
  title: z.string().optional(),
  summary: z.string().min(1),
  continuityNotes: z.array(z.string()).default([]),
  nextHooks: z.array(z.string()).default([]),
});

type WorkflowRequest = z.infer<typeof requestSchema>;
type WorkflowMemory = z.infer<typeof workflowMemorySchema>;

type WorkflowParams = {
  body: WorkflowRequest;
  gateway: ModelGateway;
  maxTokens: number;
};

function toRuntimeProviderType(type: z.infer<typeof providerSchema>["type"]) {
  return type === "litellm" || type === "openrouter" ? "openai_compatible" : type;
}

function contentOf(source: z.infer<typeof sourceSchema>): string {
  return source.text || source.prompt || source.label || "";
}

function buildWorkflowContext(body: WorkflowRequest): string {
  const currentContent = body.current ? contentOf(body.current) : "";
  const sourceText = body.sources
    .map((source, index) => {
      const content = contentOf(source).trim();
      return content ? `${index + 1}. [${source.kind}] ${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  return [
    `目标节点类型：${body.resultTextRole}`,
    currentContent ? `当前节点内容：\n${currentContent}` : "",
    sourceText ? `上游/关联节点：\n${sourceText}` : "",
    `用户指令：\n${body.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getRoleGuidance(role: WorkflowRequest["resultTextRole"]): string {
  if (role === "novel_chapter") {
    return "最终结果必须是小说章节正文，重点是场景、行动、人物感受、对白、冲突推进和结尾钩子。不要输出规划过程。";
  }
  if (role === "novel_chapter_outline") {
    return "最终结果必须是章节大纲，包含章节标题、本章目标、出场人物、关键场景、冲突、转折、伏笔和结尾钩子。";
  }
  if (role === "novel_outline") {
    return "最终结果必须是故事大纲，包含主线、阶段目标、关键转折、人物成长和结局方向。";
  }
  if (role === "novel_setup") {
    return "最终结果必须是小说设定，包含题材、世界观、主角、核心矛盾、金手指、风格和长期看点。";
  }
  if (role === "character") {
    return "最终结果必须是角色卡，包含身份、外貌、性格、背景、目标、弱点、关系、人物弧光和视觉关键词。";
  }
  if (role === "script") {
    return "最终结果必须是剧本，包含场景、人物、动作、对白和镜头提示。";
  }
  if (role === "storyboard") {
    return "最终结果必须是分镜脚本，每个镜头包含画面、动作、对白或旁白、时长和生成提示词。";
  }
  if (role === "prompt") {
    return "最终结果必须是适合图像或视频生成的提示词，包含主体、动作、场景、风格、构图、光线、镜头和负面限制。";
  }
  if (role === "article") {
    return "最终结果必须是一篇完整文章，包含标题、开头、主体段落和结尾。";
  }
  return "最终结果必须是可直接放入画布文本节点的中文正文。";
}

async function runAgent(params: {
  gateway: ModelGateway;
  task: string;
  role: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  const result = await params.gateway.chat({
    task: params.task,
    messages: [
      {
        role: "system",
        content: `${params.role}。默认用中文。不要解释你在扮演什么角色，只输出本阶段结果。`,
      },
      {
        role: "user",
        content: params.prompt,
      },
    ],
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });

  return result.content.trim();
}

async function summarizeWorkflow(params: {
  gateway: ModelGateway;
  context: string;
  finalText: string;
  maxTokens: number;
}): Promise<WorkflowMemory> {
  try {
    const result = await params.gateway.generateJson({
      task: "canvas_text_workflow",
      schema: workflowMemorySchema,
      schemaDescription:
        "{ title?: string, summary: string, continuityNotes: string[], nextHooks: string[] }",
      systemPrompt: "你是 CreativeOS 的创作记忆整理 Agent，只输出 JSON。",
      prompt: [
        "请为这次文本创作沉淀后续可用的记忆。",
        "summary 用一句话到三句话概括最终内容。",
        "continuityNotes 记录人物、设定、时间线、伏笔等后续必须保持一致的信息。",
        "nextHooks 记录下一章或下一步可继续展开的方向。",
        `创作上下文：\n${params.context}`,
        `最终结果：\n${params.finalText}`,
      ].join("\n\n"),
      temperature: 0,
      maxTokens: Math.min(params.maxTokens, 900),
    });

    return result.data;
  } catch {
    return {
      summary: params.finalText.slice(0, 240),
      continuityNotes: [],
      nextHooks: [],
    };
  }
}

const WorkflowState = Annotation.Root({
  params: Annotation<WorkflowParams>,
  context: Annotation<string | undefined>,
  plan: Annotation<string | undefined>,
  draft: Annotation<string | undefined>,
  finalText: Annotation<string | undefined>,
  memory: Annotation<WorkflowMemory | undefined>,
});

const textWorkflow = new StateGraph(WorkflowState)
  .addNode("collectContext", (state) => ({
    context: buildWorkflowContext(state.params.body),
  }))
  .addNode("createPlan", async (state) => {
    const context = state.context || buildWorkflowContext(state.params.body);
    const plan = await runAgent({
      gateway: state.params.gateway,
      task: "canvas_text_workflow",
      role: "你是剧情规划/内容结构 Agent，负责先确定结构、节奏、关键信息和延续关系",
      prompt: [
        getRoleGuidance(state.params.body.resultTextRole),
        "请先给出执行规划，只服务于下一阶段写作，不要写正文。",
        context,
      ].join("\n\n"),
      temperature: 0.35,
      maxTokens: Math.min(state.params.maxTokens, 1200),
    });

    return { plan };
  })
  .addNode("writeDraft", async (state) => {
    const context = state.context || buildWorkflowContext(state.params.body);
    const draft = await runAgent({
      gateway: state.params.gateway,
      task: "canvas_text_workflow",
      role: "你是写作 Agent，负责基于规划写出可直接使用的正文",
      prompt: [
        getRoleGuidance(state.params.body.resultTextRole),
        state.plan ? `规划：\n${state.plan}` : "",
        `上下文：\n${context}`,
        "请输出完整初稿。不要解释过程，不要写“以下是”。",
      ]
        .filter(Boolean)
        .join("\n\n"),
      temperature: 0.78,
      maxTokens: state.params.maxTokens,
    });

    return { draft };
  })
  .addNode("reviseFinal", async (state) => {
    const context = state.context || buildWorkflowContext(state.params.body);
    const finalText = await runAgent({
      gateway: state.params.gateway,
      task: "canvas_text_workflow",
      role: "你是风格润色与一致性检查 Agent，负责修正初稿并输出最终版本",
      prompt: [
        getRoleGuidance(state.params.body.resultTextRole),
        "请检查初稿是否符合上下文、角色设定、章节连续性和用户指令。",
        "如有问题，直接修正。最终只输出可放入画布节点的内容，不要输出检查报告。",
        `上下文：\n${context}`,
        state.plan ? `规划：\n${state.plan}` : "",
        state.draft ? `初稿：\n${state.draft}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      temperature: 0.55,
      maxTokens: state.params.maxTokens,
    });

    return { finalText };
  })
  .addNode("extractMemory", async (state) => {
    const context = state.context || buildWorkflowContext(state.params.body);
    const finalText = state.finalText || state.draft || "";
    const memory = await summarizeWorkflow({
      gateway: state.params.gateway,
      context,
      finalText,
      maxTokens: state.params.maxTokens,
    });

    return { memory };
  })
  .addEdge(START, "collectContext")
  .addEdge("collectContext", "createPlan")
  .addEdge("createPlan", "writeDraft")
  .addEdge("writeDraft", "reviseFinal")
  .addEdge("reviseFinal", "extractMemory")
  .addEdge("extractMemory", END)
  .compile();

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    if (!body.model.capabilities.includes("text")) {
      return NextResponse.json(
        { error: "请选择文本模型后再发送。" },
        { status: 400 },
      );
    }

    const config: ModelGatewayConfig = {
      providers: [
        {
          id: body.provider.id,
          name: body.provider.id,
          type: toRuntimeProviderType(body.provider.type),
          enabled: true,
          baseUrl: body.provider.baseUrl.replace(/\/+$/, ""),
          apiKey: body.provider.apiKey,
          models: [
            {
              id: body.model.modelName,
              capabilities: body.model.capabilities as ModelGatewayConfig["providers"][number]["models"][number]["capabilities"],
              contextWindow: body.model.contextWindow,
              maxOutputTokens: body.model.maxOutputTokens,
            },
          ],
        },
      ],
      routing: {
        canvas_text_workflow: [`${body.provider.id}:${body.model.modelName}`],
      },
    };

    const gateway = new ModelGateway(config);
    const maxTokens = body.model.maxOutputTokens
      ? Math.min(body.model.maxOutputTokens, 6000)
      : 3000;
    const result = await textWorkflow.invoke({
      params: {
        body,
        gateway,
        maxTokens,
      },
    });
    const content = (result.finalText || result.draft || "").trim();

    if (!content) {
      return NextResponse.json({ error: "协作生成没有返回内容。" }, { status: 400 });
    }

    return NextResponse.json({
      content,
      memory: result.memory,
      stages: {
        plan: result.plan,
      },
    });
  } catch (error) {
    const message = toCanvasTextGenerationErrorMessage(error, "协作文本生成失败，请稍后重试。");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
