/**
 * AI Provider Center Store.
 *
 * Manages user-configured providers and keeps the UI-facing settings model
 * separate from the runtime model gateway configuration.
 */

import { create } from "zustand";
import type {
  ConnectionTestResult,
  DiscoveredModel,
  ProviderType,
  UserModel,
  UserProvider,
  UserRoutingRule,
} from "@/types/provider";
import { PROVIDER_DEFAULT_URLS } from "@/types/provider";
import { generateId } from "@/lib/id";
import {
  deleteModel as dbDeleteModel,
  deleteProvider as dbDeleteProvider,
  deleteRoutingRule as dbDeleteRoutingRule,
  loadAllProviders,
  loadAllRoutingRules,
  loadModelsForProvider,
  saveModel,
  saveProvider,
  saveRoutingRule,
} from "@/services/db";
import { getModelGateway } from "@/services/model/gateway";
import {
  buildGatewayConfigFromSettings,
  mergeProviderSettings,
} from "@/services/model/user-config";

interface ProviderState {
  providers: UserProvider[];
  models: Record<string, UserModel[]>;
  routingRules: UserRoutingRule[];
  isLoaded: boolean;
  loadProviders: () => Promise<void>;
  addProvider: (params: {
    name: string;
    type: ProviderType;
    baseUrl?: string;
    apiKey: string;
  }) => Promise<UserProvider>;
  updateProvider: (id: string, updates: Partial<UserProvider>) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  setProviderEnabled: (id: string, enabled: boolean) => Promise<void>;
  addModel: (params: {
    providerId: string;
    modelName: string;
    displayName?: string;
    capabilities: string[];
    contextWindow?: number;
    maxOutputTokens?: number;
    costPer1kInput?: number;
    costPer1kOutput?: number;
  }) => Promise<UserModel>;
  updateModel: (id: string, updates: Partial<UserModel>) => Promise<void>;
  removeModel: (id: string) => Promise<void>;
  setModelEnabled: (id: string, enabled: boolean) => Promise<void>;
  saveRouting: (rule: UserRoutingRule) => Promise<void>;
  removeRouting: (taskType: string) => Promise<void>;
  testConnection: (providerId: string) => Promise<ConnectionTestResult>;
  syncToModelGateway: () => void;
}

function isBuiltInProviderId(id: string): boolean {
  return [
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "siliconflow",
    "ollama",
  ].includes(id);
}

function normalizeProviderBaseUrl(provider: Pick<UserProvider, "name" | "baseUrl">): string {
  const trimmed = provider.baseUrl.trim().replace(/\/+$/, "");
  const key = `${provider.name} ${trimmed}`.toLowerCase();

  if (
    key.includes("deepseek") &&
    /^https:\/\/api\.deepseek\.com\/v1$/i.test(trimmed)
  ) {
    return "https://api.deepseek.com";
  }

  return trimmed;
}

function findModelLocation(
  models: Record<string, UserModel[]>,
  modelId: string,
): { providerId: string; model: UserModel } | null {
  for (const [providerId, providerModels] of Object.entries(models)) {
    const model = providerModels.find((entry) => entry.id === modelId);
    if (model) {
      return { providerId, model };
    }
  }

  return null;
}

function toSyncedModels(
  providerId: string,
  currentModels: UserModel[],
  discoveredModels: DiscoveredModel[],
): UserModel[] {
  const nowByName = new Map(
    currentModels.map((model) => [model.modelName, model]),
  );
  const discoveredNames = new Set(
    discoveredModels.map((model) => model.modelName),
  );
  const synced = discoveredModels.map((model) => {
    const existing = nowByName.get(model.modelName);

    return {
      id: existing?.id || generateId("model"),
      providerId,
      modelName: model.modelName,
      displayName: model.displayName || existing?.displayName || model.modelName,
      capabilities:
        model.capabilities.length > 0
          ? model.capabilities
          : existing?.capabilities || ["text", "json"],
      contextWindow: model.contextWindow || existing?.contextWindow || 65536,
      maxOutputTokens: model.maxOutputTokens || existing?.maxOutputTokens || 4096,
      costPer1kInput: existing?.costPer1kInput,
      costPer1kOutput: existing?.costPer1kOutput,
      enabled: existing?.enabled ?? true,
    };
  });

  const manualModels = currentModels.filter(
    (model) => !discoveredNames.has(model.modelName),
  );

  return [...synced, ...manualModels];
}

