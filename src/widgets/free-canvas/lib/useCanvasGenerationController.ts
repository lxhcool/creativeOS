import { useCallback, useState } from "react";
import {
  getCanvasEditorModelKind,
  type CanvasModelEntry,
} from "@/features/canvas-brain";
import type {
  CanvasEdge,
  CanvasElement,
} from "@/entities/canvas/model/types";
import type { ModelKind } from "@/types/provider";
import type { CanvasFlowDirection } from "./geometry";
import type { CanvasSnapshot } from "../model/types";
import { getCanvasNodeEditorTitle } from "./editor";
import {
  runCanvasTextNodeGeneration,
  type CanvasExecutionOptions,
} from "./textGeneration";
import { runCanvasMediaNodeGeneration } from "./mediaGeneration";

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasEdge[] }
  | ((current: CanvasSnapshot) => { elements?: CanvasElement[]; edges?: CanvasEdge[] });

export function useCanvasGenerationController(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  currentProjectId: string | null;
  flowDirection: CanvasFlowDirection;
  getModelEntryByRef: (
    modelRef: string | undefined,
    kind: ModelKind,
  ) => CanvasModelEntry | undefined;
  getModelEntryForKind: (kind: ModelKind) => CanvasModelEntry | undefined;
  getResolvedBrainModelEntry: () => CanvasModelEntry | undefined;
  commitCanvas: (next: CanvasCommitInput) => void;
  patchElementDraft: (id: string, updates: Partial<CanvasElement>) => void;
  setSelectedId: (id: string | null) => void;
  appendAssistantMessage: (content: string) => void;
}) {
  const [pendingTextSourceIds, setPendingTextSourceIds] = useState<Set<string>>(
    () => new Set(),
  );

  const generateFromSelectedNode = useCallback(
    async (
      element: CanvasElement,
      instructionOverride?: string,
      options?: CanvasExecutionOptions,
    ) => {
      const prompt = (instructionOverride ?? element.prompt)?.trim();

      if (!prompt) {
        params.appendAssistantMessage(
          `请先在${getCanvasNodeEditorTitle(element)}节点下方输入生成描述。`,
        );
        return;
      }

      if (element.kind === "text") {
        await runCanvasTextNodeGeneration({
          element,
          prompt,
          options,
          elements: params.elements,
          edges: params.edges,
          currentProjectId: params.currentProjectId,
          flowDirection: params.flowDirection,
          getModelEntryByRef: params.getModelEntryByRef,
          getModelEntryForKind: params.getModelEntryForKind,
          getResolvedBrainModelEntry: params.getResolvedBrainModelEntry,
          commitCanvas: params.commitCanvas,
          patchElementDraft: params.patchElementDraft,
          setSelectedId: params.setSelectedId,
          setPendingTextSourceIds,
          appendAiMessage: params.appendAssistantMessage,
        });
        return;
      }

      const elementModelKind = getCanvasEditorModelKind(element);
      const modelEntry = params.getModelEntryByRef(element.modelRef, elementModelKind);
      const modelRef = modelEntry?.ref || "";

      if (!modelRef || !modelEntry?.model || !modelEntry.provider) {
        const message = `当前节点没有可用模型，请先为${getCanvasNodeEditorTitle(element)}节点配置或选择模型。`;
        params.patchElementDraft(element.id, {
          status: "failed",
          error: message,
        } as Partial<CanvasElement>);
        params.appendAssistantMessage(message);
        return;
      }
      if (
        element.kind !== "image" &&
        element.kind !== "video" &&
        element.kind !== "audio" &&
        element.kind !== "template"
      ) {
        params.appendAssistantMessage("当前节点暂不支持直接发送生成。");
        return;
      }

      await runCanvasMediaNodeGeneration({
        element,
        prompt,
        modelRef,
        modelEntry,
        elements: params.elements,
        edges: params.edges,
        currentProjectId: params.currentProjectId,
        flowDirection: params.flowDirection,
        commitCanvas: params.commitCanvas,
        patchElementDraft: params.patchElementDraft,
        setSelectedId: params.setSelectedId,
        appendAiMessage: params.appendAssistantMessage,
        getResolvedBrainModelEntry: params.getResolvedBrainModelEntry,
      });
    },
    [params],
  );

  return {
    pendingTextSourceIds,
    generateFromSelectedNode,
  };
}
