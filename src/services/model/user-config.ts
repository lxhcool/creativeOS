import defaultConfig from "./providers.config.json";
import type { ModelGatewayConfig, ModelProviderConfig } from "./types";
import {
  PROVIDER_TYPE_LABELS,
  type UserModel,
  type UserProvider,
  type UserRoutingRule,
} from "@/types/provider";

function createStableId(prefix: string, value: string): string {
  return `${prefix}_${value.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function getProviderDisplayName(
  provider: ModelGatewayConfig["providers"][number],
): string {
  return provider.name || PROVIDER_TYPE_LABELS[provider.type] || provider.id;
}

export function getBuiltInProviderSettings(): {
  providers: UserProvider[];
  models: Record<string, UserModel[]>;
} {
  const config = structuredClone(defaultConfig) as ModelGatewayConfig;
  const providers: UserProvider[] = config.providers.map((provider) => ({
    id: provider.id,
    name: getProviderDisplayName(provider),
    type: provider.type,
    baseUrl: provider.baseUrl,
    apiKey: "",
    enabled: provider.enabled,
    createdAt: "",
    updatedAt: "",
    isBuiltIn: true,
  }));

  const models: Record<string, UserModel[]> = {};

  for (const provider of config.providers) {
    models[provider.id] = provider.models.map((model) => ({
      id: createStableId("builtin_model", `${provider.id}_${model.id}`),
      providerId: provider.id,
      modelName: model.id,
      displayName: model.id,
      capabilities: [...model.capabilities],
      contextWindow: model.contextWindow || 65536,
      maxOutputTokens: model.maxOutputTokens || 4096,
      costPer1kInput: model.costPer1kInput,
      costPer1kOutput: model.costPer1kOutput,
      enabled: true,
    }));
  }

  return { providers, models };
}

export function mergeProviderSettings(
  persistedProviders: UserProvider[],
  persistedModels: Record<string, UserModel[]>,
): {
  providers: UserProvider[];
  models: Record<string, UserModel[]>;
} {
  const { providers: builtInProviders, models: builtInModels } =
    getBuiltInProviderSettings();

  const persistedProviderMap = new Map(
    persistedProviders.map((provider) => [provider.id, provider]),
  );

  const mergedProviders = builtInProviders.map(
    (provider) => persistedProviderMap.get(provider.id) || provider,
  );

  for (const provider of persistedProviders) {
    if (!mergedProviders.some((entry) => entry.id === provider.id)) {
      mergedProviders.push(provider);
    }
  }

  const mergedModels: Record<string, UserModel[]> = {};
  const providerIds = new Set([
    ...Object.keys(builtInModels),
    ...Object.keys(persistedModels),
  ]);

  for (const providerId of providerIds) {
    const persisted = persistedModels[providerId] || [];
    const builtIn = builtInModels[providerId] || [];

    if (persisted.length > 0) {
      const persistedByName = new Map(
        persisted.map((model) => [model.modelName, model]),
      );
      const merged = builtIn.map(
        (model) => persistedByName.get(model.modelName) || model,
      );

      for (const model of persisted) {
        if (!merged.some((entry) => entry.modelName === model.modelName)) {
          merged.push(model);
        }
      }

      mergedModels[providerId] = merged;
      continue;
    }

    mergedModels[providerId] = builtIn;
  }

  return { providers: mergedProviders, models: mergedModels };
}

function toProviderConfig(
  provider: UserProvider,
  models: UserModel[],
): ModelProviderConfig {
  return {
    id: provider.id,
    type: provider.type,
    enabled: provider.enabled,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey || undefined,
    apiKeyEnv: provider.isBuiltIn ? `${provider.id.toUpperCase()}_API_KEY` : undefined,
    models: models
      .filter((model) => model.enabled)
      .map((model) => ({
        id: model.modelName,
        capabilities: model.capabilities as ModelProviderConfig["models"][number]["capabilities"],
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        costPer1kInput: model.costPer1kInput,
        costPer1kOutput: model.costPer1kOutput,
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
    .filter((provider) => provider.enabled)
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
