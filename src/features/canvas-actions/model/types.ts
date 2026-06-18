import type {
  CanvasArtifactType,
  CanvasElement,
  CanvasElementKind,
} from "@/entities/canvas/model/types";

export type CanvasActionCategory =
  | "generate"
  | "edit"
  | "transform"
  | "extract"
  | "export"
  | "organize";

export type CanvasActionDefinition = {
  id: string;
  label: string;
  description?: string;
  category: CanvasActionCategory;
  inputKinds: CanvasElementKind[];
  outputKind?: CanvasElementKind;
  outputArtifactType?: CanvasArtifactType;
  outputTemplateId?: string;
  executorId: string;
};

export type CanvasActionContext = {
  action: CanvasActionDefinition;
  sources: CanvasElement[];
  config: Record<string, unknown>;
};

export type CanvasActionResult = {
  elements?: CanvasElement[];
  message?: string;
};

export type CanvasActionExecutor = {
  id: string;
  run: (context: CanvasActionContext) => Promise<CanvasActionResult>;
};
