/** Capability tags for model feature detection */
export type ModelCapability = "text" | "tool_calling" | "json" | "vision" | "embedding" | "streaming";

/** A single model within a provider */
export interface ModelEntry {
  id: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
  maxOutputTokens?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

/** A model provider configuration */
export interface ModelProviderConfig {
  id: string;
  name?: string;
  type: "openai" | "anthropic" | "google" | "openai_compatible";
  enabled: boolean;
  baseUrl: string;
  apiKeyEnv?: string;
  /** Optional explicit API key, typically supplied by user-managed settings. */
  apiKey?: string;
  models: ModelEntry[];
}

/** Top-level gateway configuration */
export interface ModelGatewayConfig {
  providers: ModelProviderConfig[];
  routing: {
    [taskName: string]: string | string[];
  };
}

/** Priority: used in routing fallback chains */
export type ModelRef = `${string}:${string}`;
