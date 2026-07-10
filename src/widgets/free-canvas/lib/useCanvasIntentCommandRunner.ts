import { useCallback, useState } from "react";
import type {
  CanvasAssistantCommandOverride,
} from "./assistantCommandRunner";
import { runCanvasAssistantCommand } from "./assistantCommandRunner";
import {
  runCanvasAssetWorkflow,
  type CanvasAssetWorkflowRunnerContext,
} from "./canvasAssetWorkflowRunner";
import type { CanvasBrainChatMessage } from "../model/types";

type CanvasIntentCommandRunnerParams = CanvasAssetWorkflowRunnerContext & {
  chatInput: string;
  setChatInput: (value: string) => void;
  aiMessages: CanvasBrainChatMessage[];
};

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useCanvasIntentCommandRunner(params: CanvasIntentCommandRunnerParams) {
  const [aiLoading, setAiLoading] = useState(false);

  const submitAiCommand = useCallback(
    async (override?: CanvasAssistantCommandOverride) => {
      const command = (override?.command ?? params.chatInput).trim();
      if (!command || aiLoading) return;

      if (!override) {
        params.setChatInput("");
      }

      const display = override?.display || command;
      params.appendAiMessage("user", display);
      const plannedHistory: CanvasBrainChatMessage[] = [
        ...params.aiMessages,
        {
          id: createMessageId(),
          role: "user",
          content: display,
        },
      ];

      setAiLoading(true);
      try {
        await runCanvasAssistantCommand({
          command,
          display,
          history: plannedHistory,
          elements: params.elements,
          edges: params.edges,
          selectedElement: params.selectedElement,
          brainAttachmentIds: params.brainAttachmentIds,
          currentProjectId: params.currentProjectId,
          activeBrainModelEntry: params.getModelEntryByRef(params.resolvedBrainModelRef, "text"),
          center: params.worldCenter,
          appendAssistantMessage: (message) => params.appendAiMessage("assistant", message),
          clearBrainAttachments: () => params.setBrainAttachmentIds([]),
          commitCanvas: params.commitCanvas,
          setSelectedId: params.setSelectedId,
          runAssetWorkflow: ({ workflow, command: workflowCommand }) =>
            runCanvasAssetWorkflow({
              workflow,
              command: workflowCommand,
              context: params,
            }),
          generateFromSelectedNode: params.generateFromSelectedNode,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "创作输入执行失败";
        params.appendAiMessage("assistant", message);
      } finally {
        setAiLoading(false);
      }
    },
    [aiLoading, params],
  );

  return {
    aiLoading,
    submitAiCommand,
  };
}
