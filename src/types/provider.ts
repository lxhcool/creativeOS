/**
 * 大模型配置中心的 UI 类型定义。
 */

export type ModelCapabilityUI =
  | "text"
  | "tool_calling"
  | "json"
  | "vision"
  | "embedding"
  | "streaming"
  | "image"
  | "video";

export type ModelKind = "text" | "video" | "image";

export const ALL_MODEL_KINDS: ModelKind[] = ["text", "video", "image"];

export const MODEL_KIND_LABELS: Record<ModelKind, string> = {
  text: "文本模型",
  video: "视频模型",
  image: "图像模型",
};

export const MODEL_KIND_DESCRIPTIONS: Record<ModelKind, string> = {
  text: "用于对话、规划、JSON 结构化输出和工具调用",
  video: "用于视频生成、视频编辑和动态素材生成",
  image: "用于图片生成和视觉素材生成",
};

export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "litellm"
  | "openrouter"
  | "openai_compatible";

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  google: "Google Gemini",
  litellm: "LiteLLM Gateway",
  openrouter: "OpenRouter",
  openai_compatible: "OpenAI 兼容接口",
};

export const PROVIDER_TYPE_DESCRIPTIONS: Record<ProviderType, string> = {
  openai: "适用于 GPT 系列模型",
  anthropic: "适用于 Claude 系列模型",
  google: "适用于 Gemini 系列模型",
  litellm: "推荐：通过自托管 LiteLLM 统一接入各类供应商和私有模型",
  openrouter: "通过一个 API 接入文本、图像和视频模型",
  openai_compatible: "适用于 DeepSeek、Ollama、通义千问、vLLM 等兼容接口",
};

export const PROVIDER_DEFAULT_URLS: Record<ProviderType, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  litellm: "http://localhost:4000/v1",
  openrouter: "https://openrouter.ai/api/v1",
  openai_compatible: "",
};

export interface UserProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  supportedKinds?: ModelKind[];
  apiKey: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  isBuiltIn: boolean;
}

export interface UserModel {
  id: string;
  providerId: string;
  kind: ModelKind;
  modelName: string;
  displayName?: string;
  capabilities: string[];
  contextWindow: number;
  maxOutputTokens: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  enabled: boolean;
  endpoint?: string;
  options?: string;
}

export interface UserRoutingRule {
  taskType: string;
  label: string;
  primaryRef: string;
  fallbackRefs: string[];
}

export interface UserDefaultModel {
  kind: ModelKind;
  modelRef: string;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  modelsFound: number;
  models?: DiscoveredModel[];
  warning?: string;
  error?: string;
}

export interface DiscoveredModel {
  modelName: string;
  displayName?: string;
  capabilities: string[];
  contextWindow?: number;
  maxOutputTokens?: number;
}

export function inferModelKind(params: {
  modelName: string;
  displayName?: string;
  capabilities?: string[];
  fallback?: ModelKind;
}): ModelKind {
  const name = `${params.modelName} ${params.displayName || ""}`.toLowerCase();
  const capabilities = params.capabilities || [];

  if (
    /\b(sora|veo|kling|runway|gen-?3|luma|pika|hailuo)\b/i.test(name) ||
    /\bvideo\b|text-to-video|image-to-video|i2v|t2v/i.test(name)
  ) {
    return "video";
  }

  if (
    /gpt-image|dall[-_ ]?e|dalle|imagen|flux|stable[-_ ]?diffusion|sdxl|midjourney|image[-_ ]?gen|text-to-image|t2i/i.test(
      name,
    )
  ) {
    return "image";
  }

  if (capabilities.includes("video")) return "video";
  if (capabilities.includes("image") && !capabilities.includes("text")) {
    return "image";
  }
  if (
    /\b(claude|deepseek|gpt|gemini|qwen|llama|mistral|yi|glm|doubao|moonshot|kimi)\b/i.test(
      name,
    )
  ) {
    return "text";
  }

  return params.fallback || "text";
}

export function normalizeModelCapabilities(params: {
  kind: ModelKind;
  capabilities?: string[];
}): string[] {
  if (params.kind === "image") return ["image"];
  if (params.kind === "video") return ["video"];

  const capabilities = params.capabilities?.filter(Boolean) || [];
  const next = new Set(capabilities.length > 0 ? capabilities : ["text", "json"]);
  next.add("text");
  return Array.from(next);
}

export function inferProviderSupportedKinds(params: {
  type: ProviderType;
  name?: string;
  baseUrl?: string;
}): ModelKind[] {
  if (isOfficialDeepSeekConnection(params)) {
    return ["text"];
  }

  switch (params.type) {
    case "anthropic":
    case "google":
    case "openai_compatible":
      return ["text"];
    case "openai":
      return ["text", "image"];
    case "litellm":
    case "openrouter":
      return [...ALL_MODEL_KINDS];
    default:
      return ["text"];
  }
}

export function getProviderSupportedKinds(
  provider: Pick<UserProvider, "type" | "name" | "baseUrl" | "supportedKinds">,
): ModelKind[] {
  const explicitKinds = normalizeSupportedKinds(provider.supportedKinds);
  if (explicitKinds.length > 0) {
    return explicitKinds;
  }

  return inferProviderSupportedKinds(provider);
}

function normalizeSupportedKinds(kinds?: ModelKind[]): ModelKind[] {
  if (!Array.isArray(kinds)) return [];

  return ALL_MODEL_KINDS.filter((kind) => kinds.includes(kind));
}

function isOfficialDeepSeekConnection(params: {
  type: ProviderType;
  name?: string;
  baseUrl?: string;
}): boolean {
  if (params.type !== "openai_compatible") return false;

  const normalizedBaseUrl = params.baseUrl?.trim().replace(/\/+$/, "") || "";
  const normalizedName = params.name?.toLowerCase() || "";

  return (
    /^https:\/\/api\.deepseek\.com(?:\/v1)?$/i.test(normalizedBaseUrl) ||
    normalizedName.includes("deepseek")
  );
}
