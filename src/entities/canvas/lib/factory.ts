import { generateId } from "@/lib/id";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasProcessorElement,
  CanvasShapeElement,
  CanvasTemplateElement,
  CanvasTextElement,
  CanvasTextMeta,
  CanvasTextRole,
} from "../model/types";

type Position = {
  x: number;
  y: number;
};

const DEFAULT_NODE_WIDTH = 530;
const DEFAULT_NODE_HEIGHT = 350;

export function createTextElement(
  position: Position,
  options: {
    textRole?: CanvasTextRole;
    text?: string;
    meta?: CanvasTextMeta;
  } = {},
): CanvasTextElement {
  return {
    id: generateId("text"),
    kind: "text",
    textRole: options.textRole || "general",
    meta: options.meta,
    x: position.x - DEFAULT_NODE_WIDTH / 2,
    y: position.y - DEFAULT_NODE_HEIGHT / 2,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    rotation: 0,
    text: options.text || "",
    fill: "#f8fafc",
    fontSize: 14,
  };
}

export function createCircleElement(position: Position): CanvasShapeElement {
  return {
    id: generateId("shape"),
    kind: "shape",
    shape: "circle",
    x: position.x - 115,
    y: position.y - 115,
    width: 230,
    height: 230,
    rotation: 0,
    fill: "#38bdf8",
    stroke: "#0f172a",
  };
}

export function createImageElement(params: {
  position: Position;
  src?: string;
  label?: string;
}): CanvasImageElement {
  return {
    id: generateId("image"),
    kind: "image",
    x: params.position.x - DEFAULT_NODE_WIDTH / 2,
    y: params.position.y - DEFAULT_NODE_HEIGHT / 2,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    rotation: 0,
    src: params.src,
    label: params.label,
  };
}

export function createMediaElement(params: {
  kind: "video" | "audio";
  position: Position;
  src?: string;
  label?: string;
}): CanvasMediaElement {
  return {
    id: generateId(params.kind),
    kind: params.kind,
    x: params.position.x - DEFAULT_NODE_WIDTH / 2,
    y: params.position.y - DEFAULT_NODE_HEIGHT / 2,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    rotation: 0,
    label: params.label ?? (params.kind === "audio" ? "音乐素材" : "视频素材"),
    src: params.src,
  };
}

export function createTemplateElement(params: {
  position: Position;
  templateId: string;
  title?: string;
  props?: Record<string, unknown>;
  width?: number;
  height?: number;
  artifactId?: string;
}): CanvasTemplateElement {
  const width = params.width ?? DEFAULT_NODE_WIDTH;
  const height = params.height ?? DEFAULT_NODE_HEIGHT;

  return {
    id: generateId("template"),
    kind: "template",
    templateId: params.templateId,
    x: params.position.x - width / 2,
    y: params.position.y - height / 2,
    width,
    height,
    rotation: 0,
    title: params.title,
    props: params.props,
    artifactId: params.artifactId,
  };
}

export function createProcessorElement(params: {
  position: Position;
  processorId: string;
  title: string;
  sourceIds: string[];
  resultIds?: string[];
  config: Record<string, unknown>;
  width?: number;
  height?: number;
}): CanvasProcessorElement {
  const width = params.width ?? 880;
  const height = params.height ?? 720;

  return {
    id: generateId("processor"),
    kind: "processor",
    processorId: params.processorId,
    title: params.title,
    sourceIds: params.sourceIds,
    resultIds: params.resultIds,
    config: params.config,
    x: params.position.x - width / 2,
    y: params.position.y - height / 2,
    width,
    height,
    rotation: 0,
  };
}

export function createCanvasEdge(params: {
  sourceId: string;
  targetId: string;
}): CanvasEdge {
  return {
    id: generateId("edge"),
    sourceId: params.sourceId,
    targetId: params.targetId,
  };
}

export function isCanvasElement(value: unknown): value is CanvasElement {
  if (!value || typeof value !== "object") return false;
  const element = value as Partial<CanvasElement>;
  return (
    typeof element.id === "string" &&
    typeof element.kind === "string" &&
    typeof element.x === "number" &&
    typeof element.y === "number" &&
    typeof element.width === "number" &&
    typeof element.height === "number"
  );
}

export function isCanvasEdge(value: unknown): value is CanvasEdge {
  if (!value || typeof value !== "object") return false;
  const edge = value as Partial<CanvasEdge>;
  return (
    typeof edge.id === "string" &&
    typeof edge.sourceId === "string" &&
    typeof edge.targetId === "string"
  );
}
