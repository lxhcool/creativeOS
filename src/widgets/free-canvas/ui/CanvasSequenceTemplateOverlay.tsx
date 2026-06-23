/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type {
  CanvasTemplateElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import { requestCanvasImageGeneration, type CanvasModelEntry } from "@/features/canvas-brain";
import { spriteAssetUrl } from "@/features/sprite-video-lab/api";
import type { SpriteFrame } from "@/features/sprite-video-lab/types";
import {
  AI_REPAIR_PROMPT,
  getRepairReferenceImageUrls,
} from "../lib/sequenceRepair";

type Props = {
  element: CanvasTemplateElement;
  viewport: CanvasViewport;
  imageModelEntry?: CanvasModelEntry;
  onSelect: () => void;
  onMove: (updates: Pick<CanvasTemplateElement, "x" | "y">) => void;
  onPropsChange: (props: Record<string, unknown>) => void;
  onMessage: (message: string) => void;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

type RepairVariant = {
  id: string;
  kind?: "rgb_repaint" | "alpha_composite";
  url: string;
  thumb_url?: string;
  raw_url?: string;
  label?: string;
  canApply?: boolean;
  warning?: string;
  createdAt?: string;
};

type RepairableFrame = SpriteFrame & {
  original_url?: string;
  repairVariants?: RepairVariant[];
  appliedVariantId?: string;
};

const SHOW_FRAME_REPAIR_DEBUG = false;

function readFrames(value: unknown): RepairableFrame[] {
  if (!Array.isArray(value)) return [];
  return value.filter((frame): frame is RepairableFrame => (
    Boolean(frame) &&
    typeof frame === "object" &&
    typeof (frame as SpriteFrame).url === "string"
  ));
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("button, input, textarea, select, label"));
}

function variantId(): string {
  return `repair_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function inferSourceFrameUrl(frame: RepairableFrame | undefined): string {
  if (!frame) return "";
  if (frame.source_url) return frame.source_url;
  const match = frame.url.match(/^(\/work\/jobs\/[^/]+)\/processed\/[^/]+$/);
  if (!match?.[1]) return frame.original_url || frame.url;
  const rawName = `frame_${String((frame.source_index ?? frame.index ?? 0) + 1).padStart(5, "0")}.png`;
  return `${match[1]}/raw/${rawName}`;
}

export function CanvasSequenceTemplateOverlay({
  element,
  viewport,
  imageModelEntry,
  onSelect,
  onMove,
  onPropsChange,
  onMessage,
}: Props) {
  const props = element.props || {};
  const frames = useMemo(() => readFrames(props.frames), [props.frames]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewKey, setPreviewKey] = useState("current");
  const [repairingIndex, setRepairingIndex] = useState<number | null>(null);
  const [repairNotice, setRepairNotice] = useState("");
  const dragStateRef = useRef<DragState | null>(null);
  const selectedFrame = frames[Math.min(selectedIndex, Math.max(0, frames.length - 1))];
  const selectedVariants = selectedFrame?.repairVariants || [];
  const selectedVariant =
    previewKey !== "original" && previewKey !== "current"
      ? selectedVariants.find((variant) => variant.id === previewKey)
      : undefined;
  const selectedSourceUrl = inferSourceFrameUrl(selectedFrame);
  const previewUrl =
    previewKey === "original"
      ? selectedSourceUrl
      : previewKey === "current"
        ? selectedFrame?.url || ""
        : selectedVariant?.url || selectedFrame?.url || "";
  const selectedPreviewCanApply = selectedVariant?.canApply === true;
  const selectedPreviewIsApplied = Boolean(
    selectedFrame?.appliedVariantId && selectedFrame.appliedVariantId === previewKey,
  );
  const applyButtonDisabled =
    !previewUrl ||
    !selectedPreviewCanApply ||
    selectedPreviewIsApplied ||
    repairingIndex !== null;
  const applyButtonLabel = selectedVariant
    ? selectedPreviewCanApply
      ? selectedPreviewIsApplied
        ? "已应用"
        : "应用此版本"
      : "需 Alpha 合成"
    : "当前预览";

  useEffect(() => {
    setPreviewKey("current");
    setRepairNotice("");
  }, [selectedIndex]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onSelect();
    if (isInteractiveTarget(event.target)) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: element.x,
      startY: element.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    event.stopPropagation();
    onMove({
      x: dragState.startX + (event.clientX - dragState.startClientX) / viewport.scale,
      y: dragState.startY + (event.clientY - dragState.startClientY) / viewport.scale,
    });
  };

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const updateFrame = (frameIndex: number, nextFrame: RepairableFrame) => {
    const nextFrames = frames.map((item, index) => (index === frameIndex ? nextFrame : item));
    onPropsChange({
      ...props,
      frames: nextFrames,
      frameCount: nextFrames.length,
    });
  };

  const repairFrame = async (frame: RepairableFrame, frameIndex: number) => {
    if (!imageModelEntry?.provider) {
      const message = "请先配置可用的图像模型。";
      setRepairNotice(message);
      onMessage(message);
      return;
    }
    const sourceUrl = selectedSourceUrl || frame.url;
    const cutoutUrl = frame.url;

    setRepairingIndex(frameIndex);
    const startMessage = `正在生成第 ${frameIndex + 1} 帧的 RGB 补绘候选。`;
    setRepairNotice(startMessage);
    onMessage(startMessage);
    try {
      const references = await getRepairReferenceImageUrls({
        sourceUrl,
        cutoutUrl,
      });
      if (references.warnings.length > 0) {
        const warning = references.warnings.join(" ");
        setRepairNotice(warning);
        onMessage(warning);
      }
      const rawSrc = await requestCanvasImageGeneration({
        prompt: AI_REPAIR_PROMPT,
        referenceImageUrls: references.urls,
        provider: imageModelEntry.provider,
        model: imageModelEntry.model,
      });
      const repairVariant: RepairVariant = {
        id: variantId(),
        kind: "rgb_repaint",
        url: rawSrc,
        thumb_url: rawSrc,
        raw_url: rawSrc,
        label: `RGB 补绘候选 ${selectedVariants.length + 1}`,
        canApply: false,
        warning: "这是 RGB 补绘候选，只用于对比细节修复；需要经过 Alpha 合成节点后才能写回透明序列。",
        createdAt: new Date().toISOString(),
      };
      updateFrame(frameIndex, {
        ...frame,
        original_url: frame.original_url || frame.url,
        repairVariants: [...selectedVariants, repairVariant],
      });
      setPreviewKey(repairVariant.id);
      const doneMessage = `第 ${frameIndex + 1} 帧已生成 RGB 补绘候选。下一步需要 Alpha 合成后才能应用到透明序列。`;
      setRepairNotice(doneMessage);
      onMessage(doneMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 修图失败。";
      setRepairNotice(message);
      onMessage(message);
    } finally {
      setRepairingIndex(null);
    }
  };

  const applyPreview = async () => {
    if (!selectedFrame || previewKey === "current" || previewKey === "original") return;
    const selectedVariant = selectedVariants.find((variant) => variant.id === previewKey);
    if (!selectedVariant?.url) return;
    if (selectedVariant.canApply !== true) {
      onMessage(selectedVariant?.warning || "这个候选没有确认的真实透明 alpha，不能应用到透明序列。");
      return;
    }

    updateFrame(selectedIndex, {
      ...selectedFrame,
      original_url: selectedFrame.original_url || selectedFrame.url,
      url: selectedVariant.url,
      thumb_url: selectedVariant.thumb_url || selectedVariant.url,
      repairVariants: selectedVariants,
      appliedVariantId: previewKey,
    });
    setPreviewKey("current");
    onMessage(`第 ${selectedIndex + 1} 帧已应用所选版本。`);
  };

  return (
    <div
      className="absolute z-20 cursor-grab overflow-hidden rounded-lg border border-white/10 bg-[#111214] text-white shadow-2xl shadow-black/40 active:cursor-grabbing"
      style={{
        left: viewport.x + element.x * viewport.scale,
        top: viewport.y + element.y * viewport.scale,
        width: element.width,
        height: element.height,
        transform: `scale(${viewport.scale})`,
        transformOrigin: "top left",
      }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_240px] gap-3 p-4">
        <section className="flex min-h-0 flex-col rounded-lg border border-white/8 bg-white/[0.025] p-3">
          <div className="mb-3 shrink-0">
            <h3 className="truncate text-base font-bold text-white/92">
              {element.title || String(props.label || "透明序列")}
            </h3>
            <p className="mt-1 text-xs font-semibold text-white/45">
              {frames.length || 0} 帧 · AI 使用原始帧补绘当前抠图
            </p>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-black/25">
            {selectedFrame && previewUrl ? (
              <img
                src={spriteAssetUrl(previewUrl)}
                alt={`frame ${selectedIndex + 1}`}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            ) : (
              <span className="text-sm text-white/38">等待序列帧结果</span>
            )}
          </div>
          {selectedFrame && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPreviewKey("original")}
                className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
                  previewKey === "original"
                    ? "border-white/22 bg-white/[0.12] text-white"
                    : "border-white/10 bg-white/[0.045] text-white/58 hover:bg-white/[0.08]"
                }`}
              >
                原图
              </button>
              <button
                type="button"
                onClick={() => setPreviewKey("current")}
                className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
                  previewKey === "current"
                    ? "border-white/22 bg-white/[0.12] text-white"
                    : "border-white/10 bg-white/[0.045] text-white/58 hover:bg-white/[0.08]"
                }`}
              >
                当前
              </button>
              <button
                type="button"
                onClick={() => void applyPreview()}
                disabled={applyButtonDisabled}
                className="h-8 rounded-full border border-lime-200/15 bg-lime-300/[0.12] px-3 text-xs font-semibold text-lime-100 transition hover:bg-lime-300/[0.18] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {applyButtonLabel}
              </button>
            </div>
          )}
          {selectedVariant?.warning && (
            <p className="mt-2 rounded-md border border-amber-200/12 bg-amber-300/[0.08] px-3 py-2 text-xs leading-5 text-amber-100/80">
              {selectedVariant.warning}
            </p>
          )}
          {repairNotice && !selectedVariant?.warning && (
            <p className="mt-2 rounded-md border border-white/10 bg-white/[0.045] px-3 py-2 text-xs leading-5 text-white/62">
              {repairNotice}
            </p>
          )}
        </section>
        <section className="flex min-h-0 flex-col rounded-lg border border-white/8 bg-white/[0.025] p-3">
          <div className="mb-2 shrink-0 text-xs font-bold text-white/62">
            帧序列
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {frames.map((frame, index) => (
              <button
                key={`${frame.name || frame.url}_${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`grid w-full grid-cols-[44px_minmax(0,1fr)] gap-2 rounded-lg border p-1.5 text-left transition ${
                  index === selectedIndex
                    ? "border-lime-200/30 bg-lime-300/[0.08]"
                    : "border-white/8 bg-white/[0.035] hover:bg-white/[0.06]"
                }`}
              >
                <img
                  src={spriteAssetUrl(frame.thumb_url || frame.url)}
                  alt=""
                  className="h-11 w-11 rounded-md object-contain"
                  draggable={false}
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white/78">
                    #{index + 1} {frame.name || "frame"}
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-white/36">
                    {frame.width || "-"} x {frame.height || "-"}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {selectedFrame && selectedVariants.length > 0 && (
            <div className="mt-3 shrink-0 border-t border-white/8 pt-3">
              <div className="mb-2 text-xs font-bold text-white/62">
                AI 候选
              </div>
              <div className="grid max-h-28 grid-cols-3 gap-2 overflow-y-auto pr-1">
                {selectedVariants.map((variant, index) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setPreviewKey(variant.id)}
                    className={`rounded-lg border p-1 transition ${
                      previewKey === variant.id
                        ? "border-lime-200/30 bg-lime-300/[0.08]"
                        : "border-white/8 bg-white/[0.035] hover:bg-white/[0.06]"
                    }`}
                    title={variant.label || `AI 修图 ${index + 1}`}
                  >
                    <img
                      src={spriteAssetUrl(variant.thumb_url || variant.url)}
                      alt=""
                      className="h-12 w-full rounded object-contain"
                      draggable={false}
                    />
                    <span className="mt-1 block truncate text-[10px] text-white/48">
                      {variant.canApply === true ? `V${index + 1}` : `预览 ${index + 1}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {SHOW_FRAME_REPAIR_DEBUG && (
            <button
              type="button"
              disabled={!selectedFrame || repairingIndex !== null}
              onClick={() => selectedFrame && void repairFrame(selectedFrame, selectedIndex)}
              className="mt-3 h-9 shrink-0 rounded-full border border-lime-200/15 bg-lime-300/[0.12] text-xs font-semibold text-lime-100 transition hover:bg-lime-300/[0.18] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {repairingIndex === selectedIndex ? "AI 修图中..." : selectedVariants.length > 0 ? "再次生成候选" : "单帧补绘调试"}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
