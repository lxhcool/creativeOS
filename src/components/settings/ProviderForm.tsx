"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Database, KeyRound, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  ALL_MODEL_KINDS,
  getProviderSupportedKinds,
  inferProviderSupportedKinds,
  MODEL_KIND_LABELS,
  PROVIDER_DEFAULT_URLS,
  PROVIDER_TYPE_DESCRIPTIONS,
  PROVIDER_TYPE_LABELS,
  type ModelKind,
  type ProviderType,
  type UserProvider,
} from "@/types/provider";

interface ProviderFormData {
  name: string;
  type: ProviderType;
  baseUrl: string;
  supportedKinds: ModelKind[];
  apiKey: string;
}

interface ProviderFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: ProviderFormData) => Promise<void>;
  onSaveAndDiscover: (data: ProviderFormData) => Promise<void>;
  existingProvider?: UserProvider;
}

const CONNECTION_TYPES: ProviderType[] = [
  "litellm",
  "openrouter",
  "openai_compatible",
  "openai",
  "anthropic",
  "google",
];

export function ProviderForm({
  open,
  onClose,
  onSave,
  onSaveAndDiscover,
  existingProvider,
}: ProviderFormProps) {
  const isEdit = Boolean(existingProvider);
  const [name, setName] = useState("");
  const [type, setType] = useState<ProviderType>("openai_compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [supportedKinds, setSupportedKinds] = useState<ModelKind[]>(["text"]);
  const [supportedKindsTouched, setSupportedKindsTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<"save" | "discover" | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    const initialType = existingProvider?.type || "openai_compatible";
    setName(existingProvider?.name || "");
    setType(initialType);
    setBaseUrl(
      existingProvider?.baseUrl || PROVIDER_DEFAULT_URLS[initialType],
    );
    setSupportedKinds(
      existingProvider
        ? getProviderSupportedKinds(existingProvider)
        : inferProviderSupportedKinds({
            type: initialType,
            baseUrl: PROVIDER_DEFAULT_URLS[initialType],
          }),
    );
    setSupportedKindsTouched(false);
    setApiKey("");
    setErrors({});
    setSubmitting(null);
  }, [existingProvider, open]);

  const handleTypeChange = (newType: ProviderType) => {
    setType(newType);
    const nextBaseUrl =
      !isEdit || !baseUrl.trim() ? PROVIDER_DEFAULT_URLS[newType] : baseUrl;
    if (!isEdit || !baseUrl.trim()) {
      setBaseUrl(nextBaseUrl);
    }
    if (!name.trim() && newType !== "openai_compatible") {
      setName(PROVIDER_TYPE_LABELS[newType]);
    }
    if (!isEdit && !supportedKindsTouched) {
      setSupportedKinds(
        inferProviderSupportedKinds({
          type: newType,
          name: name.trim() || PROVIDER_TYPE_LABELS[newType],
          baseUrl: nextBaseUrl,
        }),
      );
    }
  };

  const toggleSupportedKind = (kind: ModelKind) => {
    setSupportedKindsTouched(true);
    setSupportedKinds((current) =>
      current.includes(kind)
        ? current.filter((entry) => entry !== kind)
        : [...current, kind],
    );
    if (errors["supportedKinds"]) {
      setErrors((state) => ({ ...state, supportedKinds: "" }));
    }
  };

  const getFormData = (): ProviderFormData | null => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors["name"] = "请输入连接名称";
    if (!baseUrl.trim()) nextErrors["baseUrl"] = "请输入 API 地址";
    if (supportedKinds.length === 0) {
      nextErrors["supportedKinds"] = "请至少选择一个分类";
    }
    if (!isEdit && !apiKey.trim()) nextErrors["apiKey"] = "请输入 API Key";

    try {
      if (baseUrl.trim()) new URL(baseUrl.trim());
    } catch {
      nextErrors["baseUrl"] = "请输入完整的 HTTP 或 HTTPS 地址";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return null;

    return {
      name: name.trim(),
      type,
      baseUrl: baseUrl.trim(),
      supportedKinds,
      apiKey:
        isEdit && !apiKey.trim() ? existingProvider!.apiKey : apiKey.trim(),
    };
  };

  const submit = async (mode: "save" | "discover") => {
    const data = getFormData();
    if (!data) return;

    setSubmitting(mode);
    try {
      if (mode === "discover") {
        await onSaveAndDiscover(data);
      } else {
        await onSave(data);
      }
      onClose();
    } finally {
      setSubmitting(null);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit("discover");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "编辑模型连接" : "添加模型连接"}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="provider-type"
            className="mb-2 block text-sm font-medium text-white/80"
          >
            接入协议
          </label>
          <select
            id="provider-type"
            value={type}
            onChange={(event) =>
              handleTypeChange(event.target.value as ProviderType)
            }
            className="h-11 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-white/25"
          >
            {CONNECTION_TYPES.map((connectionType) => (
              <option key={connectionType} value={connectionType}>
                {PROVIDER_TYPE_LABELS[connectionType]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-white/35">
            {PROVIDER_TYPE_DESCRIPTIONS[type]}
          </p>
        </div>

        <Input
          label="连接名称"
          placeholder="例如：公司 LiteLLM、我的 OpenRouter"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (errors["name"]) setErrors((state) => ({ ...state, name: "" }));
          }}
          error={errors["name"]}
          required
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-white/80">
            支持分类
          </label>
          {errors["supportedKinds"] && (
            <p className="mb-2 text-xs text-danger">{errors["supportedKinds"]}</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {ALL_MODEL_KINDS.map((kind) => {
              const active = supportedKinds.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleSupportedKind(kind)}
                  className={`rounded-2xl border px-3 py-2 text-sm transition ${
                    active
                      ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                      : "border-white/10 bg-black/[0.18] text-white/55 hover:border-white/20 hover:text-white/75"
                  }`}
                >
                  {MODEL_KIND_LABELS[kind]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-white/35">
            决定这个连接会出现在哪些分类里。自定义 Gateway 请按实际能力勾选。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3 top-[39px] z-10 h-4 w-4 text-white/30" />
            <Input
              label="API 地址"
              placeholder="https://gateway.example.com/v1"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                if (errors["baseUrl"]) {
                  setErrors((state) => ({ ...state, baseUrl: "" }));
                }
              }}
              error={errors["baseUrl"]}
              className="pl-9"
              required
            />
          </div>

          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-[39px] z-10 h-4 w-4 text-white/30" />
            <Input
              label={isEdit ? "API Key（可留空）" : "API Key"}
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                if (errors["apiKey"]) {
                  setErrors((state) => ({ ...state, apiKey: "" }));
                }
              }}
              error={errors["apiKey"]}
              className="pl-9"
              required={!isEdit}
            />
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-md border border-white/[0.08] bg-white/[0.04] p-3 text-xs leading-5 text-white/45">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
          <p>
            连接信息保存在当前浏览器。保存并获取模型后，会从该服务读取模型列表，再由你选择需要加入当前分类的模型。
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            取消
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            loading={submitting === "save"}
            disabled={submitting !== null}
            onClick={() => void submit("save")}
          >
            仅保存
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={submitting === "discover"}
            disabled={submitting !== null}
          >
            保存并获取模型
          </Button>
        </div>
      </form>
    </Modal>
  );
}
