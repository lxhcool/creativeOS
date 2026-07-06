import {
  ArrowDown,
  ArrowRight,
  Download,
  Eraser,
  FolderOpen,
  History,
  ImageDown,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CanvasViewport } from "@/entities/canvas/model/types";
import type { CanvasFlowDirection } from "../lib/geometry";

export function CanvasTopToolbar({
  panelClassName,
  canUndo,
  canRedo,
  viewport,
  projects,
  currentProjectId,
  scaleOptions,
  onUndo,
  onRedo,
  onClear,
  onDeleteProject,
  onOpenProject,
  onSaveCanvas,
  onExportFile,
  onOpenImport,
  onOpenSaveHistory,
  onExportPng,
  onSetCanvasScale,
  flowDirection,
  onSetFlowDirection,
  showFlowDirection = true,
  saveHistoryCount,
}: {
  panelClassName: string;
  canUndo: boolean;
  canRedo: boolean;
  viewport: CanvasViewport;
  projects: Array<{
    id: string;
    name: string;
    nodeCount: number;
    edgeCount: number;
  }>;
  currentProjectId: string | null;
  scaleOptions: number[];
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDeleteProject: () => void;
  onOpenProject: (projectId: string) => void;
  onSaveCanvas: () => void;
  onExportFile: () => void;
  onOpenImport: () => void;
  onOpenSaveHistory: () => void;
  onExportPng: () => void;
  onSetCanvasScale: (scale: number) => void;
  flowDirection: CanvasFlowDirection;
  onSetFlowDirection: (direction: CanvasFlowDirection) => void;
  showFlowDirection?: boolean;
  saveHistoryCount: number;
}) {
  return (
    <div className={`fixed right-5 top-5 z-20 flex items-center gap-2 rounded-2xl p-2 ${panelClassName}`}>
      <label className="relative block">
        <span className="sr-only">当前画布</span>
        <select
          value={currentProjectId || ""}
          onChange={(event) => onOpenProject(event.target.value)}
          className="h-9 max-w-[168px] appearance-none rounded-full border border-white/10 bg-black/[0.18] px-3 pr-7 text-xs font-medium text-white/72 outline-none transition hover:bg-white/[0.08] hover:text-white focus:border-white/25"
          aria-label="选择画布"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/35">
          ▾
        </span>
      </label>
      <IconAction title="删除当前画布" disabled={!currentProjectId} onClick={onDeleteProject}>
        <Trash2 className="h-4 w-4" />
      </IconAction>
      <IconAction title="撤销" disabled={!canUndo} onClick={onUndo}>
        <Undo2 className="h-4 w-4" />
      </IconAction>
      <IconAction title="重做" disabled={!canRedo} onClick={onRedo}>
        <Redo2 className="h-4 w-4" />
      </IconAction>
      <IconAction title="清空当前画布内容" onClick={onClear}>
        <Eraser className="h-4 w-4" />
      </IconAction>
      <IconAction title="保存画布" onClick={onSaveCanvas}>
        <Save className="h-4 w-4" />
      </IconAction>
      {showFlowDirection && (
        <div className="flex h-9 items-center rounded-full border border-white/10 bg-black/[0.18] p-1">
          <DirectionAction
            title="横向视图"
            active={flowDirection === "horizontal"}
            onClick={() => onSetFlowDirection("horizontal")}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </DirectionAction>
          <DirectionAction
            title="竖向视图"
            active={flowDirection === "vertical"}
            onClick={() => onSetFlowDirection("vertical")}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </DirectionAction>
        </div>
      )}
      <IconAction title="导出到本地" onClick={onExportFile}>
        <Download className="h-4 w-4" />
      </IconAction>
      <IconAction title="打开本地文件" onClick={onOpenImport}>
        <FolderOpen className="h-4 w-4" />
      </IconAction>
      <IconAction
        title="保存记录"
        onClick={onOpenSaveHistory}
        badge={saveHistoryCount > 0 ? String(Math.min(saveHistoryCount, 99)) : undefined}
      >
        <History className="h-4 w-4" />
      </IconAction>
      <button
        type="button"
        onClick={onExportPng}
        className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white/70 transition hover:bg-white/[0.14] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
      >
        <ImageDown className="h-3.5 w-3.5" />
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

function DirectionAction({
  children,
  title,
  active,
  onClick,
}: {
  children: ReactNode;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 ${
        active
          ? "bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "text-white/45 hover:bg-white/[0.08] hover:text-white/78"
      }`}
    >
      {children}
    </button>
  );
}

function IconAction({
  children,
  title,
  disabled,
  onClick,
  badge,
}: {
  children: ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/65 transition hover:bg-white/[0.14] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
      {badge && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-white/10 bg-white/[0.16] px-1 text-[9px] font-semibold leading-none text-white shadow-lg shadow-black/30">
          {badge}
        </span>
      )}
    </button>
  );
}
