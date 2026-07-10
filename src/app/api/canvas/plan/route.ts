import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelGateway } from "@/services/model/gateway";
import {
  buildSingleModelGatewayConfig,
  canvasProviderSchema,
  canvasTextModelSchema,
} from "../lib/modelRequest";
import {
  listCanvasMemoriesForPlan,
  type CanvasMemoryRecord,
} from "@/lib/canvas-memory-store";
import { getCanvasOwnerId } from "@/lib/canvas-project-store";

const nodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  content: z.string().optional(),
  hasAsset: z.boolean(),
});

const edgeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

const requestSchema = z.object({
  prompt: z.string().min(1),
  projectId: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .default([]),
  nodes: z.array(nodeSchema).default([]),
  edges: z.array(edgeSchema).default([]),
  focusIds: z.array(z.string()).default([]),
  provider: canvasProviderSchema,
  model: canvasTextModelSchema,
});

const planSchema = z.object({
  mode: z.enum(["chat", "action"]).default("action"),
  intentType: z
    .enum(["create_asset", "modify_asset", "ask_question", "navigate_canvas", "unclear"])
    .default("unclear"),
  confidence: z.number().min(0).max(1).default(0.7),
  assetWorkflow: z
    .enum([
      "image",
      "video",
      "novel",
      "novel_chapter",
      "article",
      "character",
      "script",
      "storyboard",
      "novel_merge_updates",
      "consistency_check",
    ])
    .optional(),
  sourceIds: z.array(z.string()).default([]),
  createdSources: z
    .array(
      z.object({
        kind: z.literal("text"),
        content: z.string().min(1),
      }),
    )
    .default([]),
  outputKind: z.enum(["text", "image", "video", "audio"]).optional(),
  placement: z.enum(["update_current", "create_result"]).optional(),
  instruction: z.string().optional(),
  response: z.string().optional(),
  summary: z.string().optional(),
  needsClarification: z.boolean().default(false),
  question: z.string().optional(),
}).superRefine((value, context) => {
  if (value.mode === "chat") {
    if (!value.response?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["response"],
        message: "chat mode requires response",
      });
    }
    return;
  }

  if (!value.outputKind || !value.placement || !value.instruction?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "action mode requires outputKind, placement and instruction",
    });
  }
});

