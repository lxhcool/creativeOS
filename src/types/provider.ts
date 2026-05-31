/**
 * 大模型配置中心的 UI 类型定义。
 */

export type ModelCapabilityUI =
  | "text"
  | "tool_calling"
  | "json"
  | "vision"
  | "embedding"
  | "streaming";

export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "openai_compatible";

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  google: "Google Gemini",
  openai_compatible: "OpenAI 兼容接口",
};

export const PROVIDER_TYPE_DESCRIPTIONS: Record<ProviderType, string> = {
  openai: "适用于 GPT 系列模型",
  anthropic: "适用于 Claude 系列模型",
  google: "适用于 Gemini 系列模型",
  openai_compatible: "适用于 DeepSeek、Ollama、通义千问、vLLM 等兼容接口",
};

export const PROVIDER_DEFAULT_URLS: Record<ProviderType, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  openai_compatible: "",
};

export interface UserProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  isBuiltIn: boolean;
}

export interface UserModel {
  id: string;
  providerId: string;
  modelName: string;
  displayName?: string;
  capabilities: string[];
  contextWindow: number;
  maxOutputTokens: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  enabled: boolean;
}

export interface UserRoutingRule {
  taskType: string;
  label: string;
  primaryRef: string;
  fallbackRefs: string[];
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
