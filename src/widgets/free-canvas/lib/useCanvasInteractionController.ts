import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createCanvasEdge } from "@/entities/canvas/lib/factory";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasTextElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import type { CanvasDraftEdge, CanvasSnapshot } from "../model/types";
import { MAX_SCALE, MIN_SCALE } from "../model/constants";
import {
  clamp,
  getOutputPortPosition,
  isPointInsideElement,
  type CanvasFlowDirection,
} from "./geometry";

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasEdge[] }
  | ((current: CanvasSnapshot) => { elements?: CanvasElement[]; edges?: CanvasEdge[] });

export type CanvasNodeContextMenuState = {
  elementId: string;
  x: number;
  y: number;
} | null;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

function isPanTarget(target: Konva.Node): boolean {
  return target === target.getStage() || target.name() === "grid";
}

export function useCanvasInteractionController(params: {
  stageRef: RefObject<Konva.Stage | null>;
  size: { width: number; height: number };
  viewport: CanvasViewport;
  setViewport: (viewport: CanvasViewport) => void;
  elements: CanvasElement[];
  edges: CanvasEdge[];
  draftEdge: CanvasDraftEdge | null;
  setDraftEdge: (edge: CanvasDraftEdge | null) => void;
  selectedId: string | null;
  selectedEdgeId: string | null;
  setSelectedId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  selectedElementIsGenerating: boolean;
  flowDirection: CanvasFlowDirection;
  commitCanvas: (next: CanvasCommitInput) => void;
  deleteElement: (id: string) => void;
  deleteEdge: (id: string) => void;
  undo: () => void;
  redo: () => void;
  appendAssistantMessage: (content: string) => void;
}) {
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [nodeContextMenu, setNodeContextMenu] =
    useState<CanvasNodeContextMenuState>(null);
  const [previewTextElementId, setPreviewTextElementId] = useState<string | null>(null);
  const [panStart, setPanStart] = useState<{
    pointerX: number;
    pointerY: number;
    viewport: CanvasViewport;
  } | null>(null);

  const setNodeHover = useCallback((id: string) => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
    setHoveredId(id);
  }, []);

  const clearNodeHover = useCallback((id: string) => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current);
    }

    hoverClearTimerRef.current = setTimeout(() => {
      setHoveredId((current) => (current === id ? null : current));
      hoverClearTimerRef.current = null;
    }, 120);
  }, []);

  const closeNodeContextMenu = useCallback(() => {
    setNodeContextMenu(null);
  }, []);

  const openNodeContextMenu = useCallback(
    (elementId: string, event: KonvaEventObject<MouseEvent>) => {
      event.evt.preventDefault();
      event.cancelBubble = true;
      params.setSelectedId(elementId);
      params.setSelectedEdgeId(null);
      setNodeContextMenu({
        elementId,
        x: event.evt.clientX,
        y: event.evt.clientY,
      });
    },
    [params],
  );

  const openNodeDomContextMenu = useCallback(
    (elementId: string, event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      params.setSelectedId(elementId);
      params.setSelectedEdgeId(null);
      setNodeContextMenu({
        elementId,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [params],
  );

  const deleteNodeFromContextMenu = useCallback(() => {
    if (!nodeContextMenu) return;
    params.deleteElement(nodeContextMenu.elementId);
    setPreviewTextElementId((current) =>
      current === nodeContextMenu.elementId ? null : current,
    );
    setNodeContextMenu(null);
  }, [nodeContextMenu, params]);

  const openTextPreview = useCallback((element: CanvasTextElement) => {
    if (element.status === "generating") return;
    setPreviewTextElementId(element.id);
    setNodeContextMenu(null);
  }, []);

  const closeTextPreview = useCallback(() => {
    setPreviewTextElementId(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.key === "Escape") {
        setNodeContextMenu(null);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          params.redo();
        } else {
          params.undo();
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        params.redo();
      }

      if ((event.key === "Backspace" || event.key === "Delete") && params.selectedEdgeId) {
        event.preventDefault();
        params.deleteEdge(params.selectedEdgeId);
        setNodeContextMenu(null);
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && params.selectedId) {
        event.preventDefault();
        params.deleteElement(params.selectedId);
        setNodeContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [params]);

  useEffect(() => {
    return () => {
      if (hoverClearTimerRef.current) {
        clearTimeout(hoverClearTimerRef.current);
      }
    };
  }, []);

  const handleStartConnection = useCallback(
    (element: CanvasElement, event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      event.cancelBubble = true;
      const pointer = params.stageRef.current?.getPointerPosition();
      const from = getOutputPortPosition(element, params.flowDirection);
      const to = pointer
        ? {
            x: (pointer.x - params.viewport.x) / params.viewport.scale,
            y: (pointer.y - params.viewport.y) / params.viewport.scale,
          }
        : from;

      params.setSelectedId(null);
      params.setSelectedEdgeId(null);
      params.setDraftEdge({
        sourceId: element.id,
        from,
        to,
      });
    },
    [params],
  );

  const handleWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault();
      closeNodeContextMenu();
      const pointer = params.stageRef.current?.getPointerPosition();
      if (!pointer) return;

      const scaleBy = 1.08;
      const oldScale = params.viewport.scale;
      const direction = event.evt.deltaY > 0 ? -1 : 1;
      const nextScale = clamp(
        direction > 0 ? oldScale * scaleBy : oldScale / scaleBy,
        MIN_SCALE,
        MAX_SCALE,
      );
      const mousePointTo = {
        x: (pointer.x - params.viewport.x) / oldScale,
        y: (pointer.y - params.viewport.y) / oldScale,
      };

      params.setViewport({
        x: pointer.x - mousePointTo.x * nextScale,
        y: pointer.y - mousePointTo.y * nextScale,
        scale: nextScale,
      });
    },
    [closeNodeContextMenu, params],
  );

  const setCanvasScale = useCallback(
    (nextScale: number) => {
      const clampedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const anchor = {
        x: params.size.width / 2,
        y: params.size.height / 2,
      };
      const worldPoint = {
        x: (anchor.x - params.viewport.x) / params.viewport.scale,
        y: (anchor.y - params.viewport.y) / params.viewport.scale,
      };

      params.setViewport({
        x: anchor.x - worldPoint.x * clampedScale,
        y: anchor.y - worldPoint.y * clampedScale,
        scale: clampedScale,
      });
    },
    [params],
  );

  const handleStagePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      closeNodeContextMenu();
      if (!isPanTarget(event.target)) return;
      const pointer = params.stageRef.current?.getPointerPosition();
      if (!pointer) return;

      if (!params.selectedElementIsGenerating) {
        params.setSelectedId(null);
      }
      params.setSelectedEdgeId(null);
      params.setDraftEdge(null);
      setPanStart({
        pointerX: pointer.x,
        pointerY: pointer.y,
        viewport: params.viewport,
      });
    },
    [closeNodeContextMenu, params],
  );

  const handleStagePointerMove = useCallback(() => {
    const pointer = params.stageRef.current?.getPointerPosition();
    if (!pointer) return;

    if (params.draftEdge) {
      params.setDraftEdge({
        ...params.draftEdge,
        to: {
          x: (pointer.x - params.viewport.x) / params.viewport.scale,
          y: (pointer.y - params.viewport.y) / params.viewport.scale,
        },
      });
      return;
    }

    if (!panStart) return;

    params.setViewport({
      ...panStart.viewport,
      x: panStart.viewport.x + pointer.x - panStart.pointerX,
      y: panStart.viewport.y + pointer.y - panStart.pointerY,
    });
  }, [panStart, params]);

  const handleStagePointerUp = useCallback(() => {
    const activeDraftEdge = params.draftEdge;

    if (activeDraftEdge) {
      const target = params.elements.find(
        (element) =>
          element.id !== activeDraftEdge.sourceId &&
          isPointInsideElement(activeDraftEdge.to, element),
      );

      if (target) {
        const exists = params.edges.some(
          (edge) =>
            edge.sourceId === activeDraftEdge.sourceId &&
            edge.targetId === target.id,
        );

        if (!exists) {
          params.commitCanvas({
            edges: [
              ...params.edges,
              createCanvasEdge({
                sourceId: activeDraftEdge.sourceId,
                targetId: target.id,
              }),
            ],
          });
        }
      }

      params.setDraftEdge(null);
      return;
    }

    setPanStart(null);
  }, [params]);

  return {
    hoveredId,
    nodeContextMenu,
    previewTextElementId,
    panStart,
    setNodeHover,
    clearNodeHover,
    closeNodeContextMenu,
    openNodeContextMenu,
    openNodeDomContextMenu,
    deleteNodeFromContextMenu,
    openTextPreview,
    closeTextPreview,
    handleStartConnection,
    handleWheel,
    setCanvasScale,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerUp,
  };
}
