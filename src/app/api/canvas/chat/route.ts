import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelGateway } from "@/services/model/gateway";
import { toCanvasTextGenerationErrorMessage } from "../lib/errors";
import {
  buildSingleModelGatewayConfig,
  canvasProviderSchema,
  canvasTextModelSchema,
} from "../lib/modelRequest";

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
  provider: canvasProviderSchema,
  model: canvasTextModelSchema,
});

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

    const gateway = new ModelGateway(buildSingleModelGatewayConfig({
      task: "canvas_chat",
      provider: body.provider,
      model: body.model,
    }));
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
    const message = toCanvasTextGenerationErrorMessage(error, "创作输入回复失败，请稍后重试。");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
