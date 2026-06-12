import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelGateway } from "@/services/model/gateway";
import type { ModelGatewayConfig } from "@/services/model/types";
import { toCanvasGenerationErrorMessage } from "../lib/errors";

export const maxDuration = 900;

const providerSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "openai",
    "litellm",
    "openrouter",
    "openai_compatible",
  ]),
  baseUrl: z.string().min(1),
  apiKey: z.string().optional(),
});

const modelSchema = z.object({
  kind: z.literal("image"),
  modelName: z.string().min(1),
  capabilities: z.array(z.string()).default(["image"]),
  endpoint: z.string().optional(),
  options: z.string().optional(),
});

const promptModelSchema = z.object({
  kind: z.literal("text"),
  modelName: z.string().min(1),
  capabilities: z.array(z.string()).default(["text"]),
  contextWindow: z.number().optional(),
  maxOutputTokens: z.number().optional(),
});

const requestSchema = z.object({
  prompt: z.string().min(1),
  referenceImageUrls: z.array(z.string().min(1)).default([]),
  provider: providerSchema,
  model: modelSchema,
  promptProvider: providerSchema.optional(),
  promptModel: promptModelSchema.optional(),
});

function toRuntimeProviderType(type: z.infer<typeof providerSchema>["type"]) {
  return type === "litellm" || type === "openrouter" ? "openai_compatible" : type;
}

type ImageRouteBody = z.infer<typeof requestSchema>;

function buildProviderConfigs(body: ImageRouteBody): ModelGatewayConfig["providers"] {
  const providerMap = new Map<string, ModelGatewayConfig["providers"][number]>();

  const upsertProvider = (
    provider: z.infer<typeof providerSchema>,
    model: ModelGatewayConfig["providers"][number]["models"][number],
  ) => {
    const existing = providerMap.get(provider.id);
    if (existing) {
      existing.models.push(model);
      return;
    }

    providerMap.set(provider.id, {
      id: provider.id,
      name: provider.id,
      type: toRuntimeProviderType(provider.type),
      enabled: true,
      baseUrl: provider.baseUrl.replace(/\/+$/, ""),
      apiKey: provider.apiKey,
      models: [model],
    });
  };

  upsertProvider(body.provider, {
    id: body.model.modelName,
    capabilities: body.model.capabilities as ModelGatewayConfig["providers"][number]["models"][number]["capabilities"],
    endpoint: body.model.endpoint,
    options: body.model.options,
  });

  if (body.promptProvider && body.promptModel) {
    upsertProvider(body.promptProvider, {
      id: body.promptModel.modelName,
      capabilities: body.promptModel.capabilities as ModelGatewayConfig["providers"][number]["models"][number]["capabilities"],
      contextWindow: body.promptModel.contextWindow,
      maxOutputTokens: body.promptModel.maxOutputTokens,
    });
  }

  return Array.from(providerMap.values());
}

async function buildImagePromptFromReferences(params: {
  gateway: ModelGateway;
  prompt: string;
  referenceImageUrls: string[];
  task: string;
  maxTokens?: number;
}): Promise<string> {
  if (params.referenceImageUrls.length === 0) return params.prompt;

  const result = await params.gateway.chat({
    task: params.task,
    messages: [
      {
        role: "system",
        content:
          "你是 CreativeOS 的视觉提示词设计师。你需要阅读用户指令和参考图，把它们整理成一段可直接交给图片生成模型的中文提示词。必须保留参考图里的角色外观、发型、发饰、服饰、配色和构图要点，但不要输出解释过程。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "请根据参考图和用户要求，生成最终图片生成提示词。",
              "要求：",
              "1. 输出必须是中文。",
              "2. 只输出最终提示词，不要 Markdown，不要解释。",
              "3. 明确描述参考图中需要保留的视觉特征。",
              "4. 保留用户的负面要求和禁止项。",
              `用户要求：${params.prompt}`,
            ].join("\n"),
          },
          ...params.referenceImageUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ],
      },
    ],
    temperature: 0.35,
    maxTokens: params.maxTokens ? Math.min(params.maxTokens, 1800) : 1800,
  });

  const refinedPrompt = result.content.trim();
  return refinedPrompt || params.prompt;
}

function shouldFallbackToPromptRefinement(error: unknown): boolean {
  if (!(error instanceof Error)) return true;

  const message = error.message;
  if (/insufficient_user_quota|额度不足|quota/i.test(message)) return false;
  if (/unauthorized|forbidden|invalid_api_key|incorrect api key|401|403/i.test(message)) {
    return false;
  }
  if (/model_not_found|No available channel|not found/i.test(message)) return false;

  return true;
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const modelRef = `${body.provider.id}:${body.model.modelName}`;
    const promptModelRef =
      body.promptProvider && body.promptModel
        ? `${body.promptProvider.id}:${body.promptModel.modelName}`
        : undefined;
    const config: ModelGatewayConfig = {
      providers: buildProviderConfigs(body),
      routing: {
        canvas_image: [modelRef],
        ...(promptModelRef ? { canvas_image_prompt: [promptModelRef] } : {}),
      },
    };

    const gateway = new ModelGateway(config);
    try {
      const result = await gateway.generateImage({
        task: "canvas_image",
        prompt: body.prompt,
        options: {
          referenceImageUrls: body.referenceImageUrls,
        },
      });

      return NextResponse.json(result);
    } catch (directError) {
      if (
        !promptModelRef ||
        body.referenceImageUrls.length === 0 ||
        !shouldFallbackToPromptRefinement(directError)
      ) {
        throw directError;
      }

      console.warn(
        `[CanvasImage] Native reference image generation failed, falling back to prompt refinement: ${
          directError instanceof Error ? directError.message : String(directError)
        }`,
      );

      const refinedPrompt = await buildImagePromptFromReferences({
        gateway,
        prompt: body.prompt,
        referenceImageUrls: body.referenceImageUrls,
        task: "canvas_image_prompt",
        maxTokens: body.promptModel?.maxOutputTokens,
      });
      const fallbackResult = await gateway.generateImage({
        task: "canvas_image",
        prompt: refinedPrompt,
        options: {
          referenceImageUrls: [],
        },
      });

      return NextResponse.json(fallbackResult);
    }
  } catch (error) {
    const message = toCanvasGenerationErrorMessage(error, "image");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
