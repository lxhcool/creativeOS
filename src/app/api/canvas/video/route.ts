import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelGateway } from "@/services/model/gateway";
import type { ModelGatewayConfig } from "@/services/model/types";
import { toCanvasGenerationErrorMessage } from "../lib/errors";

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
  kind: z.literal("video"),
  modelName: z.string().min(1),
  capabilities: z.array(z.string()).default(["video"]),
  endpoint: z.string().optional(),
  options: z.string().optional(),
});

const requestSchema = z.object({
  prompt: z.string().min(1),
  provider: providerSchema,
  model: modelSchema,
});

function toRuntimeProviderType(type: z.infer<typeof providerSchema>["type"]) {
  return type === "litellm" || type === "openrouter" ? "openai_compatible" : type;
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const modelRef = `${body.provider.id}:${body.model.modelName}`;
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
              endpoint: body.model.endpoint,
              options: body.model.options,
            },
          ],
        },
      ],
      routing: {
        canvas_video: [modelRef],
      },
    };

    const gateway = new ModelGateway(config);
    const result = await gateway.generateVideo({
      task: "canvas_video",
      prompt: body.prompt,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = toCanvasGenerationErrorMessage(error, "video");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
