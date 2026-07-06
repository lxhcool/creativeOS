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

export type CanvasWorkflowType = "free" | "novel" | "video" | "image";

export type CanvasGenerationStatus = "idle" | "generating" | "done" | "failed";
export type CanvasTextResultRelationKind = "child" | "sequence" | "support";

export type CanvasTextRole =
  | "general"
  | "article"
  | "novel_setup"
  | "novel_core"
  | "novel_world"
  | "novel_outline"
  | "novel_volume_outline"
  | "novel_chapter_outline"
  | "novel_scene_outline"
  | "novel_chapter"
  | "novel_bible"
  | "novel_style_guide"
  | "character_cast"
  | "character"
  | "character_relation"
  | "character_arc"
  | "scene"
  | "script"
  | "storyboard"
  | "prompt";

export interface CanvasTextRevision {
  id: string;
  text: string;
  createdAt: string;
  label?: string;
  modelRef?: string;
}

export interface CanvasTextMeta {
  title?: string;
  chapterNo?: number;
  version?: number;
  sourceNodeId?: string;
  sourceRole?: CanvasTextRole;
  parentNodeId?: string;
  relationKind?: CanvasTextResultRelationKind;
  sourceRunId?: string;
  workflowProjectId?: string;
  workflowStageId?: string;
  workflowBatchId?: string;
  workflowSequenceNo?: number;
  workflowLocked?: boolean;
  agentSummary?: string;
  continuityNotes?: string[];
  nextHooks?: string[];
  revisions?: CanvasTextRevision[];
}

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
  textRole?: CanvasTextRole;
  meta?: CanvasTextMeta;
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

export type CanvasAssistantMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: Array<{
    id: string;
    label: string;
    command: string;
  }>;
};

export interface CanvasProjectExport {
  version: "1.0.0";
  exportedAt: string;
  workflowType?: CanvasWorkflowType;
  viewport: CanvasViewport;
  elements: CanvasElement[];
  edges: CanvasEdge[];
  assistantMessages?: CanvasAssistantMessage[];
}
