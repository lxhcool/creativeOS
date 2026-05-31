/**
 * Model Gateway — unified type definitions.
 *
 * Business code NEVER imports from provider-specific SDKs.
 * All LLM interaction goes through these types and the ModelGateway class.
 */

// Re-export schema types for convenience
// Import first for internal use, then re-export
import type {
  ModelCapability as _ModelCapability,
  ModelEntry as _ModelEntry,
  ModelProviderConfig as _ModelProviderConfig,
  ModelGatewayConfig as _ModelGatewayConfig,
} from "../../../schemas/model-provider.schema";
import type {
  ModelRoutingTable as _ModelRoutingTable,
  RoutingRule as _RoutingRule,
  TaskType as _TaskType,
} from "../../../schemas/model-routing.schema";
import type { ModelCallLog as _ModelCallLog } from "../../../schemas/model-call-log.schema";

export type ModelCapability = _ModelCapability;
export type ModelEntry = _ModelEntry;
export type ModelProviderConfig = _ModelProviderConfig;
export type ModelGatewayConfig = _ModelGatewayConfig;
export type ModelRoutingTable = _ModelRoutingTable;
export type RoutingRule = _RoutingRule;
export type TaskType = _TaskType;
export type ModelCallLog = _ModelCallLog;

// ─── Unified Chat Interface ──────────────────────────────────────

/** A single chat message */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | MultimodalContent[];
}

export interface MultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "low" | "high" };
}

/** Standardized chat input */
export interface ChatInput {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

/** Standardized chat output */
export interface ChatOutput {
  content: string;
  usage: TokenUsage;
  finishReason: "stop" | "length" | "tool_calls" | "error";
  modelId: string;
  providerId: string;
}

/** Structured JSON generation input */
export interface JsonInput<T = unknown> {
  prompt: string;
  systemPrompt?: string;
  schema: { parse: (v: unknown) => T; safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } };
  schemaDescription: string;
  temperature?: number;
  maxTokens?: number;
}

/** Structured JSON output */
export interface JsonOutput<T = unknown> {
  data: T;
  usage: TokenUsage;
  modelId: string;
  providerId: string;
}

/** Embedding input */
export interface EmbedInput {
  texts: string[];
  model?: string;
}

/** Embedding output */
export interface EmbedOutput {
  embeddings: number[][];
  usage: TokenUsage;
  modelId: string;
}

/** Token usage statistics */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Streaming chunk */
export interface ChatChunk {
  content: string;
  finishReason: "stop" | "length" | "tool_calls" | "error" | null;
}

// ─── ModelProvider Interface ─────────────────────────────────────

/**
 * The unified ModelProvider interface.
 *
 * Every LLM provider (OpenAI, Claude, Gemini, DeepSeek, Ollama, etc.)
 * MUST implement this interface. Business code NEVER calls provider
 * methods directly — it goes through ModelGateway.
 */
export interface ModelProvider {
  /** Unique provider identifier */
  readonly id: string;

  /** Provider display name */
  readonly name: string;

  /** List available models for this provider */
  listModels(): ModelEntry[];

  /** Standard chat completion */
  chat(modelId: string, input: ChatInput, signal?: AbortSignal): Promise<ChatOutput>;

  /** Streaming chat completion (optional) */
  stream?(modelId: string, input: ChatInput, signal?: AbortSignal): AsyncIterable<ChatChunk>;

  /** Structured JSON generation (optional, falls back to chat + parse) */
  generateJson?<T>(modelId: string, input: JsonInput<T>, signal?: AbortSignal): Promise<JsonOutput<T>>;

  /** Text embeddings (optional) */
  embed?(modelId: string, input: EmbedInput, signal?: AbortSignal): Promise<EmbedOutput>;
}

/** Provider factory function */
export type ProviderFactory = (config: ModelProviderConfig) => ModelProvider;
