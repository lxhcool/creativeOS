"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Boxes, PlugZap, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ModelForm } from "./ModelForm";
import { ProviderCard } from "./ProviderCard";
import { ProviderForm } from "./ProviderForm";
import { useProviderStore } from "@/stores/useProviderStore";
import type { ProviderType, UserModel, UserProvider } from "@/types/provider";

interface ConnectionBanner {
  type: "success" | "error";
  message: string;
}

export function ProviderCenter() {
  const {
    providers,
    models,
    isLoaded,
    loadProviders,
    addProvider,
    updateProvider,
    removeProvider,
    setProviderEnabled,
    addModel,
    updateModel,
    removeModel,
    testConnection,
    syncToModelGateway,
  } = useProviderStore();

  const [providerFormOpen, setProviderFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<
    UserProvider | undefined
  >();
  const [modelFormOpen, setModelFormOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<UserModel | undefined>();
  const [modelFormProviderId, setModelFormProviderId] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, ConnectionBanner>
  >({});

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const stats = useMemo(() => {
    const enabledProviders = providers.filter(
      (provider) => provider.enabled,
    ).length;
    const allModels = Object.values(models).flat();
    const enabledModels = allModels.filter((model) => model.enabled).length;

    return {
      enabledProviders,
      enabledModels,
      totalModels: allModels.length,
    };
  }, [models, providers]);

  const handleAddProvider = useCallback(
    async (data: {
      name: string;
      type: ProviderType;
      baseUrl: string;
      apiKey: string;
    }) => {
      const provider = await addProvider(data);
      syncToModelGateway();
      setTestingId(provider.id);
      const result = await testConnection(provider.id);
      setTestingId(null);
      setTestResults((state) => ({
        ...state,
        [provider.id]: result.success
          ? {
              type: "success",
              message: result.warning
                ? `${result.warning}，已同步 ${result.modelsFound} 个模型`
                : `连接成功，延迟 ${result.latencyMs}ms，已同步 ${result.modelsFound} 个模型`,
            }
          : {
              type: "error",
              message: result.error || "连接失败",
            },
      }));
    },
    [addProvider, syncToModelGateway, testConnection],
  );

  const handleSaveProvider = useCallback(
    async (data: {
      name: string;
      type: ProviderType;
      baseUrl: string;
      apiKey: string;
    }) => {
      if (!editingProvider) return;

      await updateProvider(editingProvider.id, data);
      setEditingProvider(undefined);
      syncToModelGateway();
      setTestingId(editingProvider.id);
      const result = await testConnection(editingProvider.id);
      setTestingId(null);
      setTestResults((state) => ({
        ...state,
        [editingProvider.id]: result.success
          ? {
              type: "success",
              message: result.warning
                ? `${result.warning}，已同步 ${result.modelsFound} 个模型`
                : `连接成功，延迟 ${result.latencyMs}ms，已同步 ${result.modelsFound} 个模型`,
            }
          : {
              type: "error",
              message: result.error || "连接失败",
            },
      }));
    },
    [editingProvider, syncToModelGateway, testConnection, updateProvider],
  );

  const handleDeleteProvider = useCallback(
    async (id: string) => {
      await removeProvider(id);
      setTestResults((state) => {
        const { [id]: removed, ...rest } = state;
        void removed;
        return rest;
      });
      syncToModelGateway();
    },
    [removeProvider, syncToModelGateway],
  );

  const handleToggleProvider = useCallback(
    async (id: string) => {
      const provider = providers.find((entry) => entry.id === id);
      if (!provider) return;

      await setProviderEnabled(id, !provider.enabled);
      syncToModelGateway();
    },
    [providers, setProviderEnabled, syncToModelGateway],
  );

  const handleTestConnection = useCallback(
    async (id: string) => {
      setTestingId(id);
      const result = await testConnection(id);
      setTestingId(null);
      setTestResults((state) => ({
        ...state,
        [id]: result.success
          ? {
              type: "success",
              message: result.warning
                ? `${result.warning}，已同步 ${result.modelsFound} 个模型`
                : `连接成功，延迟 ${result.latencyMs}ms，已同步 ${result.modelsFound} 个模型`,
            }
          : {
              type: "error",
              message: result.error || "连接失败",
            },
      }));
    },
    [testConnection],
  );

  const handleAddModel = useCallback((providerId: string) => {
    setEditingModel(undefined);
    setModelFormProviderId(providerId);
    setModelFormOpen(true);
  }, []);

  const handleEditModel = useCallback((model: UserModel) => {
    setEditingModel(model);
    setModelFormProviderId(model.providerId);
    setModelFormOpen(true);
  }, []);

  const handleSaveModel = useCallback(
    async (data: {
      modelName: string;
      displayName?: string;
      capabilities: string[];
      contextWindow: number;
      maxOutputTokens: number;
      costPer1kInput?: number;
      costPer1kOutput?: number;
    }) => {
      if (editingModel) {
        await updateModel(editingModel.id, data);
      } else {
        await addModel({ ...data, providerId: modelFormProviderId });
      }

      setEditingModel(undefined);
      syncToModelGateway();
    },
    [addModel, editingModel, modelFormProviderId, syncToModelGateway, updateModel],
  );

  const handleDeleteModel = useCallback(
    async (modelId: string) => {
      await removeModel(modelId);
      syncToModelGateway();
    },
    [removeModel, syncToModelGateway],
  );

  if (!isLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto pt-10">
      <div className="mx-auto max-w-6xl space-y-6 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/35">
              Model Gateway
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[0.04em] text-white drop-shadow-2xl sm:text-6xl">
              大模型配置
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/[0.58] sm:text-base">
              在这里维护模型供应商、API Key、模型清单和运行时接入配置。内置供应商会先展示出来，补充密钥后即可启用。
            </p>
          </div>
          <Button
            variant="primary"
            className="h-11 px-5"
            onClick={() => {
              setEditingProvider(undefined);
              setProviderFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            添加供应商
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            icon={<PlugZap className="h-4 w-4" />}
            label="已启用供应商"
            value={stats.enabledProviders}
          />
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="已启用模型"
            value={stats.enabledModels}
          />
          <StatCard
            icon={<Boxes className="h-4 w-4" />}
            label="模型总数"
            value={stats.totalModels}
          />
        </div>

        {providers.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.08] p-12 text-center shadow-2xl shadow-black/[0.35] backdrop-blur-2xl">
            <h3 className="text-lg font-semibold text-white">
              还没有可用的供应商
            </h3>
            <p className="mt-2 text-sm text-white/50">
              添加第一个模型供应商后，这里会展示它的密钥、连接状态和模型列表。
            </p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                models={models[provider.id] || []}
                isTesting={testingId === provider.id}
                connectionResult={testResults[provider.id] || null}
                onEdit={() => {
                  setEditingProvider(provider);
                  setProviderFormOpen(true);
                }}
                onDelete={() => void handleDeleteProvider(provider.id)}
                onToggle={() => void handleToggleProvider(provider.id)}
                onTest={() => void handleTestConnection(provider.id)}
                onAddModel={() => handleAddModel(provider.id)}
                onEditModel={handleEditModel}
                onDeleteModel={(modelId) => void handleDeleteModel(modelId)}
              />
            ))}
          </div>
        )}

        <ProviderForm
          open={providerFormOpen}
          onClose={() => {
            setProviderFormOpen(false);
            setEditingProvider(undefined);
          }}
          onSave={editingProvider ? handleSaveProvider : handleAddProvider}
          existingProvider={editingProvider}
        />

        <ModelForm
          open={modelFormOpen}
          onClose={() => {
            setModelFormOpen(false);
            setEditingModel(undefined);
          }}
          onSave={handleSaveModel}
          existingModel={editingModel}
        />
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-black/[0.24] backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-white/45">{label}</p>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-white/65">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}
