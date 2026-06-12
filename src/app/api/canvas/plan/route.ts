import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelGateway } from "@/services/model/gateway";
import type { ModelGatewayConfig } from "@/services/model/types";

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
  provider: providerSchema,
  model: modelSchema,
});

const planSchema = z.object({
  mode: z.enum(["chat", "action"]).default("action"),
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

function toRuntimeProviderType(type: z.infer<typeof providerSchema>["type"]) {
  return type === "litellm" || type === "openrouter" ? "openai_compatible" : type;
}

function buildPrompt(params: z.infer<typeof requestSchema>): string {
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

  return [
    "你是 CreativeOS 自由画布的大脑。你负责根据整个画布的素材状态和用户目标，选择参与节点，并给出下一步执行计划。",
    "先判断用户是在普通对话还是要求操作画布。普通对话、解释、建议、确认、闲聊、询问能力、讨论方案时，返回 mode=chat，并在 response 中直接中文回复，不要创建或修改画布。",
    "只有用户明确要求创建、生成、修改、删除、整理、导入、连接、更新画布素材时，才返回 mode=action。",
    "如果用户要求生成图片、视频、音频或文本素材，不要在 chat response 中声称已经生成、已完成或已放到画布上，必须返回 mode=action 交给执行器处理。",
    "summary 和 question 必须使用中文，语气简短直接。",
    "instruction 和 summary 是给用户与执行器看的自然语言，不要出现 schema 字段名或内部实现词，例如 createdSources、sourceIds、outputKind、placement。",
    "用户当前输入可能是对你上一轮澄清问题的简短回答。必须结合对话历史重建完整目标，不要只根据当前一句话重新提问。",
    "如果历史中已经有素材内容、主体、目标产物等信息，后续用户的短回答应当补全这些信息并继续执行。",
    "如果用户说“生图、生成图片、画出来、参考这张图”等，应判断 outputKind=image；如果说“生成视频、动起来”等，应判断 outputKind=video；如果说“润色、扩写、改写、写剧本、想提示词”等，应判断 outputKind=text。",
    "不要询问用户想创建什么类型的素材，除非用户目标完全没有表达产物类型且上下文也无法推断。",
    "决策优先级：如果用户没有明确选择节点，应优先使用连线关系判断上下文；同一连通关系内的节点优先于全画布搜索。",
    "focusIds 是用户当前明确选中或上传给大脑的重点素材。除非用户明确排除，否则它们优先作为 sourceIds 参与本次计划。",
    "sourceIds 应该选择真正参与这次操作的素材节点。多个 sourceIds 表示这些素材共同参与。",
    "如果用户目标里同时包含可作为素材保存的内容和要生成的目标，但画布中没有合适来源节点，应在 createdSources 中创建 text 素材，content 填入要保存的素材正文。",
    "如果有多个互不相连的候选素材组都可能符合用户目标，不要猜，设置 needsClarification=true 并给出简短 question。",
    "只有缺少执行所必需的信息时才澄清；如果用户已经通过历史对话补充了缺失变量，应直接计划执行。",
    "action 模式下，outputKind 是最终要得到的素材类型，只能是 text、image、video、audio。",
    "action 模式下，placement 表示结果位置。修改已有素材用 update_current；需要保留素材并产生新结果用 create_result；如果没有有效素材承接，可以 update_current 到新建文本素材。",
    nodeText ? `画布节点：\n${nodeText}` : "画布为空。",
    edgeText ? `节点关系：\n${edgeText}` : "没有节点关系。",
    focusText ? `当前重点素材 id：${focusText}` : "没有当前重点素材。",
    historyText ? `最近对话：\n${historyText}` : "没有最近对话。",
    `用户目标：\n${params.prompt}`,
    "只返回符合 schema 的 JSON。",
  ].join("\n\n");
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
        canvas_plan: [`${body.provider.id}:${body.model.modelName}`],
      },
    };

    const gateway = new ModelGateway(config);
    const result = await gateway.generateJson({
      task: "canvas_plan",
      schema: planSchema,
      schemaDescription:
        "{ mode: 'chat'|'action', response?: string, sourceIds: string[], createdSources: Array<{ kind: 'text', content: string }>, outputKind?: 'text'|'image'|'video'|'audio', placement?: 'update_current'|'create_result', instruction?: string, summary?: string, needsClarification?: boolean, question?: string }",
      systemPrompt: "你是 CreativeOS 自由画布的大脑，只输出 JSON。",
      prompt: buildPrompt(body),
      temperature: 0,
      maxTokens: 800,
    });

    return NextResponse.json(result.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "画布规划失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
