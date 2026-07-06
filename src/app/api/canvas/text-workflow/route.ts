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
  "novel_core",
  "novel_world",
  "novel_outline",
  "novel_volume_outline",
  "novel_chapter_outline",
  "novel_scene_outline",
  "novel_chapter",
  "novel_bible",
  "novel_style_guide",
  "character_cast",
  "character",
  "character_relation",
  "character_arc",
  "scene",
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
  if (role === "novel_scene_outline") {
    return "最终结果必须是场景大纲，服务于单章正文写作。包含场景目标、出场人物、人物行动、尝试与失败、线索或反转、情绪推进和悬念收尾。不要写成视频分镜。";
  }
  if (role === "novel_chapter_outline") {
    return "最终结果必须是章节大纲，包含章节标题、本章目标、出场人物、关键场景、冲突、转折、伏笔和结尾钩子。";
  }
  if (role === "novel_volume_outline") {
    return "最终结果必须是分卷大纲，包含每卷主题、阶段目标、主要冲突、关键转折、人物变化、伏笔推进和卷末钩子。";
  }
  if (role === "novel_outline") {
    return "最终结果必须是全书大纲，包含全书主线、阶段目标、核心冲突升级、关键转折、人物成长和结局方向。";
  }
  if (role === "novel_world") {
    return "最终结果必须是世界观设定，只定义故事发生的外部规则：时代/空间背景、权力结构、能力或规则体系、社会规则、禁忌与代价、地图或主要场景、历史事件和专有名词表。不要输出角色总表、故事核心、全书大纲、章节大纲或正文。";
  }
  if (role === "novel_core") {
    return "最终结果必须是故事核心，只定义主线驱动力：一句话故事命题、核心问题、主线目标、主要阻碍类型、关键赌注、冲突升级方式、结局方向和情绪主线。不要输出角色总表、世界观设定、全书大纲、章节大纲或正文。";
  }
  if (role === "novel_setup") {
    return "最终结果必须是小说定位，只包含题材类型、目标读者、篇幅目标、叙事视角、情绪基调、核心卖点、平台方向、读者期待和内容禁区。不要输出角色总表、世界观设定、故事核心、全书大纲、章节大纲或正文。";
  }
  if (role === "novel_bible") {
    return "最终结果必须是小说圣经，包含人物设定表、时间线、地点表、伏笔表、道具表、能力规则表、已发生事件摘要、未解决悬念和设定冲突检查。";
  }
  if (role === "novel_style_guide") {
    return "最终结果必须是风格指南，包含句子长短、对白风格、描写密度、叙事节奏、是否允许网络梗、文学化程度、禁用词、高频词和平台尺度。";
  }
  if (role === "character_cast") {
    return "最终结果必须是角色总表，面向整部小说的主要角色清单。每个角色包含姓名/代称、身份、阵营、目标、弱点、剧情功能、与主线关系、与其他角色的基础连接。不要输出世界观设定、全书大纲、章节大纲、单个角色卡或正文。";
  }
  if (role === "character") {
    return "最终结果必须是单个核心角色的角色卡，包含身份、外貌、性格、背景、目标、弱点、核心关系和人物弧光。不要写成多人总表，也不要写成媒体生成提示词。";
  }
  if (role === "character_relation") {
    return "最终结果必须是人物关系网，包含关键人物、彼此立场、利益、情感联系、隐藏动机、冲突点和剧情用途。";
  }
  if (role === "character_arc") {
    return "最终结果必须是角色线，包含主要角色在故事各阶段的目标变化、关系推进、冲突升级、关键转折和人物弧光。";
  }
  if (role === "scene") {
    return "最终结果必须是小说场景片段或桥段正文，重点是场景目标、人物行动、对白或旁白、冲突推进和结尾钩子。不要写成分镜。";
  }
  if (role === "script") {
    return "最终结果必须是剧本，包含场景、人物、动作、对白和镜头提示。";
  }
  if (role === "storyboard") {
    return "最终结果必须是分镜脚本，每个镜头包含画面、动作、对白或旁白、时长和生成提示词。";
  }
  if (role === "prompt") {
    return "最终结果必须是适合图像生成的提示词，包含主体、动作、场景、风格、构图、光线和负面限制。";
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
    const maxTokens = body.model.maxOutputTokens || 3000;
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
