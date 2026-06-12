import defaultConfig from "./providers.config.json";
import type { ModelGatewayConfig, ModelProviderConfig } from "./types";
import {
  getProviderSupportedKinds,
  type UserModel,
  type UserProvider,
  type UserRoutingRule,
} from "@/types/provider";

export function mergeProviderSettings(
  persistedProviders: UserProvider[],
  persistedModels: Record<string, UserModel[]>,
): {
  providers: UserProvider[];
  models: Record<string, UserModel[]>;
} {
  const providers = persistedProviders.map((provider) =>
    normalizeRuntimeProviderState({ ...provider, isBuiltIn: false }),
  );
  const models = Object.fromEntries(
    providers.map((provider) => [
      provider.id,
      (persistedModels[provider.id] || []).map((model) => ({
      ...model,
      kind: model.kind || "text",
      })),
    ]),
  );

  return { providers, models };
}

function normalizeRuntimeProviderState(provider: UserProvider): UserProvider {
  const nextProvider: UserProvider = {
    ...provider,
    supportedKinds: getProviderSupportedKinds(provider),
  };

  if (provider.apiKey.trim().length > 0) {
    return nextProvider;
  }

  return {
    ...nextProvider,
    enabled: false,
  };
}

function toProviderConfig(
  provider: UserProvider,
  models: UserModel[],
): ModelProviderConfig {
  return {
    id: provider.id,
    type:
      provider.type === "litellm" || provider.type === "openrouter"
        ? "openai_compatible"
        : provider.type,
    enabled: provider.enabled,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey || undefined,
    models: models
      .filter((model) => model.enabled)
      .map((model) => ({
        id: model.modelName,
        capabilities: model.capabilities as ModelProviderConfig["models"][number]["capabilities"],
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        costPer1kInput: model.costPer1kInput,
        costPer1kOutput: model.costPer1kOutput,
        endpoint: model.endpoint,
        options: model.options,
      })),
  };
}

export function buildGatewayConfigFromSettings(params: {
  providers: UserProvider[];
  models: Record<string, UserModel[]>;
  routingRules: UserRoutingRule[];
}): ModelGatewayConfig {
  const baseConfig = structuredClone(defaultConfig) as ModelGatewayConfig;

  const providers = params.providers
    .filter((provider) => provider.enabled && provider.apiKey.trim().length > 0)
    .map((provider) => toProviderConfig(provider, params.models[provider.id] || []))
    .filter((provider) => provider.models.length > 0);

  const routing: ModelGatewayConfig["routing"] = { ...baseConfig.routing };

  for (const rule of params.routingRules) {
    routing[rule.taskType] = [rule.primaryRef, ...rule.fallbackRefs];
  }

  return {
    providers,
    routing,
  };
}