export const useProviderStore = create<ProviderState>()((set, get) => ({
  providers: [],
  models: {},
  routingRules: [],
  isLoaded: false,

  loadProviders: async () => {
    const persistedProviders = await loadAllProviders();
    const persistedModels: Record<string, UserModel[]> = {};

    for (const provider of persistedProviders) {
      persistedModels[provider.id] = await loadModelsForProvider(provider.id);
    }

    const routingRules = await loadAllRoutingRules();
    const merged = mergeProviderSettings(persistedProviders, persistedModels);

    set({
      providers: merged.providers,
      models: merged.models,
      routingRules,
      isLoaded: true,
    });

    get().syncToModelGateway();
  },

  addProvider: async ({ name, type, baseUrl, apiKey }) => {
    const now = new Date().toISOString();
    const provider: UserProvider = {
      id: generateId("prov"),
      name,
      type,
      baseUrl: normalizeProviderBaseUrl({
        name,
        baseUrl: baseUrl || PROVIDER_DEFAULT_URLS[type],
      }),
      apiKey,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      isBuiltIn: false,
    };

    await saveProvider(provider);
    set((state) => ({
      providers: [...state.providers, provider],
      models: { ...state.models, [provider.id]: [] },
    }));

    return provider;
  },

  updateProvider: async (id, updates) => {
    const provider = get().providers.find((entry) => entry.id === id);
    if (!provider) return;

    const updated: UserProvider = {
      ...provider,
      ...updates,
      baseUrl:
        updates.baseUrl !== undefined || updates.name !== undefined
          ? normalizeProviderBaseUrl({
              name: updates.name || provider.name,
              baseUrl: updates.baseUrl || provider.baseUrl,
            })
          : provider.baseUrl,
      updatedAt: new Date().toISOString(),
    };

    await saveProvider(updated);

    set((state) => ({
      providers: state.providers.map((entry) =>
        entry.id === id ? updated : entry,
      ),
    }));
  },

  removeProvider: async (id) => {
    if (isBuiltInProviderId(id)) {
      await get().setProviderEnabled(id, false);
      return;
    }

    await dbDeleteProvider(id);

    set((state) => {
      const { [id]: removed, ...rest } = state.models;
      void removed;

      return {
        providers: state.providers.filter((provider) => provider.id !== id),
        models: rest,
      };
    });
  },

  setProviderEnabled: async (id, enabled) => {
    const provider = get().providers.find((entry) => entry.id === id);
    if (!provider) return;
    const nextEnabled = enabled && provider.apiKey.trim().length > 0;

    const updated: UserProvider = {
      ...provider,
      enabled: nextEnabled,
      updatedAt: new Date().toISOString(),
    };

    await saveProvider(updated);

    set((state) => ({
      providers: state.providers.map((entry) =>
        entry.id === id ? updated : entry,
      ),
    }));
  },

  addModel: async ({
    providerId,
    modelName,
    displayName,
    capabilities,
    contextWindow,
    maxOutputTokens,
    costPer1kInput,
    costPer1kOutput,
  }) => {
    const model: UserModel = {
      id: generateId("model"),
      providerId,
      modelName,
      displayName,
      capabilities,
      contextWindow: contextWindow || 65536,
      maxOutputTokens: maxOutputTokens || 4096,
      costPer1kInput,
      costPer1kOutput,
      enabled: true,
    };

    await saveModel(model);

    set((state) => ({
      models: {
        ...state.models,
        [providerId]: [...(state.models[providerId] || []), model],
      },
    }));

    return model;
  },

  updateModel: async (id, updates) => {
    const location = findModelLocation(get().models, id);
    if (!location) return;

    const updated: UserModel = {
      ...location.model,
      ...updates,
    };

    await saveModel(updated);

    set((state) => ({
      models: {
        ...state.models,
        [location.providerId]: (state.models[location.providerId] || []).map(
          (entry) => (entry.id === id ? updated : entry),
        ),
      },
    }));
  },

  removeModel: async (id) => {
    await dbDeleteModel(id);

    set((state) => {
      const nextModels: Record<string, UserModel[]> = {};

      for (const [providerId, providerModels] of Object.entries(state.models)) {
        nextModels[providerId] = providerModels.filter(
          (entry) => entry.id !== id,
        );
      }

      return { models: nextModels };
    });
  },

  setModelEnabled: async (id, enabled) => {
    const location = findModelLocation(get().models, id);
    if (!location) return;

    const updated: UserModel = {
      ...location.model,
      enabled,
    };

    await saveModel(updated);

    set((state) => ({
      models: {
        ...state.models,
        [location.providerId]: (state.models[location.providerId] || []).map(
          (entry) => (entry.id === id ? updated : entry),
        ),
      },
    }));
  },

  saveRouting: async (rule) => {
    await saveRoutingRule(rule);
    set((state) => ({
      routingRules: [
        ...state.routingRules.filter((entry) => entry.taskType !== rule.taskType),
        rule,
      ],
    }));
  },

  removeRouting: async (taskType) => {
    await dbDeleteRoutingRule(taskType);
    set((state) => ({
      routingRules: state.routingRules.filter(
        (entry) => entry.taskType !== taskType,
      ),
    }));
  },

  testConnection: async (providerId) => {
    const provider = get().providers.find((entry) => entry.id === providerId);
    if (!provider) {
      return {
        success: false,
        latencyMs: 0,
        modelsFound: 0,
        error: "未找到供应商",
      };
    }

    try {
      const normalizedBaseUrl = normalizeProviderBaseUrl(provider);
      if (normalizedBaseUrl !== provider.baseUrl) {
        await get().updateProvider(provider.id, { baseUrl: normalizedBaseUrl });
      }

      const response = await fetch("/api/model/providers/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: provider.id,
          name: provider.name,
          type: provider.type,
          baseUrl: normalizedBaseUrl,
          apiKey: provider.apiKey,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          latencyMs: 0,
          modelsFound: 0,
          error: `HTTP ${response.status}`,
        };
      }

      const result = (await response.json()) as ConnectionTestResult;

      if (!result.success || !result.models || result.models.length === 0) {
        return result;
      }

      const syncedModels = toSyncedModels(
        provider.id,
        get().models[provider.id] || [],
        result.models,
      );

      await Promise.all(syncedModels.map((model) => saveModel(model)));

      set((state) => ({
        models: {
          ...state.models,
          [provider.id]: syncedModels,
        },
      }));

      get().syncToModelGateway();

      return {
        ...result,
        modelsFound: syncedModels.length,
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: 0,
        modelsFound: 0,
        error: error instanceof Error ? error.message : "连接失败",
      };
    }
  },

  syncToModelGateway: () => {
    const gateway = getModelGateway();
    const state = get();

    gateway.reload(
      buildGatewayConfigFromSettings({
        providers: state.providers,
        models: state.models,
        routingRules: state.routingRules,
      }),
    );
  },
}));
