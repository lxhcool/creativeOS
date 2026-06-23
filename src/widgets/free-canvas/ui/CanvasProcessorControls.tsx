import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CanvasProcessorElement } from "@/entities/canvas/model/types";
import {
  applySpriteProcessingPreset,
  SPRITE_PROCESSING_PRESETS,
} from "@/features/sprite-video-lab/defaults";
import type { ProcessingOptions } from "@/features/sprite-video-lab/types";

type Props = {
  element: CanvasProcessorElement;
  mode?: "panel" | "node";
  onRun: (config: Record<string, unknown>) => void;
};

const inputClass =
  "h-9 w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 text-xs text-white/82 outline-none transition focus:border-white/20 focus:bg-white/[0.08]";

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function CanvasProcessorControls({ element, mode = "panel", onRun }: Props) {
  const [draft, setDraft] = useState(element.config || {});
  const disabled = element.status === "generating";
  const hasResult = element.status === "done" || element.status === "failed";
  const isNodeMode = mode === "node";
  const chromaEnabled = bool(draft.chromaEnabled, true);
  const matteMode = String(draft.matteMode || "chroma");
  const processingPreset = String(draft.processingPreset || "fast") as NonNullable<ProcessingOptions["processingPreset"]>;
  const showChroma = chromaEnabled && ["chroma", "birefnet_chroma", "corridorkey"].includes(matteMode);
  const showLuma = chromaEnabled && matteMode.includes("luma");
  const setValue = (updates: Record<string, unknown>) => setDraft((current) => ({ ...current, ...updates }));
  const setPreset = (preset: NonNullable<ProcessingOptions["processingPreset"]>) => {
    setDraft((current) =>
      applySpriteProcessingPreset(current as ProcessingOptions, preset),
    );
  };
  const run = () => {
    onRun(draft);
  };

  useEffect(() => {
    setDraft(element.config || {});
  }, [element.id, element.config]);

  const buttonText = useMemo(
    () => disabled ? "处理中..." : hasResult ? "应用参数并重新生成" : "应用参数并开始处理",
    [disabled, hasResult],
  );

  return (
    <div className={isNodeMode ? "flex min-h-0 flex-1 flex-col gap-2" : "mt-4 space-y-3"}>
      <div className={isNodeMode ? "min-h-0 flex-1 overflow-visible" : "max-h-[58vh] overflow-y-auto pr-1"}>
        <div className={isNodeMode ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3"}>
          <Section title="输出" compact={isNodeMode}>
            <Field label="预设" wide><Select value={processingPreset in SPRITE_PROCESSING_PRESETS ? processingPreset : "fast"} onChange={(value) => setPreset(value as NonNullable<ProcessingOptions["processingPreset"]>)} options={PROCESSING_PRESET_OPTIONS} /></Field>
            <Field label="抽帧间隔"><NumberInput value={num(draft.keepEvery, 2)} min={1} onChange={(keepEvery) => setValue({ keepEvery })} /></Field>
            <Field label="缩放比例"><NumberInput value={num(draft.outputScale, 100)} min={5} max={200} step={5} onChange={(outputScale) => setValue({ outputScale })} /></Field>
            <Field label="画布"><Select value={String(draft.canvasMode || "auto")} onChange={(canvasMode) => setValue({ canvasMode })} options={[["auto", "自适应居中"], ["square_bottom", "方形底部"], ["square_center", "方形居中"]]} /></Field>
            <Field label="缩边"><NumberInput value={num(draft.reducePx, 0)} min={0} onChange={(reducePx) => setValue({ reducePx })} /></Field>
          </Section>

          <Section title="去背景" compact={isNodeMode}>
            <Check checked={chromaEnabled} onChange={(chromaEnabled) => setValue({ chromaEnabled })}>输出透明背景</Check>
            <Field label="方式" wide><Select value={matteMode} disabled={!chromaEnabled} onChange={(matteMode) => setValue({ matteMode })} options={MATTE_OPTIONS} /></Field>
            {showChroma && <ChromaFields draft={draft} setValue={setValue} />}
            {chromaEnabled && (
              <>
                <Field label="去绿边"><NumberInput value={num(draft.despillStrength, 0.6)} min={0} max={1} step={0.05} onChange={(despillStrength) => setValue({ despillStrength })} /></Field>
                <Field label="收边"><NumberInput value={num(draft.haloPixels, 1)} min={0} onChange={(haloPixels) => setValue({ haloPixels })} /></Field>
              </>
            )}
            {showLuma && <LumaFields draft={draft} setValue={setValue} />}
          </Section>

          <Section title="保护主体" compact={isNodeMode}>
            <Check checked={bool(draft.foregroundProtectEnabled)} onChange={(foregroundProtectEnabled) => setValue({ foregroundProtectEnabled })}>保护相近颜色</Check>
            <Field label="保护色"><TextInput value={String(draft.foregroundProtectHex || "#2f8f3a")} onChange={(foregroundProtectHex) => setValue({ foregroundProtectHex })} /></Field>
            <Field label="范围"><NumberInput value={num(draft.foregroundProtectTolerance, 34)} min={1} max={120} onChange={(foregroundProtectTolerance) => setValue({ foregroundProtectTolerance })} /></Field>
            <Field label="强度"><NumberInput value={num(draft.foregroundProtectStrength, 1)} min={0} max={1} step={0.05} onChange={(foregroundProtectStrength) => setValue({ foregroundProtectStrength })} /></Field>
          </Section>

          <Section title="批量修正" compact={isNodeMode}>
            <Check checked={bool(draft.batchGreenToBlack)} onChange={(batchGreenToBlack) => setValue({ batchGreenToBlack })}>绿边变暗</Check>
            <Check checked={bool(draft.batchGreenDesaturate)} onChange={(batchGreenDesaturate) => setValue({ batchGreenDesaturate })}>淡化绿边</Check>
            <Check checked={bool(draft.batchSemiTransparentToBlack)} onChange={(batchSemiTransparentToBlack) => setValue({ batchSemiTransparentToBlack })}>半透明变暗</Check>
            <Check checked={bool(draft.batchSemiTransparentToOpaque)} onChange={(batchSemiTransparentToOpaque) => setValue({ batchSemiTransparentToOpaque })}>补实半透明</Check>
          </Section>
        </div>
      </div>
      <button type="button" onClick={run} disabled={disabled} className={`${isNodeMode ? "h-9 shrink-0 text-xs" : "h-10 text-sm"} w-full rounded-full border border-lime-200/15 bg-lime-300/[0.12] font-semibold text-lime-100 transition hover:bg-lime-300/[0.18] disabled:cursor-not-allowed disabled:opacity-45`}>{buttonText}</button>
    </div>
  );
}

const PROCESSING_PRESET_OPTIONS = [["fast", "快速"], ["balanced", "均衡"], ["quality", "质量优先"]];

const MATTE_OPTIONS = [["chroma", "快速去绿幕"], ["birefnet_chroma", "AI 保主体去背景"], ["birefnet", "AI 抠主体"], ["corridorkey", "精细绿幕"], ["luma", "按明暗抠图"], ["birefnet_corridorkey", "AI + 精细边缘"], ["birefnet_corridorkey_key", "AI + 收紧绿边"], ["birefnet_luma", "AI + 保留亮部"], ["birefnet_luma_key", "AI + 明暗收边"], ["birefnet_luma_corridorkey", "AI + 亮部 + 精细边缘"], ["none", "不抠图"]];

function ChromaFields({ draft, setValue }: { draft: Record<string, unknown>; setValue: (updates: Record<string, unknown>) => void }) {
  return <><Field label="背景取色"><Select value={String(draft.keyMode || "auto")} onChange={(keyMode) => setValue({ keyMode })} options={[["auto", "自动"], ["manual", "手动"]]} /></Field><Field label="背景色"><TextInput value={String(draft.manualKeyHex || "#00ff00")} onChange={(manualKeyHex) => setValue({ manualKeyHex })} /></Field><Field label="去除强度"><NumberInput value={num(draft.threshold, 42)} onChange={(threshold) => setValue({ threshold })} /></Field><Field label="边缘柔和"><NumberInput value={num(draft.softness, 8)} onChange={(softness) => setValue({ softness })} /></Field></>;
}

function LumaFields({ draft, setValue }: { draft: Record<string, unknown>; setValue: (updates: Record<string, unknown>) => void }) {
  return <><Field label="暗部"><NumberInput value={num(draft.lumaBlack, 0)} onChange={(lumaBlack) => setValue({ lumaBlack })} /></Field><Field label="亮部"><NumberInput value={num(draft.lumaWhite, 85)} onChange={(lumaWhite) => setValue({ lumaWhite })} /></Field><Field label="Gamma"><NumberInput value={num(draft.lumaGamma, 0.55)} step={0.05} onChange={(lumaGamma) => setValue({ lumaGamma })} /></Field><Field label="强度"><NumberInput value={num(draft.lumaStrength, 1.7)} step={0.05} onChange={(lumaStrength) => setValue({ lumaStrength })} /></Field></>;
}

function Section({ title, children, compact = false }: { title: string; children: ReactNode; compact?: boolean }) {
  return <section className={`grid grid-cols-2 gap-2 rounded-xl border border-white/8 bg-white/[0.025] ${compact ? "p-2" : "p-3"}`}><h3 className="col-span-2 text-[11px] font-semibold text-white/50">{title}</h3>{children}</section>;
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? "col-span-2 block" : "block"}><span className="mb-1 block text-[11px] text-white/38">{label}</span>{children}</label>;
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return <label className="col-span-2 flex items-center gap-2 text-xs text-white/68"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-lime-300" />{children}</label>;
}

function NumberInput({ value, onChange, min, max, step }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value || 0))} className={inputClass} />;
}

function TextInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />;
}

function Select({ value, onChange, options, disabled }: { value: string; onChange: (value: string) => void; options: string[][]; disabled?: boolean }) {
  return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass}>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select>;
}
