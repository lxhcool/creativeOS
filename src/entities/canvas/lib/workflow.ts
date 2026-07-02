import {
  createCanvasEdge,
  createImageElement,
  createMediaElement,
  createTextElement,
} from "./factory";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasTextMeta,
  CanvasTextElement,
  CanvasTextRole,
} from "../model/types";

type Position = {
  x: number;
  y: number;
};

export function getIncomingSourceElements(params: {
  targetId: string;
  elements: CanvasElement[];
  edges: CanvasEdge[];
}): CanvasElement[] {
  const sourceIds = params.edges
    .filter((edge) => edge.targetId === params.targetId)
    .map((edge) => edge.sourceId);
  const sourceIdSet = new Set(sourceIds);

  return params.elements.filter((element) => sourceIdSet.has(element.id));
}

export function getResultNodePosition(source: CanvasElement): Position {
  return {
    x: source.x + source.width + 360,
    y: source.y + source.height / 2,
  };
}

export function createTextResultNode(params: {
  source: CanvasElement;
  text: string;
  prompt: string;
  modelRef: string;
  position?: Position;
  textRole?: CanvasTextRole;
  meta?: CanvasTextMeta;
}): CanvasTextElement {
  const node = createTextElement(params.position || getResultNodePosition(params.source), {
    textRole: params.textRole,
    meta: params.meta,
  });

  return {
    ...node,
    text: params.text,
    prompt: params.prompt,
    modelRef: params.modelRef,
    status: "done",
  };
}

export function createResultPlaceholder(params: {
  source: CanvasElement;
  kind: "image" | "video" | "audio";
  prompt: string;
  modelRef: string;
}): CanvasImageElement | CanvasMediaElement {
  const position = getResultNodePosition(params.source);

  if (params.kind === "image") {
    return {
      ...createImageElement({
        position,
        label: "生成任务",
      }),
      prompt: params.prompt,
      modelRef: params.modelRef,
      status: "generating",
    };
  }

  return {
    ...createMediaElement({
      kind: params.kind,
      position,
      label: "生成任务",
    }),
    prompt: params.prompt,
    modelRef: params.modelRef,
    status: "generating",
  };
}

export function appendResultNode(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  source: CanvasElement;
  result: CanvasElement;
}): { elements: CanvasElement[]; edges: CanvasEdge[] } {
  return appendResultNodeFromSources({
    elements: params.elements,
    edges: params.edges,
    sources: [params.source],
    result: params.result,
  });
}

export function appendResultNodeFromSources(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  sources: CanvasElement[];
  result: CanvasElement;
}): { elements: CanvasElement[]; edges: CanvasEdge[] } {
  const existingEdgeKeys = new Set(
    params.edges.map((edge) => `${edge.sourceId}:${edge.targetId}`),
  );
  const sourceEdges = params.sources
    .filter((source) => source.id !== params.result.id)
    .filter((source) => !existingEdgeKeys.has(`${source.id}:${params.result.id}`))
    .map((source) =>
      createCanvasEdge({
        sourceId: source.id,
        targetId: params.result.id,
      }),
    );

  return {
    elements: [...params.elements, params.result],
    edges: [...params.edges, ...sourceEdges],
  };
}
