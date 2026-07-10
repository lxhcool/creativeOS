import { z } from "zod";
import type { ModelGatewayConfig } from "@/services/model/types";

export const canvasProviderSchema = z.object({
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

export const canvasTextModelSchema = z.object({
  kind: z.literal("text"),
  modelName: z.string().min(1),
  capabilities: z.array(z.string()).default(["text"]),
  contextWindow: z.number().optional(),
  maxOutputTokens: z.number().optional(),
});

export const canvasImageModelSchema = z.object({
  kind: z.literal("image"),
  modelName: z.string().min(1),
  capabilities: z.array(z.string()).default(["image"]),
  endpoint: z.string().optional(),
  options: z.string().optional(),
});

export const canvasVideoModelSchema = z.object({
  kind: z.literal("video"),
  modelName: z.string().min(1),
  capabilities: z.array(z.string()).default(["video"]),
  endpoint: z.string().optional(),
  options: z.string().optional(),
});

export type CanvasProviderInput = z.infer<typeof canvasProviderSchema>;
export type CanvasTextModelInput = z.infer<typeof canvasTextModelSchema>;
export type CanvasImageModelInput = z.infer<typeof canvasImageModelSchema>;
export type CanvasVideoModelInput = z.infer<typeof canvasVideoModelSchema>;

export function toRuntimeProviderType(
  type: CanvasProviderInput["type"],
): ModelGatewayConfig["providers"][number]["type"] {
  return type === "litellm" || type === "openrouter" ? "openai_compatible" : type;
}

export function getModelRef(provider: CanvasProviderInput, modelName: string): string {
  return `${provider.id}:${modelName}`;
}

export function buildSingleModelGatewayConfig(params: {
  task: string;
  provider: CanvasProviderInput;
  model:
    | CanvasTextModelInput
    | CanvasImageModelInput
    | CanvasVideoModelInput;
}): ModelGatewayConfig {
  return {
    providers: [
      {
        id: params.provider.id,
        name: params.provider.id,
        type: toRuntimeProviderType(params.provider.type),
        enabled: true,
        baseUrl: params.provider.baseUrl.replace(/\/+$/, ""),
        apiKey: params.provider.apiKey,
        models: [
          {
            id: params.model.modelName,
            capabilities: params.model.capabilities as ModelGatewayConfig["providers"][number]["models"][number]["capabilities"],
            contextWindow:
              "contextWindow" in params.model ? params.model.contextWindow : undefined,
            maxOutputTokens:
              "maxOutputTokens" in params.model ? params.model.maxOutputTokens : undefined,
            endpoint: "endpoint" in params.model ? params.model.endpoint : undefined,
            options: "options" in params.model ? params.model.options : undefined,
          },
        ],
      },
    ],
    routing: {
      [params.task]: [getModelRef(params.provider, params.model.modelName)],
    },
  };
}
