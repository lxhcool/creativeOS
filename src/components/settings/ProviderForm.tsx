"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  PROVIDER_DEFAULT_URLS,
  PROVIDER_TYPE_DESCRIPTIONS,
  PROVIDER_TYPE_LABELS,
  type ProviderType,
  type UserProvider,
} from "@/types/provider";

interface ProviderFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    type: ProviderType;
    baseUrl: string;
    apiKey: string;
  }) => void;
  existingProvider?: UserProvider;
}

const PROVIDER_TYPES: ProviderType[] = [
  "openai",
  "anthropic",
  "google",
  "openai_compatible",
];

const PROVIDER_PRESETS: Array<{
  name: string;
  type: ProviderType;
  baseUrl: string;
}> = [
  {
    name: "GPT 官方",
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    name: "Claude 官方",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
  },
  {
    name: "DeepSeek",
    type: "openai_compatible",
    baseUrl: "https://api.deepseek.com",
  },
  {
    name: "OpenRouter",
    type: "openai_compatible",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    name: "Ollama",
    type: "openai_compatible",
    baseUrl: "http://localhost:11434/v1",
  },
  {
    name: "SiliconFlow",
    type: "openai_compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
  },
];

export function ProviderForm({
  open,
  onClose,
  onSave,
  existingProvider,
}: ProviderFormProps) {
  const isEdit = !!existingProvider;

  const [name, setName] = useState(existingProvider?.name || "");
  const [type, setType] = useState<ProviderType>(
    existingProvider?.type || "openai",
  );
  const [baseUrl, setBaseUrl] = useState(
    existingProvider?.baseUrl || PROVIDER_DEFAULT_URLS.openai,
  );
  const [apiKey, setApiKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;

    setName(existingProvider?.name || "");
    setType(existingProvider?.type || "openai");
    setBaseUrl(existingProvider?.baseUrl || PROVIDER_DEFAULT_URLS.openai);
    setApiKey("");
    setErrors({});
  }, [existingProvider, open]);

  const handleTypeChange = (newType: ProviderType) => {
    setType(newType);
    if (!existingProvider) {
      setBaseUrl(PROVIDER_DEFAULT_URLS[newType]);
    }
  };

  const applyPreset = (preset: (typeof PROVIDER_PRESETS)[number]) => {
    setName(preset.name);
    setType(preset.type);
    setBaseUrl(preset.baseUrl);
    setErrors((state) => ({
      ...state,
      name: "",
      baseUrl: "",
    }));
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) nextErrors["name"] = "请输入供应商名称";
    if (!baseUrl.trim()) nextErrors["baseUrl"] = "请输入接口地址";
    if (!isEdit && !apiKey.trim()) nextErrors["apiKey"] = "请输入 API Key";
    if (type === "openai_compatible" && !baseUrl.trim()) {
      nextErrors["baseUrl"] = "兼容接口必须填写接口地址";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    onSave({
      name: name.trim(),
      type,
      baseUrl: baseUrl.trim(),
      apiKey: isEdit && !apiKey.trim() ? existingProvider!.apiKey : apiKey.trim(),
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "编辑供应商" : "添加大模型供应商"}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="供应商名称"
          placeholder="例如：DeepSeek"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (errors["name"]) setErrors((state) => ({ ...state, name: "" }));
          }}
          error={errors["name"]}
          required
        />

        {!isEdit && (
          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">
              常用预设
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-lg border border-white/10 bg-black/[0.18] px-3 py-2 text-left text-xs font-medium text-text-secondary transition hover:border-accent/60 hover:bg-accent/10 hover:text-text-primary"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">
            供应商类型 <span className="text-danger">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDER_TYPES.map((providerType) => (
              <button
                key={providerType}
                type="button"
                onClick={() => handleTypeChange(providerType)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  type === providerType
                    ? "border-accent bg-accent/10"
                    : "border-white/10 bg-black/[0.18] hover:bg-white/[0.08]"
                }`}
              >
                <div className="text-sm font-medium text-text-primary">
                  {PROVIDER_TYPE_LABELS[providerType]}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-text-muted">
                  {PROVIDER_TYPE_DESCRIPTIONS[providerType]}
                </div>
              </button>
            ))}
          </div>
        </div>

        <Input
          label="接口地址"
          placeholder="https://api.deepseek.com"
          value={baseUrl}
          onChange={(event) => {
            setBaseUrl(event.target.value);
            if (errors["baseUrl"]) {
              setErrors((state) => ({ ...state, baseUrl: "" }));
            }
          }}
          error={errors["baseUrl"]}
          hint={
            type === "openai_compatible"
              ? "填写兼容 OpenAI 协议的服务地址"
              : "已根据供应商类型自动填入默认地址"
          }
          required
        />

        <Input
          label={isEdit ? "API Key（留空则保持不变）" : "API Key"}
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
          hint="保存在本地浏览器；测试/同步时会经由当前 CreativeOS 服务端代理请求供应商"
          required={!isEdit}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            取消
          </Button>
          <Button variant="primary" size="sm" type="submit">
            {isEdit ? "保存修改" : "添加供应商"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
