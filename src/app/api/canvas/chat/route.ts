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

const nodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  content: z.string().optional(),
  hasAsset: z.boolean(),
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
  focusIds: z.array(z.string()).default([]),
  provider: providerSchema,
  model: modelSchema,
});

function toRuntimeProviderType(type: z.infer<typeof providerSchema>["type"]) {
  return type === "litellm" || type === "openrouter" ? "openai_compatible" : type;
}

function buildContext(params: z.infer<typeof requestSchema>): string {
  const focusSet = new Set(params.focusIds);
  const nodeText = params.nodes
    .slice(0, 20)
    .map((node, index) => {
      const content = node.content?.trim();
      return [
        `${index + 1}. ${focusSet.has(node.id) ? "[当前关注] " : ""}${node.kind}`,
        node.hasAsset ? "有素材" : "无素材",
        content ? `内容：${content}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");

  return nodeText ? `当前画布素材：\n${nodeText}` : "当前画布为空。";
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
        canvas_chat: [`${body.provider.id}:${body.model.modelName}`],
      },
    };

    const gateway = new ModelGateway(config);
    const result = await gateway.chat({
      task: "canvas_chat",
      messages: [
        {
          role: "system",
          content:
            "你是 CreativeOS 自由画布的大脑。你可以正常对话、解释、给创作建议、分析画布素材。除非用户明确要求创建、修改、删除、生成素材，否则不要声称已经操作画布。默认使用中文，回复简洁但有帮助。",
        },
        {
          role: "user",
          content: [
            buildContext(body),
            body.history
              .slice(-8)
              .map((message) => `${message.role === "user" ? "用户" : "大脑"}：${message.content}`)
              .join("\n"),
            `用户这次说：\n${body.prompt}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      temperature: 0.7,
      maxTokens: body.model.maxOutputTokens
        ? Math.min(body.model.maxOutputTokens, 1600)
        : 1000,
    });

    return NextResponse.json({ content: result.content.trim() });
  } catch (error) {
    const message = toCanvasTextGenerationErrorMessage(error, "画布大脑回复失败，请稍后重试。");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