function summarizeMemoryContent(content: unknown): string {
  if (!content || typeof content !== "object") return "";

  const value = content as {
    title?: string;
    text?: string;
    items?: Array<{
      id?: string;
      kind?: string;
      title?: string;
      assetType?: string;
      assetStatus?: string;
      excerpt?: string;
    }>;
    assetCount?: number;
    nodeCount?: number;
    edgeCount?: number;
  };

  if (typeof value.text === "string") {
    return [
      value.title ? `标题=${value.title}` : "",
      value.text.slice(0, 1400),
    ].filter(Boolean).join("\n");
  }

  if (Array.isArray(value.items)) {
    const header = [
      typeof value.nodeCount === "number" ? `节点 ${value.nodeCount}` : "",
      typeof value.edgeCount === "number" ? `连线 ${value.edgeCount}` : "",
      typeof value.assetCount === "number" ? `资产 ${value.assetCount}` : "",
    ].filter(Boolean).join("，");
    const items = value.items
      .slice(0, 24)
      .map((item, index) =>
        [
          `${index + 1}. ${item.title || item.id || "未命名"}`,
          item.kind ? `kind=${item.kind}` : "",
          item.assetType ? `asset=${item.assetType}` : "",
          item.assetStatus ? `status=${item.assetStatus}` : "",
          item.excerpt ? `内容=${item.excerpt}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
      )
      .join("\n");

    return [header, items].filter(Boolean).join("\n");
  }

  return JSON.stringify(content).slice(0, 1600);
}

function buildMemoryText(memories: CanvasMemoryRecord[]): string {
  return memories
    .map((memory, index) =>
      [
        `${index + 1}. ${memory.title}`,
        `type=${memory.type}`,
        memory.sourceElementIds.length > 0
          ? `sourceElementIds=${memory.sourceElementIds.join(",")}`
          : "",
        summarizeMemoryContent(memory.content),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function buildPrompt(params: z.infer<typeof requestSchema> & {
  memories: CanvasMemoryRecord[];
}): string {
  const nodeText = params.nodes
    .map((node, index) => {
      const content = node.content?.trim();
      return [
        `${index + 1}. id=${node.id}`,
        `kind=${node.kind}`,
        `hasAsset=${node.hasAsset ? "yes" : "no"}`,
        content ? `content=${content}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
  const edgeText = params.edges
    .map((edge) => `${edge.sourceId} -> ${edge.targetId}`)
    .join("\n");
  const focusText = params.focusIds.length > 0 ? params.focusIds.join(", ") : "";
  const historyText = params.history
    .slice(-8)
    .map((message) => `${message.role === "user" ? "用户" : "大脑"}：${message.content}`)
    .join("\n");
  const memoryText = buildMemoryText(params.memories);

  return [
    "你是 CreativeOS 自由画布的大脑。你负责根据整个画布的素材状态和用户目标，选择参与节点，并给出下一步执行计划。",
    "先判断用户是在普通对话还是要求操作画布。普通对话、解释、建议、确认、闲聊、询问能力、讨论方案时，返回 mode=chat，并在 response 中直接中文回复，不要创建或修改画布。",
    "只有用户明确要求创建、生成、修改、删除、整理、导入、连接、更新画布素材时，才返回 mode=action。",
    "同时返回 intentType 和 confidence。intentType 只能是 create_asset、modify_asset、ask_question、navigate_canvas、unclear。",
    "如果无法判断用户要做什么，返回 mode=chat、intentType=unclear、confidence 低于 0.65，并用 response 简短追问。",
    "如果用户只是问普通问题或外部问题，返回 mode=chat、intentType=ask_question，不要写入画布。",
    "如果用户要求生成图片、视频、音频或文本素材，不要在 chat response 中声称已经生成、已完成或已放到画布上，必须返回 mode=action 交给执行器处理。",
    "如果 action 需要启动一个多节点资产链，返回 assetWorkflow：生图=image，视频=video，小说基础设定=novel，小说章节=novel_chapter，文章=article，角色=character，剧本=script，分镜=storyboard，合并小说章节后的增量更新=novel_merge_updates，一致性检查=consistency_check。",
    "assetWorkflow 只用于明确创作、生成、检查素材时；用户只是问流程、问概念、问建议时不要返回 assetWorkflow，应该返回 mode=chat。",
    "没有选中素材时，如果用户明确要求生成图片、视频、小说、章节、文章、角色、剧本或分镜，优先使用 assetWorkflow 让执行器生成对应资产链。",
    "选中素材时，如果用户要求修改、润色、扩写、改写或基于当前素材生成新版本，一般不要返回 assetWorkflow，使用通用 action 即可；一致性检查例外，可以返回 consistency_check。",
    "summary 和 question 必须使用中文，语气简短直接。",
    "instruction 和 summary 是给用户与执行器看的自然语言，不要出现 schema 字段名或内部实现词，例如 createdSources、sourceIds、outputKind、placement。",
    "用户当前输入可能是对你上一轮澄清问题的简短回答。必须结合对话历史重建完整目标，不要只根据当前一句话重新提问。",
    "如果历史中已经有素材内容、主体、目标产物等信息，后续用户的短回答应当补全这些信息并继续执行。",
    "如果用户说“生图、生成图片、画出来、参考这张图”等，应判断 outputKind=image；如果说“生成视频、动起来”等，应判断 outputKind=video；如果说“润色、扩写、改写、写剧本、想提示词”等，应判断 outputKind=text。",
    "不要询问用户想创建什么类型的素材，除非用户目标完全没有表达产物类型且上下文也无法推断。",
    "决策优先级：如果用户没有明确选择节点，应优先使用连线关系判断上下文；同一连通关系内的节点优先于全画布搜索。",
    "focusIds 是用户当前明确选中或上传给大脑的重点素材。除非用户明确排除，否则它们优先作为 sourceIds 参与本次计划。",
    "sourceIds 应该选择真正参与这次操作的素材节点。多个 sourceIds 表示这些素材共同参与。",
    "项目记忆是长期上下文，只用于理解用户意图和选择相关素材；不要把项目记忆当成用户当前明确要求。",
    "如果项目记忆显示某些设定、角色、章节或资产已经存在，应优先复用或基于它们生成新版本，不要无视既有内容重新开始。",
    "如果用户目标里同时包含可作为素材保存的内容和要生成的目标，但画布中没有合适来源节点，应在 createdSources 中创建 text 素材，content 填入要保存的素材正文。",
    "如果有多个互不相连的候选素材组都可能符合用户目标，不要猜，设置 needsClarification=true 并给出简短 question。",
    "只有缺少执行所必需的信息时才澄清；如果用户已经通过历史对话补充了缺失变量，应直接计划执行。",
    "action 模式下，outputKind 是最终要得到的素材类型，只能是 text、image、video、audio。",
    "action 模式下，placement 表示结果位置。修改已有素材用 update_current；需要保留素材并产生新结果用 create_result；如果没有有效素材承接，可以 update_current 到新建文本素材。",
    nodeText ? `画布节点：\n${nodeText}` : "画布为空。",
    edgeText ? `节点关系：\n${edgeText}` : "没有节点关系。",
    memoryText ? `项目记忆：\n${memoryText}` : "没有项目记忆。",
    focusText ? `当前重点素材 id：${focusText}` : "没有当前重点素材。",
    historyText ? `最近对话：\n${historyText}` : "没有最近对话。",
    `用户目标：\n${params.prompt}`,
    "只返回符合 schema 的 JSON。",
  ].join("\n\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text
    .replace(/^```json?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error("规划模型没有返回 JSON。");
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
}

async function requestPlanWithChatFallback(params: {
  gateway: ModelGateway;
  prompt: string;
  maxTokens: number;
}) {
  const result = await params.gateway.chat({
    task: "canvas_plan",
    messages: [
      {
        role: "system",
        content:
          "你是 CreativeOS 自由画布的大脑。必须只输出一个 JSON 对象，不要 Markdown，不要解释。",
      },
      {
        role: "user",
        content: `${params.prompt}\n\nJSON schema: { mode: 'chat'|'action', intentType: 'create_asset'|'modify_asset'|'ask_question'|'navigate_canvas'|'unclear', confidence: number, assetWorkflow?: 'image'|'video'|'novel'|'novel_chapter'|'article'|'character'|'script'|'storyboard'|'novel_merge_updates'|'consistency_check', response?: string, sourceIds: string[], createdSources: Array<{ kind: 'text', content: string }>, outputKind?: 'text'|'image'|'video'|'audio', placement?: 'update_current'|'create_result', instruction?: string, summary?: string, needsClarification?: boolean, question?: string }`,
      },
    ],
    temperature: 0,
    maxTokens: params.maxTokens,
  });

  return planSchema.parse(extractJsonObject(result.content));
}

function sanitizePlannerError(error: unknown): string {
  if (!(error instanceof Error)) return "画布规划失败";

  const message = error.message
    .replace(/prov_[A-Za-z0-9]+:/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/All JSON generation models failed/i.test(message)) {
    const reason = message.match(/Reasons:\s*(.+)$/)?.[1];
    if (reason) return reason.replace(/^.*?:\s*/, "");
    return "创作输入没有返回可用规划，请重试或切换文本模型。";
  }

  return message || "画布规划失败";
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    if (!body.model.capabilities.includes("text")) {
      return NextResponse.json(
        { error: "请选择文本模型后再发送。" },
        { status: 400 },
      );
    }

    const gateway = new ModelGateway(buildSingleModelGatewayConfig({
      task: "canvas_plan",
      provider: body.provider,
      model: body.model,
    }));
    const ownerId = await getCanvasOwnerId();
    const memories = await listCanvasMemoriesForPlan({
      ownerId,
      projectId: body.projectId || null,
      query: body.prompt,
      focusIds: body.focusIds,
    });
    const prompt = buildPrompt({ ...body, memories });

    try {
      const result = await gateway.generateJson({
        task: "canvas_plan",
        schema: planSchema,
        schemaDescription:
          "{ mode: 'chat'|'action', intentType: 'create_asset'|'modify_asset'|'ask_question'|'navigate_canvas'|'unclear', confidence: number, assetWorkflow?: 'image'|'video'|'novel'|'novel_chapter'|'article'|'character'|'script'|'storyboard'|'novel_merge_updates'|'consistency_check', response?: string, sourceIds: string[], createdSources: Array<{ kind: 'text', content: string }>, outputKind?: 'text'|'image'|'video'|'audio', placement?: 'update_current'|'create_result', instruction?: string, summary?: string, needsClarification?: boolean, question?: string }",
        systemPrompt: "你是 CreativeOS 自由画布的大脑，只输出 JSON。",
        prompt,
        temperature: 0,
        maxTokens: 800,
      });

      return NextResponse.json(result.data);
    } catch (jsonError) {
      console.warn(
        `[CanvasPlan] Structured JSON planning failed, falling back to chat JSON parsing: ${
          jsonError instanceof Error ? jsonError.message : String(jsonError)
        }`,
      );
      const fallbackPlan = await requestPlanWithChatFallback({
        gateway,
        prompt,
        maxTokens: 800,
      });

      return NextResponse.json(fallbackPlan);
    }
  } catch (error) {
    const message = sanitizePlannerError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
