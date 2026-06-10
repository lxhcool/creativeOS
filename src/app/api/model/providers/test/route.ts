import { NextResponse } from "next/server";
import type {
  DiscoveredModel,
  ModelKind,
  ProviderType,
} from "@/types/provider";

interface TestProviderRequest {
  id?: string;
  name?: string;
  type?: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  kind?: ModelKind;
}

interface OpenAIModel {
  id?: string;
  name?: string;
  display_name?: string;
  output_modalities?: string[];
  architecture?: {
    output_modalities?: string[];
  };
}

interface AnthropicModel {
  id?: string;
  display_name?: string;
}

interface GoogleModel {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (/^https:\/\/api\.deepseek\.com\/v1$/i.test(trimmed)) {
    return "https://api.deepseek.com";
  }

  return trimmed;
}

function getKnownCompatibleModels(params: {
  id?: string;
  name?: string;
  baseUrl: string;
  kind: ModelKind;
}): DiscoveredModel[] {
  if (params.kind !== "text") return [];

  const key =
    `${params.id || ""} ${params.name || ""} ${params.baseUrl}`.toLowerCase();

  if (key.includes("deepseek") || key.includes("api.deepseek.com")) {
    return [
      {
        modelName: "deepseek-chat",
        displayName: "deepseek-chat",
        capabilities: ["text", "json", "tool_calling"],
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
      {
        modelName: "deepseek-reasoner",
        displayName: "deepseek-reasoner",
        capabilities: ["text", "json"],
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
    ];
  }

  if (
    key.includes("siliconflow") ||
    key.includes("siliconflow.cn") ||
    key.includes("硅基")
  ) {
    return [
      {
        modelName: "deepseek-ai/DeepSeek-V3",
        displayName: "DeepSeek-V3",
        capabilities: ["text", "json", "tool_calling"],
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
      {
        modelName: "deepseek-ai/DeepSeek-R1",
        displayName: "DeepSeek-R1",
        capabilities: ["text", "json"],
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
      {
        modelName: "Qwen/Qwen3-235B-A22B",
        displayName: "Qwen3-235B-A22B",
        capabilities: ["text", "json", "tool_calling"],
        contextWindow: 32768,
        maxOutputTokens: 8192,
      },
    ];
  }

  return [];
}

function buildModelRequest(params: {
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  kind: ModelKind;
}): {
  url: string;
  headers: HeadersInit;
} {
  switch (params.type) {
    case "anthropic":
      return {
        url: joinUrl(params.baseUrl, "models"),
        headers: {
          "x-api-key": params.apiKey,
          "anthropic-version": "2023-06-01",
        },
      };
    case "google":
      return {
        url: `${joinUrl(params.baseUrl, "models")}?key=${encodeURIComponent(params.apiKey)}`,
        headers: {},
      };
    case "openrouter":
      return {
        url:
          params.kind === "video"
            ? joinUrl(params.baseUrl, "videos/models")
            : `${joinUrl(params.baseUrl, "models")}${
                params.kind === "image"
                  ? "?output_modalities=image"
                  : ""
              }`,
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
        },
      };
    case "openai":
    case "litellm":
    case "openai_compatible":
    default:
      return {
        url: joinUrl(params.baseUrl, "models"),
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
        },
      };
  }
}

function normalizeModelName(value: string): string {
  return value.toLowerCase().replace(/[\s._-]+/g, "-");
}

function hasAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function inferKindFromModelName(modelName: string): ModelKind | "embedding" | undefined {
  const normalized = normalizeModelName(modelName);

  if (
    hasAny(normalized, [
      "embedding",
      "embed",
      "text-embedding",
      "bge-",
      "e5-",
      "jina-embeddings",
    ])
  ) {
    return "embedding";
  }

  if (
    hasAny(normalized, [
      "dall-e",
      "gpt-image",
      "imagen",
      "image",
      "flux",
      "stable-diffusion",
      "sdxl",
      "midjourney",
    ])
  ) {
    return "image";
  }

  if (
    hasAny(normalized, [
      "video",
      "sora",
      "veo",
      "kling",
      "runway",
      "luma",
      "wan-",
    ])
  ) {
    return "video";
  }

  return undefined;
}

function modelMatchesKind(modelName: string, modalities: string[] | undefined, kind: ModelKind): boolean {
  const normalizedModalities = modalities?.map((entry) => entry.toLowerCase());
  if (normalizedModalities?.length) {
    return normalizedModalities.includes(kind);
  }

  const inferredKind = inferKindFromModelName(modelName);
  if (kind === "text") {
    return inferredKind !== "image" && inferredKind !== "video" && inferredKind !== "embedding";
  }

  return inferredKind === kind;
}

function inferCapabilities(
  providerType: ProviderType,
  modelName: string,
  methods?: string[],
): string[] {
  if (providerType === "google") {
    const canGenerate = methods?.some((method) =>
      method.toLowerCase().includes("generate"),
    );
    return canGenerate ? ["text", "json", "vision"] : ["text"];
  }

  if (modelName.includes("embedding")) {
    return ["embedding"];
  }

  const capabilities = ["text", "json"];
  if (!modelName.includes("deepseek-reasoner")) {
    capabilities.push("tool_calling");
  }
  if (
    modelName.includes("vision") ||
    modelName.includes("gpt-4o") ||
    modelName.includes("claude") ||
    modelName.includes("gemini")
  ) {
    capabilities.push("vision");
  }

  return Array.from(new Set(capabilities));
}

function normalizeOpenAIModels(
  providerType: ProviderType,
  models: OpenAIModel[],
  kind: ModelKind,
): DiscoveredModel[] {
  return models
    .filter((model) => {
      const modalities =
        model.output_modalities || model.architecture?.output_modalities;
      return model.id && modelMatchesKind(model.id, modalities, kind);
    })
    .map((model) => ({
      id: model.id,
      displayName: model.name || model.display_name || model.id,
    }))
    .filter((model): model is { id: string; displayName: string } =>
      Boolean(model.id),
    )
    .map(({ id, displayName }) => ({
      modelName: id,
      displayName,
      capabilities:
        kind === "text" ? inferCapabilities(providerType, id) : [kind],
      contextWindow: id.startsWith("deepseek") ? 65536 : undefined,
      maxOutputTokens: id.startsWith("deepseek") ? 8192 : undefined,
    }));
}

function normalizeAnthropicModels(
  models: AnthropicModel[],
  kind: ModelKind,
): DiscoveredModel[] {
  if (kind !== "text") return [];

  return models
    .filter((model) => model.id)
    .map((model) => ({
      modelName: model.id!,
      displayName: model.display_name || model.id,
      capabilities: inferCapabilities("anthropic", model.id!),
      contextWindow: 200000,
    }));
}

function normalizeGoogleModels(
  models: GoogleModel[],
  kind: ModelKind,
): DiscoveredModel[] {
  return models
    .filter((model) => model.name)
    .filter((model) => modelMatchesKind(model.name!, undefined, kind))
    .map((model) => {
      const modelName = model.name!.replace(/^models\//, "");
      return {
        modelName,
        displayName: model.displayName || modelName,
        capabilities: inferCapabilities(
          "google",
          modelName,
          model.supportedGenerationMethods,
        ),
        contextWindow: model.inputTokenLimit,
        maxOutputTokens: model.outputTokenLimit,
      };
    });
}

function normalizeModels(
  providerType: ProviderType,
  data: unknown,
  kind: ModelKind,
): DiscoveredModel[] {
  if (!data || typeof data !== "object") return [];

  const payload = data as {
    data?: unknown;
    models?: unknown;
  };

  if (providerType === "google" && Array.isArray(payload.models)) {
    return normalizeGoogleModels(payload.models as GoogleModel[], kind);
  }

  if (providerType === "anthropic" && Array.isArray(payload.data)) {
    return normalizeAnthropicModels(payload.data as AnthropicModel[], kind);
  }

  if (Array.isArray(payload.data)) {
    return normalizeOpenAIModels(
      providerType,
      payload.data as OpenAIModel[],
      kind,
    );
  }

  return [];
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = (await request.json()) as TestProviderRequest;
    const kind = body.kind || "text";

    if (!body.type || !body.baseUrl || !body.apiKey) {
      return NextResponse.json(
        {
          success: false,
          latencyMs: Date.now() - startedAt,
          modelsFound: 0,
          error: "供应商类型、接口地址和 API Key 都必须填写",
        },
        { status: 400 },
      );
    }

    const { url, headers } = buildModelRequest({
      type: body.type,
      baseUrl: normalizeBaseUrl(body.baseUrl),
      apiKey: body.apiKey,
      kind,
    });

    const response = await fetch(url, {
      headers,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    const text = await response.text();

    if (!response.ok) {
      const fallbackModels = getKnownCompatibleModels({
        id: body.id,
        name: body.name,
        baseUrl: body.baseUrl,
        kind,
      });

      if (fallbackModels.length > 0) {
        return NextResponse.json({
          success: true,
          latencyMs,
          modelsFound: fallbackModels.length,
          models: fallbackModels,
          warning: "供应商没有开放模型列表接口，已使用内置模型清单",
        });
      }

      return NextResponse.json({
        success: false,
        latencyMs,
        modelsFound: 0,
        error: `HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`,
      });
    }

    const data = text ? JSON.parse(text) : {};
    const models = normalizeModels(body.type, data, kind);
    const fallbackModels =
      models.length === 0
        ? getKnownCompatibleModels({
            id: body.id,
            name: body.name,
            baseUrl: body.baseUrl,
            kind,
          })
        : [];

    return NextResponse.json({
      success: true,
      latencyMs,
      modelsFound: models.length || fallbackModels.length,
      models: models.length > 0 ? models : fallbackModels,
      warning:
        models.length === 0 && fallbackModels.length > 0
          ? "供应商返回的模型列表为空，已使用内置模型清单"
          : models.length === 0
            ? "接口可访问，但没有返回可选择的模型"
            : undefined,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      latencyMs: Date.now() - startedAt,
      modelsFound: 0,
      error: error instanceof Error ? error.message : "连接失败",
    });
  }
}
