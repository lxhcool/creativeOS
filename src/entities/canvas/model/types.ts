export type CanvasElementKind =
  | "text"
  | "shape"
  | "image"
  | "video"
  | "audio"
  | "template"
  | "processor";

export type CanvasArtifactType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "sequence"
  | "json"
  | "asset_pack";

export type CanvasGenerationStatus = "idle" | "generating" | "done" | "failed";

export interface CanvasElementBase {
  id: string;
  kind: CanvasElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  prompt?: string;
  modelRef?: string;
  artifactId?: string;
  status?: CanvasGenerationStatus;
  error?: string;
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

export interface CanvasTemplateElement extends CanvasElementBase {
  kind: "template";
  templateId: string;
  title?: string;
  props?: Record<string, unknown>;
}

export interface CanvasProcessorElement extends CanvasElementBase {
  kind: "processor";
  processorId: string;
  title: string;
  sourceIds: string[];
  resultIds?: string[];
  config: Record<string, unknown>;
}

export type CanvasElement =
  | CanvasTextElement
  | CanvasShapeElement
  | CanvasImageElement
  | CanvasMediaElement
  | CanvasTemplateElement
  | CanvasProcessorElement;

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
