import {
  Download,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CanvasViewport } from "@/entities/canvas/model/types";

export function CanvasTopToolbar({
  panelClassName,
  canUndo,
  canRedo,
  viewport,
  scaleOptions,
  onUndo,
  onRedo,
  onClear,
  onExportJson,
  onExportPng,
  onSetCanvasScale,
}: {
  panelClassName: string;
  canUndo: boolean;
  canRedo: boolean;
  viewport: CanvasViewport;
  scaleOptions: number[];
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExportJson: () => void;
  onExportPng: () => void;
  onSetCanvasScale: (scale: number) => void;
}) {
  return (
    <div className={`fixed right-5 top-5 z-20 flex items-center gap-2 rounded-2xl p-2 ${panelClassName}`}>
      <IconAction title="撤销" disabled={!canUndo} onClick={onUndo}>
        <Undo2 className="h-4 w-4" />
      </IconAction>
      <IconAction title="重做" disabled={!canRedo} onClick={onRedo}>
        <Redo2 className="h-4 w-4" />
      </IconAction>
      <IconAction title="清空画布" onClick={onClear}>
        <Trash2 className="h-4 w-4" />
      </IconAction>
      <IconAction title="导出 JSON" onClick={onExportJson}>
        <Download className="h-4 w-4" />
      </IconAction>
      <button
        type="button"
        onClick={onExportPng}
        className="h-9 rounded-full border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white/70 transition hover:bg-white/[0.14] hover:text-white"
      >
        PNG
      </button>
      <label className="relative block">
        <span className="sr-only">画布缩放</span>
        <select
          value={String(scaleOptions.includes(viewport.scale) ? viewport.scale : "")}
          onChange={(event) => onSetCanvasScale(Number(event.target.value))}
          className="h-9 min-w-20 appearance-none rounded-full border border-white/10 bg-black/[0.18] px-4 pr-7 text-center text-xs font-medium text-white/60 outline-none transition hover:bg-white/[0.08] hover:text-white focus:border-white/25"
          aria-label="选择画布缩放比例"
        >
          {!scaleOptions.includes(viewport.scale) && (
            <option value="" disabled>
              {Math.round(viewport.scale * 100)}%
            </option>
          )}
          {scaleOptions.map((scale) => (
            <option key={scale} value={scale}>
              {Math.round(scale * 100)}%
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/35">
          ▾
        </span>
      </label>
    </div>
  );
}

function IconAction({
  children,
  title,
  disabled,
  onClick,
}: {
  children: ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/65 transition hover:bg-white/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
