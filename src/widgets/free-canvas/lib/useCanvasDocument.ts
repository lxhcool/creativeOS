import { useCallback, useRef, useState } from "react";
import type { CanvasEdge, CanvasElement } from "@/entities/canvas/model/types";
import { HISTORY_LIMIT } from "../model/constants";
import type { CanvasDraftEdge, CanvasSnapshot } from "../model/types";

export function useCanvasDocument() {
  const dragSnapshotRef = useRef<CanvasElement[] | null>(null);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [past, setPast] = useState<CanvasSnapshot[]>([]);
  const [future, setFuture] = useState<CanvasSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [draftEdge, setDraftEdge] = useState<CanvasDraftEdge | null>(null);
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);

  const commitCanvas = useCallback(
    (next: { elements?: CanvasElement[]; edges?: CanvasEdge[] }) => {
      setPast((current) => [
        ...current.slice(-(HISTORY_LIMIT - 1)),
        { elements, edges },
      ]);
      setElements(next.elements ?? elements);
      setEdges(next.edges ?? edges);
      setFuture([]);
    },
    [edges, elements],
  );

  const commitElements = useCallback(
    (nextElements: CanvasElement[]) => {
      const nextElementIds = new Set(nextElements.map((element) => element.id));
      commitCanvas({
        elements: nextElements,
        edges: edges.filter(
          (edge) =>
            nextElementIds.has(edge.sourceId) && nextElementIds.has(edge.targetId),
        ),
      });
    },
    [commitCanvas, edges],
  );

  const updateElement = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      commitElements(
        elements.map((element) =>
          element.id === id ? ({ ...element, ...updates } as CanvasElement) : element,
        ),
      );
    },
    [commitElements, elements],
  );

  const patchElementDraft = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      setElements((current) =>
        current.map((element) =>
          element.id === id ? ({ ...element, ...updates } as CanvasElement) : element,
        ),
      );
    },
    [],
  );

  const previewUpdateElement = patchElementDraft;

  const beginElementDrag = useCallback(
    (id: string) => {
      dragSnapshotRef.current = elements;
      setDraggingElementId(id);
    },
    [elements],
  );

  const finishElementDrag = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      const snapshot = dragSnapshotRef.current;
      dragSnapshotRef.current = null;
      setDraggingElementId(null);

      if (!snapshot) {
        updateElement(id, updates);
        return;
      }

      const nextElements = snapshot.map((element) =>
        element.id === id ? ({ ...element, ...updates } as CanvasElement) : element,
      );

      setPast((current) => [
        ...current.slice(-(HISTORY_LIMIT - 1)),
        { elements: snapshot, edges },
      ]);
      setElements(nextElements);
      setFuture([]);
    },
    [edges, updateElement],
  );

  const undo = useCallback(() => {
    setPast((currentPast) => {
      const previous = currentPast[currentPast.length - 1];
      if (!previous) return currentPast;

      setFuture((currentFuture) => [{ elements, edges }, ...currentFuture]);
      setElements(previous.elements);
      setEdges(previous.edges);
      setSelectedId(null);
      setSelectedEdgeId(null);
      setDraftEdge(null);
      return currentPast.slice(0, -1);
    });
  }, [edges, elements]);

  const redo = useCallback(() => {
    setFuture((currentFuture) => {
      const next = currentFuture[0];
      if (!next) return currentFuture;

      setPast((currentPast) =>
        [...currentPast, { elements, edges }].slice(-HISTORY_LIMIT),
      );
      setElements(next.elements);
      setEdges(next.edges);
      setSelectedId(null);
      setSelectedEdgeId(null);
      setDraftEdge(null);
      return currentFuture.slice(1);
    });
  }, [edges, elements]);

  const deleteElement = useCallback(
    (elementId: string) => {
      const target = elements.find((element) => element.id === elementId);
      if (target?.status === "generating") return;

      commitCanvas({
        elements: elements.filter((element) => element.id !== elementId),
        edges: edges.filter(
          (edge) => edge.sourceId !== elementId && edge.targetId !== elementId,
        ),
      });
      setSelectedId(null);
      setSelectedEdgeId(null);
      setDraftEdge(null);
    },
    [commitCanvas, edges, elements],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      commitCanvas({
        edges: edges.filter((edge) => edge.id !== edgeId),
      });
      setSelectedEdgeId(null);
      setDraftEdge(null);
    },
    [commitCanvas, edges],
  );

  const addElement = useCallback(
    (element: CanvasElement) => {
      commitCanvas({ elements: [...elements, element] });
      setSelectedId(element.id);
      setSelectedEdgeId(null);
    },
    [commitCanvas, elements],
  );

  const clearCanvas = useCallback(() => {
    if (elements.length === 0) return;
    if (!window.confirm("确定清空画布上的所有元素吗？")) return;
    commitCanvas({ elements: [], edges: [] });
    setSelectedId(null);
    setSelectedEdgeId(null);
    setDraftEdge(null);
  }, [commitCanvas, elements.length]);

  return {
    addElement,
    beginElementDrag,
    clearCanvas,
    commitCanvas,
    commitElements,
    deleteEdge,
    deleteElement,
    draftEdge,
    draggingElementId,
    edges,
    elements,
    finishElementDrag,
    future,
    patchElementDraft,
    past,
    previewUpdateElement,
    redo,
    selectedEdgeId,
    selectedId,
    setDraftEdge,
    setEdges,
    setElements,
    setSelectedEdgeId,
    setSelectedId,
    undo,
    updateElement,
  };
}
