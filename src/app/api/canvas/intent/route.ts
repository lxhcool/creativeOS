import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelGateway } from "@/services/model/gateway";
import { toCanvasTextGenerationErrorMessage } from "../lib/errors";
import {
  buildSingleModelGatewayConfig,
  canvasProviderSchema,
  canvasTextModelSchema,
} from "../lib/modelRequest";

const sourceSchema = z.object({
  kind: z.string(),
  text: z.string().optional(),
  prompt: z.string().optional(),
  label: z.string().optional(),
});

const requestSchema = z.object({
  prompt: z.string().min(1),
  current: sourceSchema.optional(),
  provider: canvasProviderSchema,
  model: canvasTextModelSchema,
  sources: z.array(sourceSchema).default([]),
});

const intentSchema = z.object({
  outputKind: z.enum(["text", "image", "video", "audio"]),
  placement: z.enum(["update_current", "create_result"]),
  instruction: z.string().min(1),
  reason: z.string().optional(),
});

function contentOf(source: z.infer<typeof sourceSchema>): string {
  return source.text || source.prompt || source.label || "";
}

function buildPrompt(params: z.infer<typeof requestSchema>): string {
  const currentContent = params.current ? contentOf(params.current) : "";
  const sourceText = params.sources
    .map((source, index) => {
      const content = contentOf(source);
      return content ? `${index + 1}. [${source.kind}] ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");

  return [
    "你是 CreativeOS 自由画布的意图识别器。你的任务是根据用户指令、当前节点和上游节点，判断这次操作要产出什么类型的节点，以及结果应该写回当前节点还是创建新结果节点。",
    "画布不是固定工作流。节点是素材，连线只是来源或引用关系。不要根据关键词机械判断，要理解用户真实意图。",
    "outputKind 表示这次操作最终要得到的素材类型，只能是 text、image、video、audio。",
    "placement 表示结果写入位置。修改当前素材时使用 update_current；需要保留当前素材并产生新素材时使用 create_result。当前节点没有可保留内容时，可以 update_current。",
    currentContent ? `当前节点：\n[${params.current?.kind}] ${currentContent}` : "当前节点为空或没有文本内容。",
    sourceText ? `上游节点：\n${sourceText}` : "没有上游节点。",
    `用户指令：\n${params.prompt}`,
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

    const gateway = new ModelGateway(buildSingleModelGatewayConfig({
      task: "canvas_intent",
      provider: body.provider,
      model: body.model,
    }));
    const result = await gateway.generateJson({
      task: "canvas_intent",
      schema: intentSchema,
      schemaDescription:
        "{ outputKind: 'text'|'image'|'video'|'audio', placement: 'update_current'|'create_result', instruction: string, reason?: string }",
      systemPrompt: "你是 CreativeOS 自由画布的意图识别器，只输出 JSON。",
      prompt: buildPrompt(body),
      temperature: 0,
      maxTokens: 600,
    });

    return NextResponse.json(result.data);
  } catch (error) {
    const message = toCanvasTextGenerationErrorMessage(error, "意图识别失败，请稍后重试。");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
