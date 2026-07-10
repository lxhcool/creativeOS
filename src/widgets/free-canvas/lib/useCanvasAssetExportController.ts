import { useCallback } from "react";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import {
  exportCanvasAsset,
  exportCanvasAssetAs,
  exportCanvasAssetPackage,
  type CanvasAssetExportFormat,
} from "./assetExport";

export function useCanvasAssetExportController(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  projectName?: string;
  viewportSize: { width: number; height: number };
  setSelectedId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setViewport: (updater: (current: CanvasViewport) => CanvasViewport) => void;
  patchElementDraft: (id: string, updates: Partial<CanvasElement>) => void;
  showCanvasSaveStatus: (message: string) => void;
}) {
  const {
    elements,
    edges,
    projectName,
    viewportSize,
    setSelectedId,
    setSelectedEdgeId,
    setViewport,
    patchElementDraft,
    showCanvasSaveStatus,
  } = params;

  const locateCanvasElement = useCallback(
    (element: CanvasElement) => {
      setSelectedId(element.id);
      setSelectedEdgeId(null);
      setViewport((current) => ({
        ...current,
        x: viewportSize.width / 2 - (element.x + element.width / 2) * current.scale,
        y: viewportSize.height / 2 - (element.y + element.height / 2) * current.scale,
      }));
    },
    [setSelectedEdgeId, setSelectedId, setViewport, viewportSize.height, viewportSize.width],
  );

  const exportSingleAsset = useCallback(
    (element: CanvasElement, format?: CanvasAssetExportFormat) => {
      const exported = format
        ? exportCanvasAssetAs(element, format)
        : exportCanvasAsset(element);
      if (!exported) {
        showCanvasSaveStatus("这个资产暂时没有可导出的内容");
        return;
      }

      if (element.asset?.status !== "exported") {
        patchElementDraft(element.id, {
          asset: {
            ...element.asset,
            status: "exported",
          },
        } as Partial<CanvasElement>);
      }
      showCanvasSaveStatus("资产已导出");
    },
    [patchElementDraft, showCanvasSaveStatus],
  );

  const exportAssetManifest = useCallback(async () => {
    const result = await exportCanvasAssetPackage({
      elements,
      edges,
      projectName,
    });

    if (result.assetCount === 0) {
      showCanvasSaveStatus("当前画布暂无资产");
      return;
    }

    elements.forEach((element) => {
      if (!element.asset || element.asset.status === "exported") return;
      patchElementDraft(element.id, {
        asset: {
          ...element.asset,
          status: "exported",
        },
      } as Partial<CanvasElement>);
    });
    showCanvasSaveStatus(
      result.skippedMediaCount > 0
        ? `资产包已导出：${result.assetCount} 个资产，${result.skippedMediaCount} 个媒体保留为链接`
        : `资产包已导出：${result.assetCount} 个资产`,
    );
  }, [edges, elements, patchElementDraft, projectName, showCanvasSaveStatus]);

  return {
    locateCanvasElement,
    exportSingleAsset,
    exportAssetManifest,
  };
}
