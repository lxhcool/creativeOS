import { generateId } from "@/lib/id";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasShapeElement,
  CanvasTextElement,
} from "../model/types";

type Position = {
  x: number;
  y: number;
};

const DEFAULT_NODE_WIDTH = 480;
const DEFAULT_NODE_HEIGHT = 300;

export function createTextElement(position: Position): CanvasTextElement {
  return {
    id: generateId("text"),
    kind: "text",
    x: position.x - DEFAULT_NODE_WIDTH / 2,
    y: position.y - DEFAULT_NODE_HEIGHT / 2,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    rotation: 0,
    text: "文本节点",
    fill: "#f8fafc",
    fontSize: 28,
  };
}

export function createCircleElement(position: Position): CanvasShapeElement {
  return {
    id: generateId("shape"),
    kind: "shape",
    shape: "circle",
    x: position.x - 90,
    y: position.y - 90,
    width: 180,
    height: 180,
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
