/**
 * Model Gateway — barrel export.
 *
 * This is the ONLY module that business code should import for LLM interaction.
 *
 * Usage: import `getModelGateway` here instead of reaching into providers.
 */

// Gateway (main entry point)
export { ModelGateway, getModelGateway, resetModelGateway } from "./gateway";

// Core components (for advanced usage)
export { ModelRegistry } from "./registry";
export { ModelRouter } from "./router";
export { FallbackHandler } from "./fallback";
export { CostTracker } from "./cost-tracker";

// Config
export { loadGatewayConfig, resetGatewayConfig } from "./config";

// All types
export type {
  ModelProvider,
  ChatInput,
  ChatOutput,
  ChatChunk,
  JsonInput,
  JsonOutput,
  ImageInput,
  ImageOutput,
  VideoInput,
  VideoOutput,
  EmbedInput,
  EmbedOutput,
  TokenUsage,
  ChatMessage,
  MultimodalContent,
  ProviderFactory,
} from "./types";

export type {
  ModelCapability,
  ModelEntry,
  ModelProviderConfig,
  ModelGatewayConfig,
} from "./types";

export type {
  ModelRoutingTable,
  RoutingRule,
  TaskType,
} from "./types";

export type { ModelCallLog } from "./types";
