import type {
  CanvasEdge,
  CanvasElement,
  CanvasTextElement,
} from "@/entities/canvas/model/types";
import type { CanvasFlowDirection } from "./geometry";
import { shouldIgnoreCanvasLayoutEdge } from "./textResultLayout";

const AUTO_LAYOUT_COLUMN_GAP = 360;
const AUTO_LAYOUT_ROW_GAP = 180;
const AUTO_LAYOUT_SIBLING_GAP = 92;

function getCanvasLayoutEdgeWeight(params: {
  edge: CanvasEdge;
  target?: CanvasElement;
}): number {
  if (params.target?.kind === "text") {
    const relationKind = (params.target as CanvasTextElement).meta?.relationKind;
    if (relationKind === "sequence") return 0;
  }

  return 1;
}

function getCanvasElementSortValue(
  element: CanvasElement,
  direction: CanvasFlowDirection,
): number {
  if (direction === "vertical") {
    return element.x * 100000 + element.y;
  }

  return element.y * 100000 + element.x;
}

function layoutCanvasComponentElements(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  direction: CanvasFlowDirection;
}): CanvasElement[] {
  if (params.elements.length <= 1) return params.elements;

  const componentElementIds = new Set(params.elements.map((element) => element.id));
  const elementById = new Map(params.elements.map((element) => [element.id, element]));
  const ranks = new Map(params.elements.map((element) => [element.id, 0]));

  for (let index = 0; index < params.elements.length - 1; index += 1) {
    let changed = false;

    params.edges.forEach((edge) => {
      if (
        !componentElementIds.has(edge.sourceId) ||
        !componentElementIds.has(edge.targetId)
      ) {
        return;
      }

      const sourceRank = ranks.get(edge.sourceId) ?? 0;
      const targetRank = ranks.get(edge.targetId) ?? 0;
      const weight = getCanvasLayoutEdgeWeight({
        edge,
        target: elementById.get(edge.targetId),
      });
      const nextTargetRank = sourceRank + weight;

      if (nextTargetRank > targetRank) {
        ranks.set(edge.targetId, nextTargetRank);
        changed = true;
      }
    });

    if (!changed) break;
  }

  const minRank = Math.min(...Array.from(ranks.values()));
  const normalizedRankValues = Array.from(
    new Set(Array.from(ranks.values()).map((rank) => rank - minRank)),
  ).sort((a, b) => a - b);
  const rankIndexByValue = new Map(
    normalizedRankValues.map((rank, index) => [rank, index]),
  );
  const elementsByRank = new Map<number, CanvasElement[]>();

  params.elements.forEach((element) => {
    const rank = rankIndexByValue.get((ranks.get(element.id) ?? 0) - minRank) ?? 0;
    const rankedElements = elementsByRank.get(rank) || [];
    rankedElements.push(element);
    elementsByRank.set(rank, rankedElements);
  });

  const sortedRanks = Array.from(elementsByRank.keys()).sort((a, b) => a - b);
  const componentLeft = Math.min(...params.elements.map((element) => element.x));
  const componentTop = Math.min(...params.elements.map((element) => element.y));
  const nextElements = new Map<string, CanvasElement>();

  if (params.direction === "vertical") {
    let y = componentTop;

    sortedRanks.forEach((rank) => {
      const rankedElements = (elementsByRank.get(rank) || []).sort(
        (a, b) =>
          getCanvasElementSortValue(a, params.direction) -
          getCanvasElementSortValue(b, params.direction),
      );
      const rowHeight = Math.max(...rankedElements.map((element) => element.height));
      let x = componentLeft;

      rankedElements.forEach((element) => {
        nextElements.set(element.id, {
          ...element,
          x,
          y: y + rowHeight / 2 - element.height / 2,
        } as CanvasElement);
        x += element.width + AUTO_LAYOUT_SIBLING_GAP;
      });

      y += rowHeight + AUTO_LAYOUT_ROW_GAP;
    });

    return params.elements.map((element) => nextElements.get(element.id) || element);
  }

  let x = componentLeft;

  sortedRanks.forEach((rank) => {
    const rankedElements = (elementsByRank.get(rank) || []).sort(
      (a, b) =>
        getCanvasElementSortValue(a, params.direction) -
        getCanvasElementSortValue(b, params.direction),
    );
    const columnWidth = Math.max(...rankedElements.map((element) => element.width));
    let y = componentTop;

    rankedElements.forEach((element) => {
      nextElements.set(element.id, {
        ...element,
        x: x + columnWidth / 2 - element.width / 2,
        y,
      } as CanvasElement);
      y += element.height + 88;
    });

    x += columnWidth + AUTO_LAYOUT_COLUMN_GAP;
  });

  return params.elements.map((element) => nextElements.get(element.id) || element);
}

export function layoutCanvasElementsForDirection(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  direction: CanvasFlowDirection;
}): CanvasElement[] {
  if (params.elements.length <= 1) return params.elements;

  const elementById = new Map(params.elements.map((element) => [element.id, element]));
  const layoutEdges = params.edges.filter((edge) => {
    const source = elementById.get(edge.sourceId);
    const target = elementById.get(edge.targetId);
    if (!source || !target || source.id === target.id) return false;
    return !shouldIgnoreCanvasLayoutEdge({ edge, target });
  });
  const neighborsById = new Map<string, Set<string>>(
    params.elements.map((element) => [element.id, new Set<string>()]),
  );

  layoutEdges.forEach((edge) => {
    neighborsById.get(edge.sourceId)?.add(edge.targetId);
    neighborsById.get(edge.targetId)?.add(edge.sourceId);
  });

  const visited = new Set<string>();
  const components: CanvasElement[][] = [];

  params.elements
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((element) => {
      if (visited.has(element.id)) return;

      const queue = [element.id];
      const componentIds: string[] = [];
      visited.add(element.id);

      for (let index = 0; index < queue.length; index += 1) {
        const id = queue[index]!;
        componentIds.push(id);
        neighborsById.get(id)?.forEach((neighborId) => {
          if (visited.has(neighborId)) return;
          visited.add(neighborId);
          queue.push(neighborId);
        });
      }

      components.push(
        componentIds
          .map((id) => elementById.get(id))
          .filter((item): item is CanvasElement => Boolean(item)),
      );
    });

  const layoutedById = new Map<string, CanvasElement>();

  components.forEach((componentElements) => {
    const componentElementIds = new Set(componentElements.map((element) => element.id));
    const componentEdges = layoutEdges.filter(
      (edge) =>
        componentElementIds.has(edge.sourceId) && componentElementIds.has(edge.targetId),
    );

    layoutCanvasComponentElements({
      elements: componentElements,
      edges: componentEdges,
      direction: params.direction,
    }).forEach((element) => layoutedById.set(element.id, element));
  });

  return params.elements.map((element) => layoutedById.get(element.id) || element);
}
