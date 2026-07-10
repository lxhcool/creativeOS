import type {
  CanvasElement,
  CanvasSaveHistoryItem,
  CanvasTextElement,
} from "@/entities/canvas/model/types";
import {
  getCanvasNodeEditorTitle,
} from "../lib/editor";
import { getTextNodeBadge } from "./CanvasElementNode";
import {
  CanvasConfirmModal,
  CanvasNodeContextMenu,
  CanvasSaveHistoryModal,
  CanvasTextPreviewModal,
} from "./CanvasShellOverlays";

export function CanvasShellOverlayLayer(params: {
  viewportSize: { width: number; height: number };
  nodeContextMenu: { elementId: string; x: number; y: number } | null;
  contextMenuElement: CanvasElement | null;
  previewTextElement: CanvasTextElement | null;
  canvasSaveStatus: string | null;
  saveHistoryOpen: boolean;
  saveHistory: CanvasSaveHistoryItem[];
  currentProjectName: string;
  deleteProjectConfirmOpen: boolean;
  clearCanvasConfirmOpen: boolean;
  onCloseNodeContextMenu: () => void;
  onDeleteNodeFromContextMenu: () => void;
  onOpenTextPreview: (element: CanvasTextElement) => void;
  onCloseTextPreview: () => void;
  onExportAsset: (element: CanvasElement) => void;
  onCloseSaveHistory: () => void;
  onRestoreSaveHistory: (item: CanvasSaveHistoryItem) => void;
  onDownloadSaveHistory: (item: CanvasSaveHistoryItem) => void;
  onDeleteSaveHistory: (id: string) => void;
  onCloseDeleteProjectConfirm: () => void;
  onConfirmDeleteProject: () => void;
  onCloseClearCanvasConfirm: () => void;
  onConfirmClearCanvas: () => void;
}) {
  const {
    nodeContextMenu,
    contextMenuElement,
    previewTextElement,
  } = params;

  return (
    <>
      {nodeContextMenu && contextMenuElement && (
        <CanvasNodeContextMenu
          x={nodeContextMenu.x}
          y={nodeContextMenu.y}
          viewportWidth={params.viewportSize.width}
          viewportHeight={params.viewportSize.height}
          title={getCanvasNodeEditorTitle(contextMenuElement)}
          canPreview={contextMenuElement.kind === "text"}
          canExport={Boolean(contextMenuElement.asset)}
          onPreview={
            contextMenuElement.kind === "text"
              ? () => params.onOpenTextPreview(contextMenuElement)
              : undefined
          }
          onExport={
            contextMenuElement.asset
              ? () => params.onExportAsset(contextMenuElement)
              : undefined
          }
          onDelete={params.onDeleteNodeFromContextMenu}
          onClose={params.onCloseNodeContextMenu}
        />
      )}

      {previewTextElement && (
        <CanvasTextPreviewModal
          title={getTextNodeBadge(previewTextElement).title}
          color={getTextNodeBadge(previewTextElement).color}
          content={previewTextElement.text.trim() || "暂无内容"}
          onClose={params.onCloseTextPreview}
        />
      )}

      {params.canvasSaveStatus && (
        <div className="fixed right-5 top-[82px] z-30 rounded-full border border-white/10 bg-[#02070b]/90 px-3.5 py-2 text-[12px] font-medium text-white/76 shadow-2xl shadow-black/35 backdrop-blur-xl">
          {params.canvasSaveStatus}
        </div>
      )}

      {params.saveHistoryOpen && (
        <CanvasSaveHistoryModal
          items={params.saveHistory}
          projectName={params.currentProjectName}
          onClose={params.onCloseSaveHistory}
          onRestore={params.onRestoreSaveHistory}
          onDownload={params.onDownloadSaveHistory}
          onDelete={params.onDeleteSaveHistory}
        />
      )}

      {params.deleteProjectConfirmOpen && (
        <CanvasConfirmModal
          title="删除画布"
          description={`确定删除画布「${params.currentProjectName}」吗？此操作会同时删除画布内容和保存记录，无法恢复。`}
          confirmText="确认删除"
          tone="danger"
          onClose={params.onCloseDeleteProjectConfirm}
          onConfirm={params.onConfirmDeleteProject}
        />
      )}

      {params.clearCanvasConfirmOpen && (
        <CanvasConfirmModal
          title="清空画布内容"
          description="确定清空当前画布里的所有节点和连线吗？画布项目仍会保留。"
          confirmText="确认清空"
          tone="danger"
          onClose={params.onCloseClearCanvasConfirm}
          onConfirm={params.onConfirmClearCanvas}
        />
      )}
    </>
  );
}
