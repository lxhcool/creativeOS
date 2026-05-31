/**
 * Model Gateway configuration loader.
 *
 * Reads providers.config.json and environment variables to build
 * the complete gateway configuration. No provider SDK code here.
 */

import type { ModelGatewayConfig } from "./types";
import defaultConfig from "./providers.config.json";

let cachedConfig: ModelGatewayConfig | null = null;

/**
 * Load the model gateway configuration.
 * Merges providers.config.json with environment variable overrides.
 */
export function loadGatewayConfig(): ModelGatewayConfig {
  if (cachedConfig) return cachedConfig;

  const config = structuredClone(defaultConfig) as ModelGatewayConfig;

  config.providers = config.providers.filter((provider) => {
    const apiKey =
      provider.apiKey ||
      (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : "");

    if (!apiKey && provider.enabled) {
      if (process.env["NODE_ENV"] !== "production") {
        console.warn(
          `[ModelGateway] Provider "${provider.id}" is enabled but no API key is available. Disabling.`,
        );
      }
      return false;
    }

    return provider.enabled && !!apiKey;
  });

  cachedConfig = config;
  return config;
}

/**
 * Reset cached config (useful for testing or hot-reload).
 */
export function resetGatewayConfig(): void {
  cachedConfig = null;
}

/**
 * Get a specific provider config by ID.
 */
export function getProviderConfig(
  providerId: string,
): ModelGatewayConfig["providers"][number] | undefined {
  const config = loadGatewayConfig();
  return config.providers.find((provider) => provider.id === providerId);
}

/**
 * Resolve a model reference string ("providerId:modelId") to its config entries.
 */
export function resolveModelRef(
  ref: string,
): { provider: ModelGatewayConfig["providers"][number]; modelId: string } | null {
  const colonIndex = ref.indexOf(":");
  if (colonIndex === -1) return null;

  const providerId = ref.slice(0, colonIndex);
  const modelId = ref.slice(colonIndex + 1);

  const provider = getProviderConfig(providerId);
  if (!provider) return null;

  const model = provider.models.find((entry) => entry.id === modelId);
  if (!model) return null;

  return { provider, modelId };
}

/**
 * Get the routing table, with the global fallback merged in.
 */
export function getRoutingTable(config?: ModelGatewayConfig): Record<string, string[]> {
  const currentConfig = config ?? loadGatewayConfig();
  const routing: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(currentConfig.routing)) {
    if (Array.isArray(value)) {
      routing[key] = value;
    } else if (typeof value === "string") {
      routing[key] = [value];
    }
  }

  return routing;
}

/**
 * Get the global fallback chain.
 */
export function getFallbackChain(config?: ModelGatewayConfig): string[] {
  const currentConfig = config ?? loadGatewayConfig();
  return (currentConfig.routing["fallback"] as string[]) || [];
}
