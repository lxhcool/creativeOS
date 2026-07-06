import { createTextElement } from "@/entities/canvas/lib/factory";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasTextElement,
} from "@/entities/canvas/model/types";
import {
  type CanvasWorkflowStrategy,
} from "@/features/canvas-workflows";
import {
  runCanvasBrainTurn,
  type CanvasActionIntent,
  type CanvasModelEntry,
} from "@/features/canvas-brain";
import type { CanvasBrainChatMessage } from "../ui/CanvasBrainPanel";
import type { CanvasExecutionOptions } from "./textGeneration";
import { mergeElementsWithUpdates } from "./textGeneration";
import type { CanvasSnapshot } from "../model/types";

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
  workflowStrategy: CanvasWorkflowStrategy;
  elements: CanvasElement[];
  edges: CanvasEdge[];
  selectedElement: CanvasElement | null;
  brainAttachmentIds: string[];
  activeBrainModelEntry?: CanvasModelEntry;
  center: () => { x: number; y: number };
  appendAssistantMessage: (
    message: string | Pick<CanvasBrainChatMessage, "content" | "actions">,
  ) => void;
  clearBrainAttachments: () => void;
  addElement: (element: CanvasElement) => void;
  commitCanvas: (next: CanvasCommitInput) => void;
  setSelectedId: (id: string | null) => void;
  generateFromSelectedNode: (
    element: CanvasElement,
    instructionOverride?: string,
    options?: CanvasExecutionOptions,
  ) => Promise<void>;
}): Promise<void> {
  const workflowResult = await params.workflowStrategy.handleWorkflowAction({
    command: params.command,
    elements: params.elements,
    edges: params.edges,
    center: params.center(),
    history: params.history,
  });
  if (workflowResult.handled) {
    const hasGenerationJobs = Boolean(workflowResult.generationJobs?.length);
    let plannedElements = params.elements;
    let plannedEdges = params.edges;

    if (
      !hasGenerationJobs &&
      (workflowResult.elements?.length || workflowResult.edges?.length)
    ) {
      plannedElements = mergeElementsWithUpdates({
        currentElements: params.elements,
        plannedElements: [
          ...params.elements,
          ...(workflowResult.elements || []),
        ],
      });
      plannedEdges = [
        ...params.edges,
        ...(workflowResult.edges || []).filter(
          (nextEdge) =>
            !params.edges.some(
              (edge) =>
                edge.sourceId === nextEdge.sourceId &&
                edge.targetId === nextEdge.targetId,
            ),
        ),
      ];

      params.commitCanvas({
        elements: plannedElements,
        edges: plannedEdges,
      });
    }

    if (workflowResult.selectedElementId && !hasGenerationJobs) {
      params.setSelectedId(workflowResult.selectedElementId);
    }
    params.appendAssistantMessage(workflowResult.message);

    for (const job of workflowResult.generationJobs || []) {
      const target =
        workflowResult.elements?.find((element) => element.id === job.elementId) ||
        params.elements.find((element) => element.id === job.elementId);
      if (!target) continue;
      const jobEdges = [
        ...params.edges,
        ...(workflowResult.edges || []).filter(
          (edge) =>
            edge.targetId === target.id &&
            params.elements.some((element) => element.id === edge.sourceId),
        ),
      ];
      const jobElements = mergeElementsWithUpdates({
        currentElements: params.elements,
        plannedElements: [...params.elements, target],
      });

      await params.generateFromSelectedNode(target, job.instruction, {
        resultTextRole: job.resultTextRole,
        generationMode: job.generationMode,
        actionId: job.actionId,
        actionLabel: job.actionLabel,
        doneMessage: job.doneMessage,
        silent: job.silent,
        baseElements: jobElements,
        baseEdges: jobEdges,
        intentOverride: {
          outputKind: "text",
          placement: "update_current",
          instruction: job.instruction,
        },
      });
      params.setSelectedId(target.id);
    }
    if (workflowResult.completionMessage) {
      params.appendAssistantMessage({
        content: workflowResult.completionMessage,
        actions: workflowResult.actions,
      });
    }
    return;
  }

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
    params.appendAssistantMessage("请先在右下角选择可用的文本模型作为画布大脑。");
    return;
  }

  if (targetElement) {
    params.setSelectedId(targetElement.id);
    params.appendAssistantMessage(
      params.selectedElement
        ? "参考选中素材继续处理。"
        : "参考画布里最相关的素材继续处理。",
    );
    await params.generateFromSelectedNode(targetElement, plannedInstruction, {
      extraSourceIds: plannedSourceIds.filter((id) => id !== targetElement?.id),
      extraSourceElements: plannedSourceElements.filter(
        (source) => source.id !== targetElement?.id,
      ),
      intentOverride: plannedIntent,
      baseElements: plannedElements,
      baseEdges: params.edges,
    });
    params.clearBrainAttachments();
    return;
  }

  const element = {
    ...createTextElement(params.center()),
    text: "",
    prompt: params.command,
  } satisfies CanvasTextElement;
  params.addElement(element);
  params.appendAssistantMessage("我先把你的想法整理成一个文本素材。");
  await params.generateFromSelectedNode(element, plannedInstruction);
}
