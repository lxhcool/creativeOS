import type { CanvasEdge, CanvasElement } from "@/entities/canvas/model/types";

export type CanvasSelectOption = {
  ref: string;
  label: string;
};

export type CanvasSnapshot = {
  elements: CanvasElement[];
  edges: CanvasEdge[];
};

export type CanvasDraftEdge = {
  sourceId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};
