"use client";

import {
  Activity,
  CheckCircle2,
  Edit3,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  getProviderSupportedKinds,
  MODEL_KIND_LABELS,
  PROVIDER_TYPE_LABELS,
  type ModelKind,
  type UserModel,
  type UserProvider,
} from "@/types/provider";

interface ProviderCardProps {
  provider: UserProvider;
  models: UserModel[];
  modelKind: ModelKind;
  defaultModelRef?: string;
  isTesting: boolean;
  connectionResult: { type: "success" | "error"; message: string } | null;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onTest: () => void;
  onAddModel: () => void;
  onEditModel: (model: UserModel) => void;
  onDeleteModel: (model: UserModel) => void;
  onSetDefaultModel: (model: UserModel) => void;
}

const CAPABILITY_LABELS: Record<string, string> = {
  text: "文本",
  tool_calling: "工具",
  json: "JSON",
  vision: "视觉",
  embedding: "向量",
  streaming: "流式",
};

const KIND_MODEL_LABELS: Record<ModelKind, string> = {
  text: "文本模型",
  video: "视频模型",
  image: "图像模型",
};

export function ProviderCard({
  provider,
  models,
  modelKind,
  defaultModelRef,
  isTesting,
  connectionResult,
  onEdit,
  onDelete,
  onToggle,
  onTest,
  onAddModel,
  onEditModel,
  onDeleteModel,
  onSetDefaultModel,
}: ProviderCardProps) {
  const enabledModels = models.filter((model) => model.enabled);
  const isRunnable = provider.enabled && provider.apiKey.trim().length > 0;
  const supportedKinds = getProviderSupportedKinds(provider);

  return (
    <article
      className={`rounded-[28px] border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-black/[0.35] backdrop-blur-2xl transition ${
        provider.enabled ? "" : "opacity-60"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white/70">
              <Activity className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-white">
              {provider.name}
            </h3>
          </div>
          <p className="mt-2 pl-11 text-xs text-white/42">
            {PROVIDER_TYPE_LABELS[provider.type]}
          </p>
          <p className="mt-1 pl-11 text-[11px] text-white/30">
            分类: {supportedKinds.map((kind) => MODEL_KIND_LABELS[kind]).join(" / ")}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip content="获取模型列表" position="top">
            <button
              aria-label="获取模型列表"
              onClick={onTest}
              disabled={isTesting}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/55 transition hover:bg-white/15 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          </Tooltip>
          <Tooltip content="编辑" position="top">
            <button
              aria-label="编辑供应商"
              onClick={onEdit}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/55 transition hover:bg-white/15 hover:text-white"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip content="删除" position="top">
            <button
              aria-label="删除供应商"
              onClick={onDelete}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/55 transition hover:bg-red-300/10 hover:text-red-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="text-white/45">状态</span>
        <span
          className={isRunnable ? "text-emerald-200" : "text-white/40"}
        >
          {isRunnable ? "已启用" : provider.apiKey ? "已停用" : "缺少 API Key"}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
            provider.enabled
              ? "bg-red-300/10 text-red-200 hover:bg-red-300/20"
              : "bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/20"
          }`}
        >
          {provider.enabled ? "停用" : "启用"}
        </button>
      </div>

      {connectionResult && (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-xs ${
            connectionResult.type === "success"
              ? "bg-emerald-300/10 text-emerald-200"
              : "bg-red-300/10 text-red-200"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {connectionResult.type === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {connectionResult.message}
          </span>
        </div>
      )}

      <div className="mb-2 flex items-center gap-2 text-xs text-white/45">
        <KeyRound className="h-3.5 w-3.5" />
        <span className="font-medium">API Key：</span>
        {provider.apiKey ? maskApiKey(provider.apiKey) : "未设置"}
      </div>
      <div className="mb-4 flex items-center gap-2 truncate text-xs text-white/45">
        <Link2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">接口地址：</span>
        <span className="truncate">{provider.baseUrl || "默认"}</span>
      </div>

      <div className="border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-white">
            模型 ({enabledModels.length}/{models.length})
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onTest}
              disabled={isTesting}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-200 transition-colors hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              获取模型
            </button>
            <button
              type="button"
              onClick={onAddModel}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-200 hover:text-sky-100"
            >
              <Plus className="h-3 w-3" />
              添加
            </button>
          </div>
        </div>

        {models.length === 0 ? (
          <p className="text-xs italic text-white/38">
            还没有配置{KIND_MODEL_LABELS[modelKind]}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {models.map((model) => (
              <li
                key={model.id}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/[0.18] px-2.5 py-2 text-xs"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    model.enabled ? "bg-emerald-300" : "bg-white/30"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-white/88">
                      {model.displayName || model.modelName}
                    </p>
                    {defaultModelRef === `${provider.id}:${model.modelName}` && (
                      <span className="shrink-0 rounded bg-amber-300/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                        默认
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-white/38">
                    {modelKind === "text"
                      ? model.capabilities
                          .map((capability) => CAPABILITY_LABELS[capability] || capability)
                          .join("、")
                      : [model.endpoint, model.options ? "含模型参数" : ""]
                          .filter(Boolean)
                          .join(" / ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSetDefaultModel(model)}
                  className="text-white/45 transition-colors hover:text-amber-200"
                  aria-label="设为默认模型"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onEditModel(model)}
                  className="text-white/45 transition-colors hover:text-white"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteModel(model)}
                  className="text-white/45 transition-colors hover:text-red-200"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "******";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}
