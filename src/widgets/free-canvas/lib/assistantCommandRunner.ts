import type {
  CanvasEdge,
  CanvasElement,
} from "@/entities/canvas/model/types";
import {
  runCanvasBrainTurn,
  type CanvasActionIntent,
  type CanvasAssetWorkflowKind,
  type CanvasModelEntry,
} from "@/features/canvas-brain";
import type { CanvasExecutionOptions } from "./textGeneration";
import { mergeElementsWithUpdates } from "./textGeneration";
import type { CanvasBrainChatMessage, CanvasSnapshot } from "../model/types";

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasEdge[] }
  | ((current: CanvasSnapshot) => { elements?: CanvasElement[]; edges?: CanvasEdge[] });

export type CanvasAssistantCommandOverride = {
  command: string;
  display: string;
};

export async function runCanvasAssistantCommand(params: {
  command: string;
  display: string;
  history: CanvasBrainChatMessage[];
  elements: CanvasElement[];
  edges: CanvasEdge[];
  selectedElement: CanvasElement | null;
  brainAttachmentIds: string[];
  currentProjectId: string | null;
  activeBrainModelEntry?: CanvasModelEntry;
  center: () => { x: number; y: number };
  appendAssistantMessage: (
    message: string | Pick<CanvasBrainChatMessage, "content" | "actions">,
  ) => void;
  clearBrainAttachments: () => void;
  commitCanvas: (next: CanvasCommitInput) => void;
  setSelectedId: (id: string | null) => void;
  runAssetWorkflow?: (params: {
    workflow: CanvasAssetWorkflowKind;
    command: string;
  }) => Promise<boolean>;
  generateFromSelectedNode: (
    element: CanvasElement,
    instructionOverride?: string,
    options?: CanvasExecutionOptions,
  ) => Promise<void>;
}): Promise<void> {
  let plannedInstruction = params.command;
  let targetElement: CanvasElement | null = null;
  let plannedIntent: CanvasActionIntent | undefined;
  let plannedSourceIds: string[] = [];
  let plannedSourceElements: CanvasElement[] = [];
  let plannedElements = params.elements;

  const focusIds = Array.from(
    new Set([
      ...(params.selectedElement ? [params.selectedElement.id] : []),
      ...params.brainAttachmentIds.filter((id) =>
        params.elements.some((element) => element.id === id),
      ),
    ]),
  );

  if (params.activeBrainModelEntry?.model && params.activeBrainModelEntry.provider) {
    const brainResult = await runCanvasBrainTurn({
      command: params.command,
      history: params.history,
      elements: params.elements,
      edges: params.edges,
      focusIds,
      projectId: params.currentProjectId,
      selectedElement: params.selectedElement,
      center: params.center(),
      provider: params.activeBrainModelEntry.provider,
      model: params.activeBrainModelEntry.model,
    });

    if (brainResult.kind === "chat" || brainResult.kind === "clarification") {
      params.appendAssistantMessage(brainResult.message);
      return;
    }

    const preparedAction = brainResult.action;
    if (brainResult.plan.assetWorkflow && params.runAssetWorkflow) {
      const handled = await params.runAssetWorkflow({
        workflow: brainResult.plan.assetWorkflow,
        command: params.command,
      });
      if (handled) return;
    }

    if (preparedAction.createdSourceElements.length > 0) {
      params.commitCanvas((current) => ({
        elements: mergeElementsWithUpdates({
          currentElements: current.elements,
          plannedElements: preparedAction.elements,
        }),
        edges: current.edges,
      }));
    }

    plannedElements = preparedAction.elements;
    plannedSourceElements = preparedAction.sourceElements;
    targetElement = preparedAction.targetElement;
    plannedInstruction = preparedAction.instruction;
    plannedIntent = preparedAction.intent;
    plannedSourceIds = preparedAction.sourceIds;
    params.appendAssistantMessage(brainResult.summary);
    params.clearBrainAttachments();
  }

  if (!targetElement && !params.activeBrainModelEntry) {
    params.appendAssistantMessage("请先选择可用的文本模型。");
    return;
  }

  if (targetElement) {
    const resultIntent =
      params.selectedElement &&
      plannedIntent?.outputKind === "text" &&
      plannedIntent.placement === "update_current"
        ? {
            ...plannedIntent,
            placement: "create_result" as const,
          }
        : plannedIntent;

    params.setSelectedId(targetElement.id);
    params.appendAssistantMessage(
      params.selectedElement
        ? "基于选中素材生成新版本。"
        : "参考画布里最相关的素材继续处理。",
    );
    await params.generateFromSelectedNode(targetElement, plannedInstruction, {
      extraSourceIds: plannedSourceIds.filter((id) => id !== targetElement?.id),
      extraSourceElements: plannedSourceElements.filter(
        (source) => source.id !== targetElement?.id,
      ),
      intentOverride: resultIntent,
      baseElements: plannedElements,
      baseEdges: params.edges,
    });
    params.clearBrainAttachments();
    return;
  }

  params.appendAssistantMessage("我还没有找到可以承接这次操作的素材，可以说清楚要生成什么。");
}
