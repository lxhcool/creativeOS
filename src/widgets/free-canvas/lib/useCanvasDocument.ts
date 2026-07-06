import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasEdge, CanvasElement } from "@/entities/canvas/model/types";
import { HISTORY_LIMIT } from "../model/constants";
import type { CanvasDraftEdge, CanvasSnapshot } from "../model/types";

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasEdge[] }
  | ((current: CanvasSnapshot) => { elements?: CanvasElement[]; edges?: CanvasEdge[] });

export function useCanvasDocument() {
  const dragSnapshotRef = useRef<CanvasElement[] | null>(null);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const elementsRef = useRef<CanvasElement[]>([]);
  const edgesRef = useRef<CanvasEdge[]>([]);
  const [past, setPast] = useState<CanvasSnapshot[]>([]);
  const [future, setFuture] = useState<CanvasSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [draftEdge, setDraftEdge] = useState<CanvasDraftEdge | null>(null);
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const replaceElements = useCallback((nextElements: CanvasElement[]) => {
    elementsRef.current = nextElements;
    setElements(nextElements);
  }, []);

  const replaceEdges = useCallback((nextEdges: CanvasEdge[]) => {
    edgesRef.current = nextEdges;
    setEdges(nextEdges);
  }, []);

  const commitCanvas = useCallback(
    (nextInput: CanvasCommitInput) => {
      const currentElements = elementsRef.current;
      const currentEdges = edgesRef.current;
      const next =
        typeof nextInput === "function"
          ? nextInput({ elements: currentElements, edges: currentEdges })
          : nextInput;
      const nextElements = next.elements ?? currentElements;
      const nextEdges = next.edges ?? currentEdges;

      setPast((current) => [
        ...current.slice(-(HISTORY_LIMIT - 1)),
        { elements: currentElements, edges: currentEdges },
      ]);
      replaceElements(nextElements);
      replaceEdges(nextEdges);
      setFuture([]);
    },
    [replaceEdges, replaceElements],
  );

  const commitElements = useCallback(
    (nextElements: CanvasElement[]) => {
      const nextElementIds = new Set(nextElements.map((element) => element.id));
      commitCanvas({
        elements: nextElements,
        edges: edgesRef.current.filter(
          (edge) =>
            nextElementIds.has(edge.sourceId) && nextElementIds.has(edge.targetId),
        ),
      });
    },
    [commitCanvas],
  );

  const updateElement = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      const currentElements = elementsRef.current;
      commitElements(
        currentElements.map((element) =>
          element.id === id ? ({ ...element, ...updates } as CanvasElement) : element,
        ),
      );
    },
    [commitElements],
  );

  const patchElementDraft = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      setElements((current) => {
        const nextElements = current.map((element) =>
          element.id === id ? ({ ...element, ...updates } as CanvasElement) : element,
        );
        elementsRef.current = nextElements;
        return nextElements;
      });
    },
    [],
  );

  const previewUpdateElement = patchElementDraft;

  const beginElementDrag = useCallback(
    (id: string) => {
      dragSnapshotRef.current = elementsRef.current;
      setDraggingElementId(id);
    },
    [],
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

      const latestElements = elementsRef.current;
      const snapshotById = new Map(snapshot.map((element) => [element.id, element]));
      const previousElements = latestElements.map(
        (element) => snapshotById.get(element.id) ?? element,
      );
      const nextElements = latestElements.map((element) =>
        element.id === id ? ({ ...element, ...updates } as CanvasElement) : element,
      );
      const currentEdges = edgesRef.current;

      setPast((current) => [
        ...current.slice(-(HISTORY_LIMIT - 1)),
        { elements: previousElements, edges: currentEdges },
      ]);
      replaceElements(nextElements);
      setFuture([]);
    },
    [replaceElements, updateElement],
  );

  const undo = useCallback(() => {
    setPast((currentPast) => {
      const previous = currentPast[currentPast.length - 1];
      if (!previous) return currentPast;

      setFuture((currentFuture) => [
        { elements: elementsRef.current, edges: edgesRef.current },
        ...currentFuture,
      ]);
      replaceElements(previous.elements);
      replaceEdges(previous.edges);
      setSelectedId(null);
      setSelectedEdgeId(null);
      setDraftEdge(null);
      return currentPast.slice(0, -1);
    });
  }, [replaceEdges, replaceElements]);

  const redo = useCallback(() => {
    setFuture((currentFuture) => {
      const next = currentFuture[0];
      if (!next) return currentFuture;

      setPast((currentPast) =>
        [
          ...currentPast,
          { elements: elementsRef.current, edges: edgesRef.current },
        ].slice(-HISTORY_LIMIT),
      );
      replaceElements(next.elements);
      replaceEdges(next.edges);
      setSelectedId(null);
      setSelectedEdgeId(null);
      setDraftEdge(null);
      return currentFuture.slice(1);
    });
  }, [replaceEdges, replaceElements]);

  const deleteElement = useCallback(
    (elementId: string) => {
      const currentElements = elementsRef.current;
      const currentEdges = edgesRef.current;
      const target = currentElements.find((element) => element.id === elementId);
      if (target?.status === "generating") return;

      commitCanvas({
        elements: currentElements.filter((element) => element.id !== elementId),
        edges: currentEdges.filter(
          (edge) => edge.sourceId !== elementId && edge.targetId !== elementId,
        ),
      });
      setSelectedId(null);
      setSelectedEdgeId(null);
      setDraftEdge(null);
    },
    [commitCanvas],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      commitCanvas({
        edges: edgesRef.current.filter((edge) => edge.id !== edgeId),
      });
      setSelectedEdgeId(null);
      setDraftEdge(null);
    },
    [commitCanvas],
  );

  const addElement = useCallback(
    (element: CanvasElement) => {
      commitCanvas({ elements: [...elementsRef.current, element] });
      setSelectedId(element.id);
      setSelectedEdgeId(null);
    },
    [commitCanvas],
  );

  const clearCanvas = useCallback(() => {
    if (elementsRef.current.length === 0) return;
    commitCanvas({ elements: [], edges: [] });
    setSelectedId(null);
    setSelectedEdgeId(null);
    setDraftEdge(null);
  }, [commitCanvas]);

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
    setEdges: replaceEdges,
    setElements: replaceElements,
    setSelectedEdgeId,
    setSelectedId,
    undo,
    updateElement,
  };
}
