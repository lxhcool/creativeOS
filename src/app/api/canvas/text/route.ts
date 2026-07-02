import { NextResponse } from "next/server";
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

const requestSchema = z.object({
  prompt: z.string().min(1),
  current: sourceSchema.optional(),
  provider: providerSchema,
  model: modelSchema,
  sources: z.array(sourceSchema).default([]),
});

function toRuntimeProviderType(type: z.infer<typeof providerSchema>["type"]) {
  return type === "litellm" || type === "openrouter" ? "openai_compatible" : type;
}

function buildPrompt(params: z.infer<typeof requestSchema>): string {
  const currentContent = params.current
    ? params.current.text || params.current.prompt || params.current.label || ""
    : "";
  const sourceText = params.sources
    .map((source, index) => {
      const content = source.text || source.prompt || source.label || "";
      return `${index + 1}. [${source.kind}] ${content}`;
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return [
    "你正在为 CreativeOS 自由画布生成一个文本节点的正文结果。",
    "请严格执行用户指令，并结合当前节点内容和上游输入节点。",
    "输出应该是可以直接放进画布文本节点的正文，不要解释你的处理过程，不要写“以下是”。",
    "默认输出语言必须是中文。即使当前节点或上游节点是英文，也要转换为自然、可直接使用的中文结果；只有用户明确要求英文时才输出英文。",
    "如果指令是润色、改写、纠错或翻译，尽量保留原有信息结构；如果指令是剧本、小说、分镜、角色、Prompt 等创作任务，则输出结构清晰的创作素材。",
    currentContent ? `当前选中节点内容：\n${currentContent}` : "",
    sourceText ? `上游输入节点：\n${sourceText}` : "",
    `用户指令：\n${params.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
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
        canvas_text: [`${body.provider.id}:${body.model.modelName}`],
      },
    };

    const gateway = new ModelGateway(config);
    const result = await gateway.chat({
      task: "canvas_text",
      messages: [
        {
          role: "system",
          content:
            "你是 CreativeOS 画布里的文本创作助手。你擅长续写、润色、扩写、摘要、标题、剧本、小说、分镜、角色设定和生成提示词。输出必须可直接放回画布文本节点，默认中文，不要解释过程。",
        },
        {
          role: "user",
          content: buildPrompt(body),
        },
      ],
      temperature: 0.7,
      maxTokens: body.model.maxOutputTokens
        ? Math.min(body.model.maxOutputTokens, 4096)
        : 2048,
    });

    return NextResponse.json({
      content: result.content.trim(),
      modelId: result.modelId,
      providerId: result.providerId,
    });
  } catch (error) {
    const message = toCanvasTextGenerationErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
