export type CanvasElementKind =
  | "text"
  | "shape"
  | "image"
  | "video"
  | "audio";

export interface CanvasElementBase {
  id: string;
  kind: CanvasElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface CanvasTextElement extends CanvasElementBase {
  kind: "text";
  text: string;
  fill: string;
  fontSize: number;
}

export interface CanvasShapeElement extends CanvasElementBase {
  kind: "shape";
  shape: "circle" | "rect";
  fill: string;
  stroke: string;
}

export interface CanvasImageElement extends CanvasElementBase {
  kind: "image";
  src?: string;
  label?: string;
}

export interface CanvasMediaElement extends CanvasElementBase {
  kind: "video" | "audio";
  label: string;
  src?: string;
}

export type CanvasElement =
  | CanvasTextElement
  | CanvasShapeElement
  | CanvasImageElement
  | CanvasMediaElement;

export interface CanvasViewport {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface CanvasProjectExport {
  version: "1.0.0";
  exportedAt: string;
  viewport: CanvasViewport;
  elements: CanvasElement[];
  edges: CanvasEdge[];
}
