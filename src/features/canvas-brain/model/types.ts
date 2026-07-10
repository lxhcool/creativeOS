import type {
  CanvasEdge,
  CanvasElement,
} from "@/entities/canvas/model/types";
import type { UserModel, UserProvider } from "@/types/provider";
import type { PreparedCanvasBrainAction } from "./action-context";

export type CanvasBrainMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type CanvasTextGenerationSource = {
  kind: string;
  text?: string;
  prompt?: string;
  label?: string;
};

export type CanvasTextGenerationParams = {
  prompt: string;
  current: CanvasTextGenerationSource;
  projectId?: string | null;
  provider: UserProvider;
  model: UserModel;
  sources: CanvasTextGenerationSource[];
};

export type CanvasImageGenerationParams = {
  prompt: string;
  projectId?: string | null;
  referenceImageUrls?: string[];
  provider: UserProvider;
  model: UserModel;
  promptProvider?: UserProvider;
  promptModel?: UserModel;
};

export type CanvasVideoGenerationParams = CanvasImageGenerationParams;

export type CanvasActionIntent = {
  outputKind: "text" | "image" | "video" | "audio";
  placement: "update_current" | "create_result";
  instruction: string;
  reason?: string;
};

export type CanvasAssetWorkflowKind =
  | "image"
  | "video"
  | "novel"
  | "novel_chapter"
  | "article"
  | "character"
  | "script"
  | "storyboard"
  | "novel_merge_updates"
  | "consistency_check";

export type CanvasBrainPlan = {
  mode: "chat" | "action";
  intentType?: "create_asset" | "modify_asset" | "ask_question" | "navigate_canvas" | "unclear";
  confidence?: number;
  assetWorkflow?: CanvasAssetWorkflowKind;
  sourceIds: string[];
  createdSources: Array<{
    kind: "text";
    content: string;
  }>;
  outputKind?: CanvasActionIntent["outputKind"];
  placement?: CanvasActionIntent["placement"];
  instruction?: string;
  response?: string;
  summary?: string;
  needsClarification?: boolean;
  question?: string;
};

export type CanvasBrainMemorySummary = {
  id: string;
  type: string;
  title: string;
  content: unknown;
  sourceElementIds: string[];
};

export type CanvasBrainTurnParams = {
  command: string;
  history: CanvasBrainMessage[];
  elements: CanvasElement[];
  edges: CanvasEdge[];
  focusIds: string[];
  projectId?: string | null;
  selectedElement: CanvasElement | null;
  center: {
    x: number;
    y: number;
  };
  provider: UserProvider;
  model: UserModel;
};

export type CanvasBrainTurnResult =
  | {
      kind: "chat";
      message: string;
    }
  | {
      kind: "clarification";
      message: string;
    }
  | {
      kind: "action";
      plan: CanvasBrainActionPlan;
      action: Extract<PreparedCanvasBrainAction, { kind: "ready" }>;
      summary: string;
    };

export type CanvasBrainActionPlan = Required<
  Pick<CanvasBrainPlan, "outputKind" | "placement" | "instruction">
> &
  Omit<CanvasBrainPlan, "outputKind" | "placement" | "instruction">;
