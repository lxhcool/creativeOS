/**
 * ModelGateway — the SINGLE entry point for all LLM interaction.
 *
 * Business code NEVER imports from provider-specific modules.
 * It ONLY calls methods on ModelGateway.
 *
 * Usage:
 * ```ts
 * const gateway = getModelGateway();
 * const result = await gateway.generateJson({
 *   task: "create_character",
 *   schema: characterSchema,
 *   input: { name: "Archer" }
 * });
 * ```
 */

import type {
  ChatInput,
  JsonInput,
  TokenUsage,
} from "./types";
import { ModelRegistry } from "./registry";
import { ModelRouter } from "./router";
import { FallbackHandler } from "./fallback";
import { CostTracker } from "./cost-tracker";
import { loadGatewayConfig, getRoutingTable } from "./config";
import type { ModelGatewayConfig } from "./types";

export class ModelGateway {
  registry: ModelRegistry;
  router: ModelRouter;
  fallback: FallbackHandler;
  costTracker: CostTracker;

  private initialized = false;
  private config: ModelGatewayConfig;

  constructor(config?: ModelGatewayConfig) {
    this.config = config ?? loadGatewayConfig();
    this.registry = new ModelRegistry();
    this.router = new ModelRouter(getRoutingTable(this.config), this.registry);
    this.fallback = new FallbackHandler();
    this.costTracker = new CostTracker();

    this.init();
  }

  private init(): void {
    if (this.initialized) return;

    const enabledProviders = this.config.providers.filter((p) => p.enabled);
    this.registry.registerProviders(enabledProviders);

    if (enabledProviders.length === 0) {
      console.warn(
        "[ModelGateway] No model providers configured. All calls will fail.",
      );
    } else {
      console.log(
        `[ModelGateway] Initialized with ${this.registry.providerCount} provider(s), ${this.registry.modelCount} model(s).`,
      );
    }

    this.initialized = true;
  }

  // ─── High-Level API (Business code uses THESE) ─────────────────

  /**
   * Generate structured JSON output.
   * Routes to the best model for the task, with automatic fallback.
   */
  async generateJson<T>(params: {
    task: string;
    schema: JsonInput<T>["schema"];
    schemaDescription: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<{ data: T; modelId: string; providerId: string; usage: TokenUsage }> {
    const modelChain = this.router.route(params.task);

    if (modelChain.length === 0) {
      throw new Error(
        `No models available for task: ${params.task}. Configure providers in providers.config.json.`,
      );
    }

    const jsonInput: JsonInput<T> = {
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      schema: params.schema,
      schemaDescription: params.schemaDescription,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    };

    const { result, attemptedModels, successfulModel, totalLatencyMs } =
      await this.fallback.executeJsonWithFallback(
        modelChain,
        jsonInput,
        (ref, input, signal) => {
          const resolved = this.registry.resolveModel(ref);
          if (!resolved) throw new Error(`Model not found: ${ref}`);
          if (!resolved.provider.generateJson) {
            throw new Error(
              `Provider "${resolved.provider.id}" does not support generateJson`,
            );
          }
          return resolved.provider.generateJson(resolved.entry.id, input, signal);
        },
        params.signal,
      );

    // Record cost
    const resolved = this.registry.resolveModel(successfulModel);
    const entry = resolved?.entry;

    this.costTracker.record({
      providerId: result.providerId,
      modelId: result.modelId,
      taskType: params.task,
      latencyMs: totalLatencyMs,
      success: true,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      costPer1kInput: entry?.costPer1kInput,
      costPer1kOutput: entry?.costPer1kOutput,
      retryAttempt: attemptedModels.length - 1,
    });

    return {
      data: result.data,
      modelId: result.modelId,
      providerId: result.providerId,
      usage: result.usage,
    };
  }

  /**
   * Standard chat completion.
   */
  async chat(params: {
    task: string;
    messages: ChatInput["messages"];
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<{ content: string; modelId: string; providerId: string; usage: TokenUsage }> {
    const modelChain = this.router.route(params.task);

    const chatInput: ChatInput = {
      messages: params.messages,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    };

    const { result, attemptedModels, successfulModel, totalLatencyMs } =
      await this.fallback.executeWithFallback(
        modelChain,
        chatInput,
        (ref, input, signal) => {
          const resolved = this.registry.resolveModel(ref);
          if (!resolved) throw new Error(`Model not found: ${ref}`);
          return resolved.provider.chat(resolved.entry.id, input, signal);
        },
        params.signal,
      );

    const resolved = this.registry.resolveModel(successfulModel);
    const entry = resolved?.entry;

    this.costTracker.record({
      providerId: result.providerId,
      modelId: result.modelId,
      taskType: params.task,
      latencyMs: totalLatencyMs,
      success: true,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      costPer1kInput: entry?.costPer1kInput,
      costPer1kOutput: entry?.costPer1kOutput,
      retryAttempt: attemptedModels.length - 1,
    });

    return {
      content: result.content,
      modelId: result.modelId,
      providerId: result.providerId,
      usage: result.usage,
    };
  }

  /**
   * Get cost summary for display in settings/about.
   */
  getCostSummary(): {
    totalCost: number;
    byTask: Record<string, number>;
    byProvider: Record<string, number>;
    totalTokens: { prompt: number; completion: number; total: number };
    successRate: number;
    averageLatency: number;
  } {
    return {
      totalCost: this.costTracker.getTotalCost(),
      byTask: this.costTracker.getCostByTask(),
      byProvider: this.costTracker.getCostByProvider(),
      totalTokens: this.costTracker.getTotalTokens(),
      successRate: this.costTracker.getSuccessRate(),
      averageLatency: this.costTracker.getAverageLatency(),
    };
  }

  /**
   * Reload configuration at runtime for hot-swap.
   */
  reload(config?: ModelGatewayConfig): void {
    this.initialized = false;
    this.config = config ?? loadGatewayConfig();
    this.registry = new ModelRegistry();
    this.router = new ModelRouter(getRoutingTable(this.config), this.registry);
    this.init();
  }
}

// ─── Singleton ───────────────────────────────────────────────────

let instance: ModelGateway | null = null;

export function getModelGateway(): ModelGateway {
  if (!instance) {
    instance = new ModelGateway();
  }
  return instance;
}

export function resetModelGateway(): void {
  instance = null;
}
