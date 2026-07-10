import {
  Download,
  FileText,
  LocateFixed,
  X,
} from "lucide-react";
import type { CanvasElement, CanvasAssetStatus } from "@/entities/canvas/model/types";
import type { CanvasAssetExportFormat } from "../lib/assetExport";
import { getCanvasNodeEditorTitle } from "../lib/editor";

const ASSET_TYPE_LABELS: Record<string, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
  sequence: "序列",
  json: "JSON",
  asset_pack: "资产包",
};

const ASSET_STATUS_LABELS: Record<CanvasAssetStatus, string> = {
  draft: "草稿",
  ready: "可导出",
  exported: "已导出",
};

export function CanvasAssetPanel({
  open,
  elements,
  selectedId,
  onClose,
  onLocate,
  onExport,
  onExportFormat,
  onExportManifest,
}: {
  open: boolean;
  elements: CanvasElement[];
  selectedId: string | null;
  onClose: () => void;
  onLocate: (element: CanvasElement) => void;
  onExport: (element: CanvasElement) => void;
  onExportFormat: (element: CanvasElement, format: CanvasAssetExportFormat) => void;
  onExportManifest: () => void;
}) {
  if (!open) return null;

  const assets = elements.filter((element) => Boolean(element.asset));

  return (
    <aside className="fixed left-[96px] top-5 z-40 flex max-h-[calc(100vh-40px)] w-[min(360px,calc(100vw-116px))] flex-col rounded-[24px] border border-white/[0.12] bg-[#02070b]/[0.92] p-3 text-white shadow-[0_26px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <div className="text-[13px] font-semibold text-white/88">资产</div>
          <div className="mt-0.5 text-[11px] text-white/42">{assets.length} 个可交付节点</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-white/48 transition hover:bg-white/[0.1] hover:text-white"
          aria-label="关闭资产面板"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onExportManifest}
        disabled={assets.length === 0}
        className="mb-3 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/[0.13] bg-white/[0.1] text-xs font-medium text-white/78 transition hover:bg-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download className="h-3.5 w-3.5" />
        导出资产包
      </button>

      {assets.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-4 text-sm text-white/48">
          暂无资产
        </div>
      ) : (
        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {assets.map((element) => {
            const asset = element.asset;
            if (!asset) return null;
            const active = element.id === selectedId;
            const title = asset.title || getCanvasNodeEditorTitle(element);
            return (
              <div
                key={element.id}
                className={`rounded-2xl border p-3 transition ${
                  active
                    ? "border-white/[0.2] bg-white/[0.12]"
                    : "border-white/[0.09] bg-white/[0.055] hover:bg-white/[0.08]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onLocate(element)}
                  className="block w-full cursor-pointer text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white/86">{title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-white/46">
                        <span>{ASSET_TYPE_LABELS[asset.type] || asset.type}</span>
                        <span>v{asset.version}</span>
                        <span>{ASSET_STATUS_LABELS[asset.status]}</span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/[0.1] bg-white/[0.07] px-2 py-1 text-[10px] text-white/52">
                      {asset.exportFormats.slice(0, 2).join(" / ") || "导出"}
                    </span>
                  </div>
                </button>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onLocate(element)}
                    className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.06] text-xs font-medium text-white/68 transition hover:bg-white/[0.12] hover:text-white"
                  >
                    <LocateFixed className="h-3.5 w-3.5" />
                    定位
                  </button>
                  {element.kind === "text" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onExportFormat(element, "md")}
                        className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-white/[0.13] bg-white/[0.11] text-xs font-medium text-white/78 transition hover:bg-white/[0.17] hover:text-white"
                      >
                        <Download className="h-3.5 w-3.5" />
                        MD
                      </button>
                      <button
                        type="button"
                        onClick={() => onExportFormat(element, "docx")}
                        className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-white/[0.13] bg-white/[0.11] text-xs font-medium text-white/78 transition hover:bg-white/[0.17] hover:text-white"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        DOCX
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onExport(element)}
                      className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-white/[0.13] bg-white/[0.11] text-xs font-medium text-white/78 transition hover:bg-white/[0.17] hover:text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                      导出
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
