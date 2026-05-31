import type { Asset } from "./asset.schema";
import type { Workflow } from "./workflow.schema";

export interface Project {
  id: string
  workspaceId: string
  name: string
  version: string
  canvas: CanvasState
  nodes: ProjectNode[]
  edges: ProjectEdge[]
  assets: Asset[]
  workflows: Workflow[]
  createdAt: string
  updatedAt: string
}

export interface CanvasState {
  zoom: number
  offsetX: number
  offsetY: number
}

export interface ProjectNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: unknown
  metadata: Record<string, unknown>
}

export interface ProjectEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}
