"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  inferModelKind,
  MODEL_KIND_LABELS,
  normalizeModelCapabilities,
  type ModelKind,
  type ProviderType,
  type UserModel,
} from "@/types/provider";

const AVAILABLE_CAPABILITIES = [
  { id: "text", label: "文本生成" },
  { id: "tool_calling", label: "工具调用" },
  { id: "json", label: "JSON 模式" },
  { id: "vision", label: "视觉理解" },
  { id: "embedding", label: "向量嵌入" },
  { id: "streaming", label: "流式输出" },
] as const;

interface ModelFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
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
  }) => void;
  existingModel?: UserModel;
  modelKind: ModelKind;
  providerType?: ProviderType;
}

export function ModelForm({
  open,
  onClose,
  onSave,
  existingModel,
  modelKind,
  providerType,
}: ModelFormProps) {
  const isEdit = !!existingModel;
  const fallbackKind = existingModel?.kind || modelKind;

  const [modelName, setModelName] = useState(existingModel?.modelName || "");
  const [displayName, setDisplayName] = useState(
    existingModel?.displayName || "",
  );
  const [capabilities, setCapabilities] = useState<string[]>(
    existingModel?.capabilities || ["text", "json"],
  );
  const [contextWindow, setContextWindow] = useState(
    existingModel?.contextWindow || 65536,
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    existingModel?.maxOutputTokens || 4096,
  );
  const [costPer1kInput, setCostPer1kInput] = useState(
    existingModel?.costPer1kInput?.toString() || "",
  );
  const [costPer1kOutput, setCostPer1kOutput] = useState(
    existingModel?.costPer1kOutput?.toString() || "",
  );
  const [endpoint, setEndpoint] = useState(existingModel?.endpoint || "");
  const [options, setOptions] = useState(existingModel?.options || "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const effectiveKind = inferModelKind({
    modelName,
    displayName,
    capabilities,
    fallback: fallbackKind,
  });

  useEffect(() => {
    if (!open) return;

    setModelName(existingModel?.modelName || "");
    setDisplayName(existingModel?.displayName || "");
    setCapabilities(existingModel?.capabilities || ["text", "json"]);
    setContextWindow(existingModel?.contextWindow || 65536);
    setMaxOutputTokens(existingModel?.maxOutputTokens || 4096);
    setCostPer1kInput(existingModel?.costPer1kInput?.toString() || "");
    setCostPer1kOutput(existingModel?.costPer1kOutput?.toString() || "");
    setEndpoint(
      existingModel?.endpoint || getDefaultEndpoint(fallbackKind, providerType),
    );
    setOptions(existingModel?.options || "");
    setErrors({});
  }, [existingModel, fallbackKind, open, providerType]);

  useEffect(() => {
    if (!open || effectiveKind === "text") return;
    const imageEndpoint = getDefaultEndpoint("image", providerType);
    const videoEndpoint = getDefaultEndpoint("video", providerType);
    if (!endpoint.trim() || endpoint === imageEndpoint || endpoint === videoEndpoint) {
      setEndpoint(getDefaultEndpoint(effectiveKind, providerType));
    }
  }, [effectiveKind, endpoint, open, providerType]);

  const toggleCapability = (capability: string) => {
    setCapabilities((current) =>
      current.includes(capability)
        ? current.filter((entry) => entry !== capability)
        : [...current, capability],
    );
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!modelName.trim()) nextErrors["modelName"] = "请输入模型 ID";
    if (effectiveKind === "text" && capabilities.length === 0) {
      nextErrors["capabilities"] = "请至少选择一种模型能力";
    }
    if (effectiveKind !== "text" && !endpoint.trim()) {
      nextErrors["endpoint"] = "请输入生成接口路径";
    }
    if (options.trim()) {
      try {
        JSON.parse(options);
      } catch {
        nextErrors["options"] = "必须是合法 JSON";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    onSave({
      kind: effectiveKind,
      modelName: modelName.trim(),
      displayName: displayName.trim() || undefined,
      capabilities: normalizeModelCapabilities({
        kind: effectiveKind,
        capabilities,
      }),
      contextWindow,
      maxOutputTokens,
      costPer1kInput: costPer1kInput ? parseFloat(costPer1kInput) : undefined,
      costPer1kOutput: costPer1kOutput ? parseFloat(costPer1kOutput) : undefined,
      endpoint: endpoint.trim() || undefined,
      options: options.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${isEdit ? "编辑" : "添加"}${MODEL_KIND_LABELS[effectiveKind]}`}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="模型 ID"
          placeholder="deepseek-chat"
          value={modelName}
          onChange={(event) => {
            setModelName(event.target.value);
            if (errors["modelName"]) {
              setErrors((state) => ({ ...state, modelName: "" }));
            }
          }}
          error={errors["modelName"]}
          hint={`API 调用时使用的模型标识，例如 deepseek-chat、gpt-4.1。当前自动识别为：${MODEL_KIND_LABELS[effectiveKind]}`}
          required
        />

        <Input
          label="显示名称"
          placeholder="DeepSeek Chat"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          hint="在界面中展示的名称，可选"
        />

        {effectiveKind === "text" ? (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">
                模型能力
              </label>
              {errors["capabilities"] && (
                <p className="mb-2 text-xs text-danger">{errors["capabilities"]}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_CAPABILITIES.map((capability) => (
                  <button
                    key={capability.id}
                    type="button"
                    onClick={() => toggleCapability(capability.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      capabilities.includes(capability.id)
                        ? "border-white/20 bg-white/[0.12] text-white"
                        : "border-white/10 bg-black/[0.18] text-text-muted hover:border-border-light"
                    }`}
                  >
                    {capability.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="上下文长度"
                type="number"
                value={contextWindow.toString()}
                onChange={(event) =>
                  setContextWindow(parseInt(event.target.value, 10) || 0)
                }
                hint="最大上下文 Token"
              />
              <Input
                label="最大输出"
                type="number"
                value={maxOutputTokens.toString()}
                onChange={(event) =>
                  setMaxOutputTokens(parseInt(event.target.value, 10) || 0)
                }
                hint="最大输出 Token"
              />
            </div>
          </>
        ) : (
          <>
            <Input
              label="生成接口路径"
              placeholder={effectiveKind === "image" ? "/images/generations" : "/videos/generations"}
              value={endpoint}
              onChange={(event) => {
                setEndpoint(event.target.value);
                if (errors["endpoint"]) {
                  setErrors((state) => ({ ...state, endpoint: "" }));
                }
              }}
              error={errors["endpoint"]}
              hint="会和供应商 Base URL 拼接，例如 /images/generations"
              required
            />
            <Input
              label="模型参数 JSON"
              placeholder={
                effectiveKind === "image"
                  ? '{"size":"1024x1024","quality":"high"}'
                  : '{"resolution":"720p","duration":5}'
              }
              value={options}
              onChange={(event) => {
                setOptions(event.target.value);
                if (errors["options"]) {
                  setErrors((state) => ({ ...state, options: "" }));
                }
              }}
              error={errors["options"]}
              hint="原样透传给 LiteLLM、OpenRouter 或兼容网关"
            />
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="输入价格 / 1K"
            type="number"
            step="0.0001"
            placeholder="0.002"
            value={costPer1kInput}
            onChange={(event) => setCostPer1kInput(event.target.value)}
          />
          <Input
            label="输出价格 / 1K"
            type="number"
            step="0.0001"
            placeholder="0.008"
            value={costPer1kOutput}
            onChange={(event) => setCostPer1kOutput(event.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            取消
          </Button>
          <Button variant="primary" size="sm" type="submit">
            {isEdit ? "保存修改" : "添加模型"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function getDefaultEndpoint(kind: ModelKind, providerType?: ProviderType): string {
  if (providerType === "openrouter" && kind === "image") {
    return "/chat/completions";
  }
  if (kind === "image") return "/images/generations";
  if (kind === "video") return "/videos/generations";
  return "";
}
