import { getIncomingSourceElements } from "@/entities/canvas/lib/workflow";
import type {
  CanvasEdge,
  CanvasElement,
} from "@/entities/canvas/model/types";

export function resolveCanvasExecutionSources(params: {
  targetId: string;
  elements: CanvasElement[];
  edges: CanvasEdge[];
  extraSourceIds?: string[];
  extraSourceElements?: CanvasElement[];
}): CanvasElement[] {
  const incomingSourceElements = getIncomingSourceElements({
    targetId: params.targetId,
    elements: params.elements,
    edges: params.edges,
  });
  const extraSourceElements = (params.extraSourceIds || [])
    .map((id) => params.elements.find((entry) => entry.id === id))
    .filter((entry): entry is CanvasElement => Boolean(entry))
    .filter((entry) => entry.id !== params.targetId);
  const directExtraSourceElements = (params.extraSourceElements || [])
    .filter((entry) => entry.id !== params.targetId);

  return Array.from(
    new Map(
      [
        ...incomingSourceElements,
        ...extraSourceElements,
        ...directExtraSourceElements,
      ].map((entry) => [entry.id, entry]),
    ).values(),
  );
}
