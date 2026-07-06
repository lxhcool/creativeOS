import { type FormEvent, type ReactNode, useEffect } from "react";
import { Eye, FileDown, RotateCcw, Trash2, X } from "lucide-react";
import { Group, Rect, Text } from "react-konva";
import { CANVAS_WORKFLOW_OPTIONS, type CanvasWorkflowGroup } from "@/features/canvas-workflows";
import type { CanvasProjectExport, CanvasWorkflowType } from "@/entities/canvas/model/types";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../model/constants";

type CanvasSaveHistoryItem = {
  id: string;
  name: string;
  savedAt: string;
  nodeCount: number;
  edgeCount: number;
  payload: CanvasProjectExport;
};

export function CanvasNodeContextMenu({
  x,
  y,
  viewportWidth,
  viewportHeight,
  title,
  canPreview,
  onPreview,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  title: string;
  canPreview?: boolean;
  onPreview?: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menuWidth = 184;
  const menuHeight = canPreview ? 140 : 96;
  const left = Math.min(Math.max(8, x), Math.max(8, viewportWidth - menuWidth - 8));
  const top = Math.min(Math.max(8, y), Math.max(8, viewportHeight - menuHeight - 8));

  useEffect(() => {
    const handlePointerDown = () => onClose();

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  return (
    <div
      className="fixed z-[90] w-[184px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#02070b]/[0.94] p-1.5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="truncate px-2.5 pb-1.5 pt-1 text-[11px] font-medium text-white/42">
        {title}
      </div>
      {canPreview && onPreview && (
        <button
          type="button"
          onClick={onPreview}
          className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-semibold text-white/78 transition-colors duration-200 hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
        >
          <Eye className="h-4 w-4 shrink-0" />
          预览内容
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-semibold text-rose-100/90 transition-colors duration-200 hover:bg-rose-400/[0.14] hover:text-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/20"
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        删除节点
      </button>
    </div>
  );
}

export function CanvasWorkflowGroupNode({ group }: { group: CanvasWorkflowGroup }) {
  return (
    <Group listening={false}>
      <Rect
        x={group.x}
        y={group.y}
        width={Math.max(group.width, DEFAULT_NODE_WIDTH + 96)}
        height={Math.max(group.height, DEFAULT_NODE_HEIGHT + 118)}
        cornerRadius={24}
        fill="rgba(255,255,255,0.022)"
        stroke="rgba(255,255,255,0)"
        strokeWidth={0}
        shadowColor={group.color}
        shadowBlur={34}
        shadowOpacity={0.08}
      />
      <Group x={group.x + 4} y={group.y - 34} listening={false}>
        <Rect
          x={0}
          y={0}
          width={112}
          height={24}
          cornerRadius={12}
          fill="rgba(2,7,11,0.78)"
          stroke="rgba(255,255,255,0)"
          strokeWidth={0}
        />
        <Rect x={11} y={8} width={8} height={8} cornerRadius={2} fill={group.color} />
        <Text
          x={28}
          y={6}
          text={group.title}
          fontSize={12}
          fontStyle="600"
          fill="rgba(255,255,255,0.72)"
          listening={false}
        />
      </Group>
    </Group>
  );
}

export function CanvasConfirmModal({
  title,
  description,
  confirmText,
  tone = "default",
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmText: string;
  tone?: "default" | "danger";
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/42 px-5 py-7 backdrop-blur-[6px]"
      onMouseDown={onClose}
    >
      <section
        className="w-[min(420px,calc(100vw-40px))] rounded-[18px] border border-white/[0.1] bg-[#02070b]/[0.96] p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.07)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white/90">{title}</h2>
            <p className="mt-2 text-[13px] leading-6 text-white/56">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/58 transition-colors duration-200 hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
            aria-label="关闭确认"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 cursor-pointer rounded-full border border-white/[0.1] bg-white/[0.06] px-4 text-sm font-medium text-white/72 transition hover:bg-white/[0.12] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 ${
              tone === "danger"
                ? "border-rose-200/[0.16] bg-rose-400/[0.14] text-rose-50 hover:bg-rose-400/[0.22] focus-visible:ring-rose-200/20"
                : "border-white/[0.14] bg-white/[0.13] text-white hover:bg-white/[0.18] focus-visible:ring-white/15"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </section>
    </div>
  );
}

export function CanvasProjectNameModal({
  value,
  workflowType,
  onChange,
  onWorkflowTypeChange,
  onSubmit,
  onClose,
}: {
  value: string;
  workflowType: CanvasWorkflowType;
  onChange: (value: string) => void;
  onWorkflowTypeChange: (value: CanvasWorkflowType) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const normalizedValue = value.trim();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/42 px-5 py-7 backdrop-blur-[6px]"
      onMouseDown={onClose}
    >
      <form
        onSubmit={onSubmit}
        className="w-[min(420px,calc(100vw-40px))] rounded-[18px] border border-white/[0.1] bg-[#02070b]/[0.96] p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.07)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white/90">新建画布</h2>
            <p className="mt-1 text-[12px] text-white/42">给这次创作取一个容易识别的名称。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/58 transition-colors duration-200 hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
            aria-label="关闭新建画布"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-medium text-white/55">画布名称</span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoFocus
            maxLength={40}
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/[0.22] px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25"
            placeholder="例如：大明重生小说设定"
          />
        </label>
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-white/55">创作工作流</div>
          <div className="grid grid-cols-2 gap-2">
            {CANVAS_WORKFLOW_OPTIONS.map((option) => {
              const selected = option.type === workflowType;

              return (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => onWorkflowTypeChange(option.type)}
                  className={`rounded-2xl border px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 ${
                    selected
                      ? "border-white/[0.18] bg-white/[0.12] text-white shadow-lg shadow-black/20"
                      : "border-white/[0.08] bg-white/[0.05] text-white/62 hover:border-white/[0.14] hover:bg-white/[0.09] hover:text-white/86"
                  }`}
                >
                  <div className="text-[13px] font-semibold">{option.label}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-white/42">
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="submit"
          disabled={!normalizedValue}
          className="mt-5 h-11 w-full cursor-pointer rounded-full border border-white/[0.14] bg-white/[0.13] text-sm font-medium text-white transition hover:bg-white/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
        >
          创建并进入
        </button>
      </form>
    </div>
  );
}

function formatSaveHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function CanvasSaveHistoryModal({
  items,
  projectName,
  onClose,
  onRestore,
  onDownload,
  onDelete,
}: {
  items: CanvasSaveHistoryItem[];
  projectName: string;
  onClose: () => void;
  onRestore: (item: CanvasSaveHistoryItem) => void;
  onDownload: (item: CanvasSaveHistoryItem) => void;
  onDelete: (id: string) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-end bg-black/30 px-5 py-20 backdrop-blur-[4px]"
      onMouseDown={onClose}
    >
      <section
        className="flex max-h-[min(620px,calc(100vh-112px))] w-[min(420px,calc(100vw-40px))] flex-col overflow-hidden rounded-[18px] border border-white/[0.1] bg-[#02070b]/[0.96] text-white shadow-[0_28px_80px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.07)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/[0.08] px-4">
          <div>
            <h2 className="text-[13px] font-semibold text-white/88">保存记录</h2>
            <p className="mt-0.5 text-[11px] text-white/38">
              {projectName} · 最近 {items.length} 个快照
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/58 transition-colors duration-200 hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
            aria-label="关闭保存记录"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-color:rgba(255,255,255,0.22)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-8 text-center">
              <div className="text-[13px] font-medium text-white/72">还没有保存记录</div>
              <div className="mt-1 text-[12px] leading-5 text-white/42">
                点击顶部保存按钮后，会在这里保留最近的画布快照。
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.055] p-3 transition-colors duration-200 hover:bg-white/[0.08]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[13px] font-semibold text-white/84">
                        {item.name}
                      </h3>
                      <div className="mt-1 text-[11px] text-white/40">
                        {formatSaveHistoryTime(item.savedAt)} · {item.nodeCount} 节点 ·{" "}
                        {item.edgeCount} 连线
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <HistoryAction title="恢复" onClick={() => onRestore(item)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </HistoryAction>
                      <HistoryAction title="下载" onClick={() => onDownload(item)}>
                        <FileDown className="h-3.5 w-3.5" />
                      </HistoryAction>
                      <HistoryAction
                        title="删除"
                        tone="danger"
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </HistoryAction>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function HistoryAction({
  children,
  title,
  tone,
  onClick,
}: {
  children: ReactNode;
  title: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/[0.08] transition-colors duration-200 focus:outline-none focus-visible:ring-2 ${
        tone === "danger"
          ? "bg-rose-400/[0.08] text-rose-100/70 hover:bg-rose-400/[0.16] hover:text-rose-50 focus-visible:ring-rose-200/20"
          : "bg-white/[0.06] text-white/62 hover:bg-white/[0.14] hover:text-white focus-visible:ring-white/15"
      }`}
      aria-label={title}
    >
      {children}
    </button>
  );
}

export function CanvasTextPreviewModal({
  title,
  color,
  content,
  onClose,
}: {
  title: string;
  color: string;
  content: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/42 px-5 py-7 backdrop-blur-[6px]"
      onMouseDown={onClose}
    >
      <section
        className="flex h-[min(480px,calc(100vh-56px))] min-h-[min(400px,calc(100vh-56px))] w-[min(768px,calc(100vw-40px))] min-w-[min(600px,calc(100vw-40px))] flex-col overflow-hidden rounded-[18px] border border-white/[0.1] bg-[#02070b]/[0.96] text-white shadow-[0_28px_80px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.07)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/[0.08] px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_14px_currentColor]"
              style={{ color, backgroundColor: color }}
            />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-white/88">
                {title}
              </div>
              <div className="text-[11px] text-white/38">
                {content.length} 字
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/58 transition-colors duration-200 hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
            aria-label="关闭预览"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-color:rgba(255,255,255,0.22)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
          <article className="mx-auto max-w-[58ch] whitespace-pre-wrap text-[14px] leading-7 text-white/84">
            {content}
          </article>
        </div>
      </section>
    </div>
  );
}
