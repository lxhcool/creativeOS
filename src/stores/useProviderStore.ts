/**
 * AI Provider Center Store.
 *
 * Manages user-configured providers and keeps the UI-facing settings model
 * separate from the runtime model gateway configuration.
 */

import { create } from "zustand";
import type {
  ConnectionTestResult,
  ModelKind,
  ProviderType,
  UserDefaultModel,
  UserModel,
  UserProvider,
  UserRoutingRule,
} from "@/types/provider";
import {
  getProviderSupportedKinds,
  PROVIDER_DEFAULT_URLS,
} from "@/types/provider";
import { generateId } from "@/lib/id";
import {
  deleteModel as dbDeleteModel,
  deleteDefaultModel as dbDeleteDefaultModel,
  deleteProvider as dbDeleteProvider,
  deleteRoutingRule as dbDeleteRoutingRule,
  loadAllDefaultModels,
  loadAllProviders,
  loadAllRoutingRules,
  loadModelsForProvider,
  saveDefaultModel,
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
  defaultModels: Record<ModelKind, string | undefined>;
  isLoaded: boolean;
  loadProviders: () => Promise<void>;
  addProvider: (params: {
    name: string;
    type: ProviderType;
    baseUrl?: string;
    supportedKinds: ModelKind[];
    apiKey: string;
  }) => Promise<UserProvider>;
  updateProvider: (id: string, updates: Partial<UserProvider>) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  setProviderEnabled: (id: string, enabled: boolean) => Promise<void>;
  addModel: (params: {
    providerId: string;
    kind: ModelKind;
    modelName: string;
    displayName?: string;
    capabilities: string[];
    contextWindow?: number;
    maxOutputTokens?: number;
    costPer1kInput?: number;
    costPer1kOutput?: number;
    endpoint?: string;
    options?: string;
  }) => Promise<UserModel>;
  updateModel: (id: string, updates: Partial<UserModel>) => Promise<void>;
  removeModel: (id: string) => Promise<void>;
  setModelEnabled: (id: string, enabled: boolean) => Promise<void>;
  setDefaultModel: (kind: ModelKind, modelRef: string | undefined) => Promise<void>;
  getDefaultModelConfig: (kind: ModelKind) => {
    provider: UserProvider;
    model: UserModel;
  } | null;
  saveRouting: (rule: UserRoutingRule) => Promise<void>;
  removeRouting: (taskType: string) => Promise<void>;
  testConnection: (
    providerId: string,
    kind?: ModelKind,
  ) => Promise<ConnectionTestResult>;
  syncToModelGateway: () => void;
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

function getModelRef(providerId: string, modelName: string): string {
  return `${providerId}:${modelName}`;
}

function toDefaultModelMap(defaults: UserDefaultModel[]): Record<ModelKind, string | undefined> {
  return defaults.reduce(
    (acc, entry) => {
      acc[entry.kind] = entry.modelRef;
      return acc;
    },
    { text: undefined, video: undefined, image: undefined } as Record<
      ModelKind,
      string | undefined
    >,
  );
}

export const useProviderStore = create<ProviderState>()((set, get) => ({
  providers: [],
  models: {},
  routingRules: [],
  defaultModels: { text: undefined, video: undefined, image: undefined },
  isLoaded: false,

  loadProviders: async () => {
    const persistedProviders = await loadAllProviders();
    const persistedModels: Record<string, UserModel[]> = {};

    for (const provider of persistedProviders) {
      persistedModels[provider.id] = await loadModelsForProvider(provider.id);
    }

    const routingRules = await loadAllRoutingRules();
    const defaultModels = await loadAllDefaultModels();
    const merged = mergeProviderSettings(persistedProviders, persistedModels);

    set({
      providers: merged.providers,
      models: merged.models,
      routingRules,
      defaultModels: toDefaultModelMap(defaultModels),
      isLoaded: true,
    });

    get().syncToModelGateway();
  },

  addProvider: async ({ name, type, baseUrl, supportedKinds, apiKey }) => {
    const now = new Date().toISOString();
    const provider: UserProvider = {
      id: generateId("prov"),
      name,
      type,
      baseUrl: normalizeProviderBaseUrl({
        name,
        baseUrl: baseUrl || PROVIDER_DEFAULT_URLS[type],
      }),
      supportedKinds: getProviderSupportedKinds({
        type,
        name,
        baseUrl: baseUrl || PROVIDER_DEFAULT_URLS[type],
        supportedKinds,
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
      supportedKinds: getProviderSupportedKinds({
        ...provider,
        ...updates,
      }),
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
    await dbDeleteProvider(id);

    set((state) => {
      const { [id]: removed, ...rest } = state.models;
      void removed;
      const defaultModels = { ...state.defaultModels };
      for (const kind of Object.keys(defaultModels) as ModelKind[]) {
        if (defaultModels[kind]?.startsWith(`${id}:`)) {
          defaultModels[kind] = undefined;
        }
      }

      return {
        providers: state.providers.filter((provider) => provider.id !== id),
        models: rest,
        defaultModels,
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
    kind,
    modelName,
    displayName,
    capabilities,
    contextWindow,
    maxOutputTokens,
    costPer1kInput,
    costPer1kOutput,
    endpoint,
    options,
  }) => {
    const model: UserModel = {
      id: generateId("model"),
      providerId,
      kind,
      modelName,
      displayName,
      capabilities,
      contextWindow: contextWindow || 65536,
      maxOutputTokens: maxOutputTokens || 4096,
      costPer1kInput,
      costPer1kOutput,
      enabled: true,
      endpoint,
      options,
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

    const oldRef = getModelRef(location.providerId, location.model.modelName);
    const newRef = getModelRef(location.providerId, updated.modelName);
    const defaultKind = (location.model.kind || "text") as ModelKind;
    if (get().defaultModels[defaultKind] === oldRef && oldRef !== newRef) {
      await saveDefaultModel({ kind: updated.kind || defaultKind, modelRef: newRef });
    }

    set((state) => ({
      models: {
        ...state.models,
        [location.providerId]: (state.models[location.providerId] || []).map(
          (entry) => (entry.id === id ? updated : entry),
        ),
      },
      defaultModels:
        state.defaultModels[defaultKind] === oldRef && oldRef !== newRef
          ? {
              ...state.defaultModels,
              [defaultKind]: undefined,
              [updated.kind || defaultKind]: newRef,
            }
          : state.defaultModels,
    }));
  },

  removeModel: async (id) => {
    const location = findModelLocation(get().models, id);

    if (location) {
      const ref = getModelRef(location.providerId, location.model.modelName);
      const defaultKinds = Object.entries(get().defaultModels)
        .filter(([, modelRef]) => modelRef === ref)
        .map(([kind]) => kind as ModelKind);

      await Promise.all(
        defaultKinds.map((kind) => dbDeleteDefaultModel(kind)),
      );
    }

    await dbDeleteModel(id);

    set((state) => {
      const nextModels: Record<string, UserModel[]> = {};

      for (const [providerId, providerModels] of Object.entries(state.models)) {
        nextModels[providerId] = providerModels.filter(
          (entry) => entry.id !== id,
        );
      }

      const nextDefaults = { ...state.defaultModels };
      if (location) {
        const ref = getModelRef(location.providerId, location.model.modelName);
        for (const kind of Object.keys(nextDefaults) as ModelKind[]) {
          if (nextDefaults[kind] === ref) {
            nextDefaults[kind] = undefined;
          }
        }
      }

      return { models: nextModels, defaultModels: nextDefaults };
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

  setDefaultModel: async (kind, modelRef) => {
    if (!modelRef) {
      await dbDeleteDefaultModel(kind);
      set((state) => ({
        defaultModels: { ...state.defaultModels, [kind]: undefined },
      }));
      return;
    }

    await saveDefaultModel({ kind, modelRef });
    set((state) => ({
      defaultModels: { ...state.defaultModels, [kind]: modelRef },
    }));
  },

  getDefaultModelConfig: (kind) => {
    const state = get();
    const modelRef = state.defaultModels[kind];
    if (!modelRef) return null;

    const [providerId, ...modelNameParts] = modelRef.split(":");
    if (!providerId) return null;
    const modelName = modelNameParts.join(":");
    const provider = state.providers.find((entry) => entry.id === providerId);
    const model = (state.models[providerId] || []).find(
      (entry) => entry.modelName === modelName && entry.kind === kind,
    );

    if (!provider || !model || !provider.enabled || !model.enabled) {
      return null;
    }

    return { provider, model };
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

  testConnection: async (providerId, kind = "text") => {
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
          kind,
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

      return result;
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
