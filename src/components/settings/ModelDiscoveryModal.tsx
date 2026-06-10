"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  MODEL_KIND_LABELS,
  type DiscoveredModel,
  type ModelKind,
} from "@/types/provider";

interface ModelDiscoveryModalProps {
  open: boolean;
  providerName: string;
  modelKind: ModelKind;
  models: DiscoveredModel[];
  existingModelNames: string[];
  onClose: () => void;
  onConfirm: (models: DiscoveredModel[]) => Promise<void> | void;
}

export function ModelDiscoveryModal({
  open,
  providerName,
  modelKind,
  models,
  existingModelNames,
  onClose,
  onConfirm,
}: ModelDiscoveryModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const existing = useMemo(
    () => new Set(existingModelNames),
    [existingModelNames],
  );
  const availableModels = useMemo(
    () => models.filter((model) => !existing.has(model.modelName)),
    [existing, models],
  );
  const filteredModels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return availableModels;
    return availableModels.filter((model) =>
      `${model.modelName} ${model.displayName || ""}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [availableModels, query]);
  const filteredSelectedCount = useMemo(
    () =>
      filteredModels.filter((model) => selected.includes(model.modelName))
        .length,
    [filteredModels, selected],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected([]);
    setConfirming(false);
  }, [open]);

  const toggleModel = (modelName: string) => {
    setSelected((current) =>
      current.includes(modelName)
        ? current.filter((item) => item !== modelName)
        : [...current, modelName],
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`选择${MODEL_KIND_LABELS[modelKind]}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <p className="text-xs text-white/45">
          {providerName} 返回 {models.length} 个模型，已添加的模型不会重复展示。
        </p>

        <Input
          label="搜索模型"
          placeholder="输入模型 ID 或名称"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="flex items-center justify-between text-xs">
          <span className="text-white/45">
            可添加 {availableModels.length} 个，已选择 {selected.length} 个
          </span>
          <button
            type="button"
            className="text-sky-200 hover:text-sky-100"
            disabled={filteredModels.length === 0}
            onClick={() =>
              setSelected(
                filteredSelectedCount === filteredModels.length
                  ? selected.filter(
                      (modelName) =>
                        !filteredModels.some(
                          (model) => model.modelName === modelName,
                        ),
                    )
                  : Array.from(
                      new Set([
                        ...selected,
                        ...filteredModels.map((model) => model.modelName),
                      ]),
                    ),
              )
            }
          >
            {filteredSelectedCount === filteredModels.length &&
            filteredModels.length > 0
              ? "取消全选"
              : "选择当前结果"}
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-md border border-white/10 bg-black/20">
          {filteredModels.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-white/38">
              没有可添加的模型
            </p>
          ) : (
            filteredModels.map((model) => {
              const active = selected.includes(model.modelName);
              return (
                <button
                  key={model.modelName}
                  type="button"
                  onClick={() => toggleModel(model.modelName)}
                  className="flex w-full items-center gap-3 border-b border-white/[0.07] px-4 py-3 text-left last:border-b-0 hover:bg-white/[0.06]"
                >
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      active
                        ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-200"
                        : "border-white/15 text-transparent"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white/85">
                      {model.displayName || model.modelName}
                    </span>
                    <span className="block truncate text-xs text-white/38">
                      {model.modelName}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={confirming}
            disabled={selected.length === 0}
            onClick={async () => {
              setConfirming(true);
              try {
                await onConfirm(
                  availableModels.filter((model) =>
                    selected.includes(model.modelName),
                  ),
                );
              } finally {
                setConfirming(false);
              }
            }}
          >
            添加所选模型
          </Button>
        </div>
      </div>
    </Modal>
  );
}
