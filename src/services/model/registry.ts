/**
 * Model Registry — manages all model providers and their capabilities.
 *
 * The registry is the single source of truth for which models are available,
 * what capabilities they have, and how to instantiate their providers.
 */

import type { ModelProvider, ModelEntry, ModelCapability, ProviderFactory } from "./types";
import type { ModelProviderConfig } from "./types";
import { OpenAIProvider } from "./providers/OpenAIProvider";
import { ClaudeProvider } from "./providers/ClaudeProvider";
import { GeminiProvider } from "./providers/GeminiProvider";
import { OpenAICompatibleProvider } from "./providers/OpenAICompatibleProvider";

/** Provider factory mapping */
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  openai: (config) => new OpenAIProvider(config),
  anthropic: (config) => new ClaudeProvider(config),
  google: (config) => new GeminiProvider(config),
  openai_compatible: (config) => new OpenAICompatibleProvider(config),
};

export class ModelRegistry {
  private providers = new Map<string, ModelProvider>();
  private modelIndex = new Map<string, { provider: ModelProvider; entry: ModelEntry }>();

  /**
   * Register providers from configuration.
   */
  registerProviders(configs: ModelProviderConfig[]): void {
    for (const config of configs) {
      const factory = PROVIDER_FACTORIES[config.type];
      if (!factory) {
        console.warn(`[ModelRegistry] Unknown provider type: ${config.type} for "${config.id}"`);
        continue;
      }

      try {
        const provider = factory(config);
        this.providers.set(config.id, provider);

        // Index each model
        const modelRefs = provider.listModels();
        for (const entry of modelRefs) {
          const key = `${config.id}:${entry.id}`;
          this.modelIndex.set(key, { provider, entry });
        }
      } catch (err) {
        console.warn(`[ModelRegistry] Failed to register provider "${config.id}":`, err);
      }
    }
  }

  /**
   * Get a provider by its ID.
   */
  getProvider(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Resolve a model reference ("providerId:modelId") to its provider + entry.
   */
  resolveModel(ref: string): { provider: ModelProvider; entry: ModelEntry } | undefined {
    return this.modelIndex.get(ref);
  }

  /**
   * Find all models matching given capabilities.
   */
  findModelsByCapability(
    capabilities: ModelCapability[],
  ): Array<{ ref: string; provider: ModelProvider; entry: ModelEntry }> {
    const results: Array<{ ref: string; provider: ModelProvider; entry: ModelEntry }> = [];

    for (const [ref, info] of this.modelIndex) {
      const hasAll = capabilities.every((cap) =>
        info.entry.capabilities.includes(cap),
      );
      if (hasAll) {
        results.push({ ref, ...info });
      }
    }

    return results;
  }

  /**
   * List all registered model references.
   */
  listAllModels(): Array<{ ref: string; capabilities: ModelCapability[] }> {
    const results: Array<{ ref: string; capabilities: ModelCapability[] }> = [];
    for (const [ref, info] of this.modelIndex) {
      results.push({ ref, capabilities: info.entry.capabilities });
    }
    return results;
  }

  /**
   * Check if a model reference is registered.
   */
  hasModel(ref: string): boolean {
    return this.modelIndex.has(ref);
  }

  /**
   * Get the number of registered providers.
   */
  get providerCount(): number {
    return this.providers.size;
  }

  /**
   * Get the number of registered models.
   */
  get modelCount(): number {
    return this.modelIndex.size;
  }
}
