"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  Boxes,
  ImageIcon,
  MessageSquareText,
  Plus,
  Sparkles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ModelDiscoveryModal } from "./ModelDiscoveryModal";
import { ModelForm } from "./ModelForm";
import { ProviderCard } from "./ProviderCard";
import { ProviderForm } from "./ProviderForm";
import { useProviderStore } from "@/stores/useProviderStore";
import {
  getProviderSupportedKinds,
  inferModelKind,
  MODEL_KIND_DESCRIPTIONS,
  MODEL_KIND_LABELS,
  normalizeModelCapabilities,
  type DiscoveredModel,
  type ModelKind,
  type ProviderType,
  type UserModel,
  type UserProvider,
} from "@/types/provider";

interface ConnectionBanner {
  type: "success" | "error";
  message: string;
}

type PendingDelete =
  | { kind: "provider"; provider: UserProvider }
  | { kind: "model"; provider: UserProvider; model: UserModel };

export function ProviderCenter() {
  const searchParams = useSearchParams();
  const {
    providers,
    models,
    defaultModels,
    isLoaded,
    loadProviders,
    addProvider,
    updateProvider,
    removeProvider,
    syncProviderCredentialToServer,
    setProviderEnabled,
    addModel,
    updateModel,
    removeModel,
    setDefaultModel,
    testConnection,
    syncToModelGateway,
  } = useProviderStore();

  const [providerFormOpen, setProviderFormOpen] = useState(false);
  const [activeKind, setActiveKind] = useState<ModelKind>("text");
  const [discoveryKind, setDiscoveryKind] = useState<ModelKind>("text");
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
  const [discoveryProvider, setDiscoveryProvider] = useState<
    UserProvider | undefined
  >();
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
    [],
  );
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [syncingCredentialId, setSyncingCredentialId] = useState<string | null>(null);
  const [credentialResults, setCredentialResults] = useState<
    Record<string, ConnectionBanner>
  >({});

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    const requestedKind = searchParams.get("kind");
    if (requestedKind === "text" || requestedKind === "image" || requestedKind === "video") {
      setActiveKind(requestedKind);
    }
  }, [searchParams]);

  const visibleProviders = useMemo(
    () =>
      providers.filter((provider) =>
        shouldShowProviderForKind(provider, activeKind, models[provider.id] || []),
      ),
    [activeKind, models, providers],
  );

  const stats = useMemo(() => {
    const enabledProviders = visibleProviders.filter(
      (provider) => provider.enabled && provider.apiKey.trim().length > 0,
    ).length;
    const allModels = Object.values(models)
      .flat()
      .filter((model) => (model.kind || "text") === activeKind);
    const enabledModels = allModels.filter((model) => model.enabled).length;

    return {
      enabledProviders,
      enabledModels,
      totalModels: allModels.length,
    };
  }, [activeKind, models, visibleProviders]);
  const modelFormProviderType = useMemo(
    () =>
      providers.find((provider) => provider.id === modelFormProviderId)?.type,
    [modelFormProviderId, providers],
  );

  const handleAddProvider = useCallback(
    async (data: {
      name: string;
      type: ProviderType;
      baseUrl: string;
      supportedKinds: ModelKind[];
      apiKey: string;
    }) => {
      await addProvider(data);
      syncToModelGateway();
    },
    [addProvider, syncToModelGateway],
  );

  const discoverProviderModels = useCallback(
    async (provider: UserProvider, kindOverride?: ModelKind) => {
      const targetKind =
        kindOverride ||
        pickDiscoveryKind(getProviderSupportedKinds(provider), activeKind);
      setTestingId(provider.id);
      const result = await testConnection(provider.id, targetKind);
      setTestingId(null);
      setTestResults((state) => ({
        ...state,
        [provider.id]: result.success
          ? {
              type: "success",
              message: result.warning
                ? `${result.warning}，发现 ${result.modelsFound} 个模型`
                : `连接成功，延迟 ${result.latencyMs}ms，发现 ${result.modelsFound} 个模型`,
            }
          : {
              type: "error",
              message: result.error || "连接失败",
            },
      }));

      if (result.success && result.models) {
        setDiscoveryKind(targetKind);
        setDiscoveryProvider(provider);
        setDiscoveredModels(result.models);
      }
    },
    [activeKind, testConnection],
  );

  const handleSaveProvider = useCallback(
    async (data: {
      name: string;
      type: ProviderType;
      baseUrl: string;
      supportedKinds: ModelKind[];
      apiKey: string;
    }) => {
      if (!editingProvider) return;

      await updateProvider(editingProvider.id, data);
      setEditingProvider(undefined);
      syncToModelGateway();
    },
    [editingProvider, syncToModelGateway, updateProvider],
  );

  const handleSaveAndDiscoverProvider = useCallback(
    async (data: {
      name: string;
      type: ProviderType;
      baseUrl: string;
      supportedKinds: ModelKind[];
      apiKey: string;
    }) => {
      const targetKind = pickDiscoveryKind(data.supportedKinds, activeKind);

      if (editingProvider) {
        await updateProvider(editingProvider.id, data);
        const updatedProvider: UserProvider = {
          ...editingProvider,
          ...data,
          updatedAt: new Date().toISOString(),
        };
        setEditingProvider(undefined);
        syncToModelGateway();
        setActiveKind(targetKind);
        await discoverProviderModels(updatedProvider, targetKind);
        return;
      }

      const provider = await addProvider(data);
      syncToModelGateway();
      setActiveKind(targetKind);
      await discoverProviderModels(provider, targetKind);
    },
    [
      activeKind,
      addProvider,
      discoverProviderModels,
      editingProvider,
      syncToModelGateway,
      updateProvider,
    ],
  );

  const handleDeleteProvider = useCallback((provider: UserProvider) => {
    setPendingDelete({ kind: "provider", provider });
  }, []);

  const handleDeleteModel = useCallback((provider: UserProvider, model: UserModel) => {
    setPendingDelete({ kind: "model", provider, model });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;

    setDeleteSubmitting(true);
    try {
      if (pendingDelete.kind === "provider") {
        const id = pendingDelete.provider.id;
        await removeProvider(id);
        setTestResults((state) => {
          const { [id]: removed, ...rest } = state;
          void removed;
          return rest;
        });
      } else {
        await removeModel(pendingDelete.model.id);
      }

      setPendingDelete(null);
      syncToModelGateway();
    } finally {
      setDeleteSubmitting(false);
    }
  }, [pendingDelete, removeModel, removeProvider, syncToModelGateway]);

  const handleCancelDelete = useCallback(() => {
    if (deleteSubmitting) return;
    setPendingDelete(null);
  }, [deleteSubmitting]);

  const deleteDialogContent = useMemo(() => {
    if (!pendingDelete) return null;

    if (pendingDelete.kind === "provider") {
      return {
        title: "确认删除供应商",
        description: `将删除连接“${pendingDelete.provider.name}”以及它下面的全部模型配置。这个操作不能撤销。`,
        confirmLabel: "删除供应商",
      };
    }

    return {
      title: "确认删除模型",
      description: `将删除模型“${pendingDelete.model.displayName || pendingDelete.model.modelName}”。如果它是当前分类的默认模型，默认设置也会一并清除。`,
      confirmLabel: "删除模型",
    };
  }, [pendingDelete]);

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
      const provider = providers.find((entry) => entry.id === id);
      if (!provider) return;
      await discoverProviderModels(provider);
    },
    [discoverProviderModels, providers],
  );

  const handleSyncCredential = useCallback(
    async (id: string) => {
      setSyncingCredentialId(id);
      try {
        await syncProviderCredentialToServer(id);
        setCredentialResults((state) => ({
          ...state,
          [id]: {
            type: "success",
            message: "服务端已保存",
          },
        }));
      } catch (error) {
        setCredentialResults((state) => ({
          ...state,
          [id]: {
            type: "error",
            message: error instanceof Error ? error.message : "保存失败",
          },
        }));
      } finally {
        setSyncingCredentialId(null);
      }
    },
    [syncProviderCredentialToServer],
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
      kind: ModelKind;
      modelName: string;
      displayName?: string;
      capabilities: string[];
      contextWindow: number;
      maxOutputTokens: number;
      costPer1kInput?: number;
      costPer1kOutput?: number;
      endpoint?: string;
      options?: string;
    }) => {
      let savedModel: UserModel | undefined;
      if (editingModel) {
        await updateModel(editingModel.id, data);
      } else {
        savedModel = await addModel({ ...data, providerId: modelFormProviderId });
      }

      if (!defaultModels[data.kind]) {
        const model = savedModel || editingModel;
        if (model) {
          await setDefaultModel(
            data.kind,
            `${model.providerId}:${data.modelName}`,
          );
        }
      }

      setEditingModel(undefined);
      syncToModelGateway();
    },
    [
      addModel,
      defaultModels,
      editingModel,
      modelFormProviderId,
      setDefaultModel,
      syncToModelGateway,
      updateModel,
    ],
  );

  const handleConfirmDiscoveredModels = useCallback(
    async (selectedModels: DiscoveredModel[]) => {
      if (!discoveryProvider) return;

      const existingNames = new Set(
        (models[discoveryProvider.id] || [])
          .map((model) => `${model.kind || "text"}:${model.modelName}`),
      );
      const modelsToAdd = selectedModels
        .map((model) => ({
          ...model,
          inferredKind: inferModelKind({
            modelName: model.modelName,
            displayName: model.displayName,
            capabilities: model.capabilities,
            fallback: discoveryKind,
          }),
        }))
        .filter((model) => !existingNames.has(`${model.inferredKind}:${model.modelName}`));
      const firstAddedByKind = new Map<ModelKind, string>();

      for (const model of modelsToAdd) {
        await addModel({
          providerId: discoveryProvider.id,
          kind: model.inferredKind,
          modelName: model.modelName,
          displayName: model.displayName,
          capabilities: normalizeModelCapabilities({
            kind: model.inferredKind,
            capabilities: model.capabilities,
          }),
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          endpoint: getDefaultEndpoint(discoveryProvider.type, model.inferredKind),
        });
        existingNames.add(`${model.inferredKind}:${model.modelName}`);
        if (!firstAddedByKind.has(model.inferredKind)) {
          firstAddedByKind.set(
            model.inferredKind,
            `${discoveryProvider.id}:${model.modelName}`,
          );
        }
      }

      for (const [kind, modelRef] of firstAddedByKind.entries()) {
        if (!defaultModels[kind]) {
          await setDefaultModel(kind, modelRef);
        }
      }

      setActiveKind(modelsToAdd[0]?.inferredKind || discoveryKind);
      setDiscoveryProvider(undefined);
      setDiscoveredModels([]);
      syncToModelGateway();
    },
    [
      addModel,
      defaultModels,
      discoveryKind,
      discoveryProvider,
      models,
      setDefaultModel,
      syncToModelGateway,
    ],
  );

  if (!isLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/45 border-t-transparent" />
      </div>
    );
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto pt-10">
      <div className="mx-auto max-w-6xl space-y-6 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/35">
              模型配置
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[0.04em] text-white drop-shadow-2xl sm:text-6xl">
              大模型配置
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/[0.58] sm:text-base">
              配置文本、图像和视频模型，选择默认模型。
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

        <div className="grid grid-cols-3 gap-2 rounded-lg border border-white/10 bg-black/20 p-1.5">
          {MODEL_KINDS.map(({ kind, icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => setActiveKind(kind)}
              className={`flex min-h-16 items-center gap-3 rounded-md px-4 text-left transition ${
                activeKind === kind
                  ? "bg-white/[0.12] text-white"
                  : "text-white/48 hover:bg-white/[0.06] hover:text-white/75"
              }`}
            >
              <span className="shrink-0">{icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {MODEL_KIND_LABELS[kind]}
                </span>
                <span className="mt-1 hidden truncate text-xs text-white/38 lg:block">
                  {MODEL_KIND_DESCRIPTIONS[kind]}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
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

        {visibleProviders.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.08] p-12 text-center shadow-2xl shadow-black/[0.35] backdrop-blur-2xl">
            <h3 className="text-lg font-semibold text-white">
              当前分类还没有可用的供应商
            </h3>
            <p className="mt-2 text-sm text-white/50">
              {activeKind === "text"
                ? "添加供应商后可配置模型。"
                : "切换分类，或添加支持当前分类的连接。"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                models={(models[provider.id] || []).filter(
                  (model) => (model.kind || "text") === activeKind,
                )}
                modelKind={activeKind}
                defaultModelRef={defaultModels[activeKind]}
                isTesting={testingId === provider.id}
                connectionResult={testResults[provider.id] || null}
                credentialResult={credentialResults[provider.id] || null}
                isSyncingCredential={syncingCredentialId === provider.id}
                onEdit={() => {
                  setEditingProvider(provider);
                  setProviderFormOpen(true);
                }}
                onDelete={() => handleDeleteProvider(provider)}
                onToggle={() => void handleToggleProvider(provider.id)}
                onTest={() => void handleTestConnection(provider.id)}
                onSyncCredential={() => void handleSyncCredential(provider.id)}
                onAddModel={() => handleAddModel(provider.id)}
                onEditModel={handleEditModel}
                onDeleteModel={(model) => handleDeleteModel(provider, model)}
                onSetDefaultModel={(model) =>
                  void setDefaultModel(
                    activeKind,
                    `${provider.id}:${model.modelName}`,
                  )
                }
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
          onSaveAndDiscover={handleSaveAndDiscoverProvider}
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
          modelKind={activeKind}
          providerType={modelFormProviderType}
        />

        <ModelDiscoveryModal
          open={Boolean(discoveryProvider)}
          providerName={discoveryProvider?.name || ""}
          modelKind={discoveryKind}
          models={discoveredModels}
          existingModelNames={
            discoveryProvider
              ? (models[discoveryProvider.id] || [])
                  .filter((model) => (model.kind || "text") === discoveryKind)
                  .map((model) => model.modelName)
              : []
          }
          onClose={() => {
            setDiscoveryProvider(undefined);
            setDiscoveredModels([]);
          }}
          onConfirm={handleConfirmDiscoveredModels}
        />

        <Modal
          open={Boolean(pendingDelete && deleteDialogContent)}
          onClose={handleCancelDelete}
          title={deleteDialogContent?.title}
          maxWidth="max-w-lg"
        >
          <div className="space-y-5">
            <p className="text-sm leading-6 text-white/60">
              {deleteDialogContent?.description}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelDelete}
                disabled={deleteSubmitting}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={deleteSubmitting}
                onClick={() => void handleConfirmDelete()}
              >
                {deleteDialogContent?.confirmLabel || "确认删除"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </section>
  );
}

const MODEL_KINDS: Array<{ kind: ModelKind; icon: ReactNode }> = [
  { kind: "text", icon: <MessageSquareText className="h-4 w-4" /> },
  { kind: "video", icon: <Video className="h-4 w-4" /> },
  { kind: "image", icon: <ImageIcon className="h-4 w-4" /> },
];

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

function getDefaultEndpoint(providerType: ProviderType, kind: ModelKind): string {
  if (providerType === "openrouter" && kind === "image") {
    return "/chat/completions";
  }
  if (kind === "image") return "/images/generations";
  if (kind === "video") return "/videos/generations";
  return "/chat/completions";
}

function shouldShowProviderForKind(
  provider: UserProvider,
  kind: ModelKind,
  providerModels: UserModel[],
): boolean {
  if (kind === "text") return true;

  const hasModelsForKind = providerModels.some(
    (model) => (model.kind || "text") === kind,
  );
  if (hasModelsForKind) return true;

  return getProviderSupportedKinds(provider).includes(kind);
}

function pickDiscoveryKind(
  supportedKinds: ModelKind[],
  activeKind: ModelKind,
): ModelKind {
  if (supportedKinds.includes(activeKind)) {
    return activeKind;
  }

  return supportedKinds[0] || activeKind;
}
