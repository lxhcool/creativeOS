import type {
  CanvasEdge,
  CanvasElement,
  CanvasTextRole,
  CanvasViewport,
  CanvasWorkflowType,
} from "@/entities/canvas/model/types";

export type CanvasWorkflowInitResult = {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
};

export type CanvasWorkflowToolbarConfig = {
  textRoles: CanvasTextRole[];
  mediaKinds: Array<"image" | "video" | "audio">;
  allowImport: boolean;
};

export type CanvasWorkflowAnchorConfig = Array<{
  id: string;
  label: string;
  textRole?: CanvasTextRole;
}>;

export type CanvasWorkflowAIAssistantConfig = {
  title: string;
  subtitle: string;
  placeholder: string;
  initialMessage: string;
  workingMessage: string;
  defaultOpen: boolean;
};

export type CanvasWorkflowStarterConfig = {
  id: string;
  label: string;
  description: string;
  intent: string;
};

export type CanvasWorkflowActionContext = {
  command: string;
  elements: CanvasElement[];
  edges: CanvasEdge[];
  center: { x: number; y: number };
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

export type CanvasWorkflowGenerationJob = {
  elementId: string;
  instruction: string;
  resultTextRole?: CanvasTextRole;
  generationMode?: "single" | "collaborative";
  actionId?: string;
  actionLabel?: string;
  doneMessage?: string;
  silent?: boolean;
};

export type CanvasWorkflowAssistantAction = {
  id: string;
  label: string;
  command: string;
};

export type CanvasWorkflowConnectionAssessment = {
  tone: "positive" | "notice" | "warning";
  message: string;
};

export type CanvasWorkflowConnectionContext = {
  source: CanvasElement;
  target: CanvasElement;
  elements: CanvasElement[];
  edges: CanvasEdge[];
};

export type CanvasWorkflowActionResult =
  | {
      handled: false;
    }
  | {
      handled: true;
      message: string;
      elements?: CanvasElement[];
      edges?: CanvasEdge[];
      selectedElementId?: string;
      generationJobs?: CanvasWorkflowGenerationJob[];
      completionMessage?: string;
      actions?: CanvasWorkflowAssistantAction[];
    };

export type CanvasWorkflowStrategy = {
  type: CanvasWorkflowType;
  label: string;
  description: string;
  initNodes: () => CanvasWorkflowInitResult;
  getToolbarConfig: () => CanvasWorkflowToolbarConfig;
  getAnchorConfig: () => CanvasWorkflowAnchorConfig;
  getAIAssistantConfig: () => CanvasWorkflowAIAssistantConfig;
  getStarterConfig: () => CanvasWorkflowStarterConfig[];
  assessConnection: (
    context: CanvasWorkflowConnectionContext,
  ) => CanvasWorkflowConnectionAssessment | null;
  handleWorkflowAction: (
    context: CanvasWorkflowActionContext,
  ) => CanvasWorkflowActionResult | Promise<CanvasWorkflowActionResult>;
};
