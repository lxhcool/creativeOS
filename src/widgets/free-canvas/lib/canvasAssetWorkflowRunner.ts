import type {
  CanvasEdge,
  CanvasElement,
} from "@/entities/canvas/model/types";
import type {
  CanvasAssetWorkflowKind,
  CanvasModelEntry,
} from "@/features/canvas-brain";
import type { ModelKind } from "@/types/provider";
import {
  runGlobalConsistencyCheckIntentChain,
  runImageAssetIntentChain,
  runNovelAssetIntentChain,
  runNovelChapterAssetIntentChain,
  runNovelMergeUpdatesIntentChain,
  runStructuredTextAssetIntentChain,
  runVideoAssetIntentChain,
} from "./assetIntentChain";
import type { CanvasExecutionOptions } from "./textGeneration";
import type { CanvasBrainChatMessage, CanvasSnapshot } from "../model/types";

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasEdge[] }
  | ((current: CanvasSnapshot) => { elements?: CanvasElement[]; edges?: CanvasEdge[] });

export type CanvasAssetWorkflowRunnerContext = {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  selectedElement: CanvasElement | null;
  brainAttachmentIds: string[];
  currentProjectId: string | null;
  resolvedBrainModelRef: string;
  getModelEntryByRef: (
    modelRef: string | undefined,
    kind: ModelKind,
  ) => CanvasModelEntry | undefined;
  getModelEntryForKind: (kind: ModelKind) => CanvasModelEntry | undefined;
  worldCenter: () => { x: number; y: number };
  appendAiMessage: (
    role: CanvasBrainChatMessage["role"],
    message: string | Pick<CanvasBrainChatMessage, "content" | "actions">,
  ) => void;
  setBrainAttachmentIds: (ids: string[]) => void;
  commitCanvas: (next: CanvasCommitInput) => void;
  patchElementDraft: (id: string, updates: Partial<CanvasElement>) => void;
  setSelectedId: (id: string | null) => void;
  generateFromSelectedNode: (
    element: CanvasElement,
    instructionOverride?: string,
    options?: CanvasExecutionOptions,
  ) => Promise<void>;
};

export async function runCanvasAssetWorkflow(params: {
  workflow: CanvasAssetWorkflowKind;
  command: string;
  context: CanvasAssetWorkflowRunnerContext;
}): Promise<boolean> {
  const {
    workflow,
    command,
    context,
  } = params;
  const textModelEntry = context.getModelEntryByRef(
    context.resolvedBrainModelRef,
    "text",
  );
  const appendAssistantMessage = (message: string) =>
    context.appendAiMessage("assistant", message);

  if (workflow === "consistency_check") {
    if (context.selectedElement?.kind === "text") {
      appendAssistantMessage("检查当前素材的一致性。");
      await context.generateFromSelectedNode(context.selectedElement, command, {
        resultTextRole: "general",
        actionId: "consistency_check",
        actionLabel: "一致性检查",
        intentOverride: {
          outputKind: "text",
          placement: "create_result",
          instruction: [
            "基于选中的素材、关联上下文和项目记忆，生成一致性检查报告。",
            "重点检查：设定冲突、角色状态冲突、时间线冲突、信息公开范围冲突、伏笔遗漏和需要补充确认的问题。",
            "输出要可执行：按问题、依据、风险、建议修改整理。",
            `用户要求：${command}`,
          ].join("\n"),
        },
      });
      return true;
    }

    if (!context.selectedElement) {
      await runGlobalConsistencyCheckIntentChain({
        command,
        elements: context.elements,
        currentProjectId: context.currentProjectId,
        textModelEntry,
        center: context.worldCenter(),
        commitCanvas: context.commitCanvas,
        setSelectedId: context.setSelectedId,
        appendAssistantMessage,
      });
      return true;
    }

    return false;
  }

  if (context.selectedElement) return false;

  if (workflow === "video") {
    await runVideoAssetIntentChain({
      command,
      elements: context.elements,
      brainAttachmentIds: context.brainAttachmentIds,
      currentProjectId: context.currentProjectId,
      textModelEntry,
      videoModelEntry: context.getModelEntryForKind("video"),
      center: context.worldCenter(),
      commitCanvas: context.commitCanvas,
      patchElementDraft: context.patchElementDraft,
      setSelectedId: context.setSelectedId,
      clearBrainAttachments: () => context.setBrainAttachmentIds([]),
      appendAssistantMessage,
    });
    return true;
  }

  if (workflow === "image") {
    await runImageAssetIntentChain({
      command,
      elements: context.elements,
      edges: context.edges,
      brainAttachmentIds: context.brainAttachmentIds,
      currentProjectId: context.currentProjectId,
      textModelEntry,
      imageModelEntry: context.getModelEntryForKind("image"),
      promptModelEntry: textModelEntry,
      center: context.worldCenter(),
      commitCanvas: context.commitCanvas,
      patchElementDraft: context.patchElementDraft,
      setSelectedId: context.setSelectedId,
      clearBrainAttachments: () => context.setBrainAttachmentIds([]),
      appendAssistantMessage,
    });
    return true;
  }

  if (workflow === "novel_chapter") {
    await runNovelChapterAssetIntentChain({
      command,
      elements: context.elements,
      currentProjectId: context.currentProjectId,
      textModelEntry,
      center: context.worldCenter(),
      commitCanvas: context.commitCanvas,
      setSelectedId: context.setSelectedId,
      appendAssistantMessage,
    });
    return true;
  }

  if (workflow === "novel") {
    await runNovelAssetIntentChain({
      command,
      currentProjectId: context.currentProjectId,
      textModelEntry,
      center: context.worldCenter(),
      commitCanvas: context.commitCanvas,
      setSelectedId: context.setSelectedId,
      appendAssistantMessage,
    });
    return true;
  }

  if (workflow === "novel_merge_updates") {
    await runNovelMergeUpdatesIntentChain({
      command,
      elements: context.elements,
      currentProjectId: context.currentProjectId,
      textModelEntry,
      center: context.worldCenter(),
      commitCanvas: context.commitCanvas,
      setSelectedId: context.setSelectedId,
      appendAssistantMessage,
    });
    return true;
  }

  await runStructuredTextAssetIntentChain({
    command,
    workflow,
    currentProjectId: context.currentProjectId,
    textModelEntry,
    center: context.worldCenter(),
    commitCanvas: context.commitCanvas,
    setSelectedId: context.setSelectedId,
    appendAssistantMessage,
  });
  return true;
}
