import { useMemo } from "react";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasProcessorElement,
  CanvasTemplateElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import {
  getInputPortPosition,
  getOutputPortPosition,
  type CanvasFlowDirection,
} from "./geometry";

const CANVAS_RENDER_PADDING = 900;
const CANVAS_CULLING_STEP = 360;

type CanvasWorldBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type RenderableCanvasEdge = {
  edge: CanvasEdge;
  source: CanvasElement;
  target: CanvasElement;
};

type CanvasRenderWindowParams = {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
  size: { width: number; height: number };
  selectedId: string | null;
  selectedEdgeId: string | null;
  hoveredId: string | null;
  draggingElementId: string | null;
  flowDirection?: CanvasFlowDirection;
  draftSourceId?: string;
};

function getVisibleWorldBounds(
  viewport: CanvasViewport,
  size: { width: number; height: number },
): CanvasWorldBounds {
  const padding = CANVAS_RENDER_PADDING / viewport.scale;
  return {
    left: (0 - viewport.x) / viewport.scale - padding,
    top: (0 - viewport.y) / viewport.scale - padding,
    right: (size.width - viewport.x) / viewport.scale + padding,
    bottom: (size.height - viewport.y) / viewport.scale + padding,
  };
}

function getCullingViewport(params: {
  bucketX: number;
  bucketY: number;
  scaleBucket: number;
}): CanvasViewport {
  return {
    x: params.bucketX * CANVAS_CULLING_STEP,
    y: params.bucketY * CANVAS_CULLING_STEP,
    scale: params.scaleBucket / 100,
  };
}

function isElementInBounds(
  element: CanvasElement,
  bounds: CanvasWorldBounds,
): boolean {
  return (
    element.x + element.width >= bounds.left &&
    element.x <= bounds.right &&
    element.y + element.height >= bounds.top &&
    element.y <= bounds.bottom
  );
}

function isConnectorInBounds(
  source: CanvasElement,
  target: CanvasElement,
  bounds: CanvasWorldBounds,
  direction: CanvasFlowDirection,
): boolean {
  const sourcePort = getOutputPortPosition(source, direction);
  const targetPort = getInputPortPosition(target, direction);
  const left = Math.min(sourcePort.x, targetPort.x);
  const right = Math.max(sourcePort.x, targetPort.x);
  const top = Math.min(sourcePort.y, targetPort.y);
  const bottom = Math.max(sourcePort.y, targetPort.y);

  return (
    right >= bounds.left &&
    left <= bounds.right &&
    bottom >= bounds.top &&
    top <= bounds.bottom
  );
}

function isNextChapterOutlineAuxiliaryEdge(params: {
  edge: CanvasEdge;
  target: CanvasElement;
}): boolean {
  void params;
  return false;
}

export function useCanvasRenderWindow(params: CanvasRenderWindowParams) {
  const flowDirection = params.flowDirection || "horizontal";
  const elementById = useMemo(() => {
    return new Map(params.elements.map((element) => [element.id, element]));
  }, [params.elements]);

  const cullingBucketX = Math.round(params.viewport.x / CANVAS_CULLING_STEP);
  const cullingBucketY = Math.round(params.viewport.y / CANVAS_CULLING_STEP);
  const cullingScaleBucket = Math.round(params.viewport.scale * 100);
  const cullingViewport = useMemo(
    () =>
      getCullingViewport({
        bucketX: cullingBucketX,
        bucketY: cullingBucketY,
        scaleBucket: cullingScaleBucket,
      }),
    [cullingBucketX, cullingBucketY, cullingScaleBucket],
  );
  const visibleWorldBounds = useMemo(
    () => getVisibleWorldBounds(cullingViewport, params.size),
    [cullingViewport, params.size],
  );
  const alwaysRenderedElementIds = useMemo(() => {
    return new Set(
      [
        params.selectedId,
        params.hoveredId,
        params.draggingElementId,
        params.draftSourceId,
      ].filter((id): id is string => Boolean(id)),
    );
  }, [
    params.draftSourceId,
    params.draggingElementId,
    params.hoveredId,
    params.selectedId,
  ]);
  const visibleElements = useMemo(
    () =>
      params.elements.filter(
        (element) =>
          alwaysRenderedElementIds.has(element.id) ||
          isElementInBounds(element, visibleWorldBounds),
      ),
    [alwaysRenderedElementIds, params.elements, visibleWorldBounds],
  );
  const visibleEdges = useMemo<RenderableCanvasEdge[]>(
    () =>
      params.edges
        .map((edge) => {
          const source = elementById.get(edge.sourceId);
          const target = elementById.get(edge.targetId);
          if (!source || !target) return null;
          if (isNextChapterOutlineAuxiliaryEdge({ edge, target })) return null;

          const visible =
            edge.id === params.selectedEdgeId ||
            alwaysRenderedElementIds.has(source.id) ||
            alwaysRenderedElementIds.has(target.id) ||
            isElementInBounds(source, visibleWorldBounds) ||
            isElementInBounds(target, visibleWorldBounds) ||
            isConnectorInBounds(source, target, visibleWorldBounds, flowDirection);

          return visible ? { edge, source, target } : null;
        })
        .filter((edge): edge is RenderableCanvasEdge => Boolean(edge)),
    [
      alwaysRenderedElementIds,
      elementById,
      params.edges,
      params.selectedEdgeId,
      flowDirection,
      visibleWorldBounds,
    ],
  );
  const processorOverlayElements = useMemo(
    () =>
      visibleElements.filter(
        (element): element is CanvasProcessorElement => element.kind === "processor",
      ),
    [visibleElements],
  );
  const frameSequenceOverlayElements = useMemo(
    () =>
      visibleElements.filter(
        (element): element is CanvasTemplateElement =>
          element.kind === "template" &&
          element.templateId === "frame-sequence-list",
      ),
    [visibleElements],
  );

  return {
    elementById,
    frameSequenceOverlayElements,
    processorOverlayElements,
    visibleEdges,
    visibleElements,
  };
}
