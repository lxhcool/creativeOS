import { useCallback, useMemo } from "react";
import { getCanvasTextRole } from "@/entities/canvas/lib/textRoles";
import type {
  CanvasElement,
  CanvasTextElement,
  CanvasViewport,
  CanvasWorkflowType,
} from "@/entities/canvas/model/types";
import {
  getCanvasTextWorkflowReadiness,
  getCanvasWorkflowGroups,
  getCanvasWorkflowStrategy,
} from "@/features/canvas-workflows";

export function useCanvasWorkflowRuntime(params: {
  workflowType: CanvasWorkflowType;
  elements: CanvasElement[];
  selectedElement: CanvasElement | null;
  viewportSize: { width: number; height: number };
  onSelectElement: (id: string | null) => void;
  onClearSelectedEdge: () => void;
  onViewportChange: (
    updater: (current: CanvasViewport) => CanvasViewport,
  ) => void;
  onMessage: (content: string) => void;
}) {
  const {
    workflowType,
    elements,
    selectedElement,
    viewportSize,
    onSelectElement,
    onClearSelectedEdge,
    onViewportChange,
    onMessage,
  } = params;
  const strategy = getCanvasWorkflowStrategy(workflowType);
  const toolbarConfig = strategy.getToolbarConfig();
  const anchorConfig = strategy.getAnchorConfig();
  const aiAssistantConfig = strategy.getAIAssistantConfig();
  const starters = strategy.getStarterConfig();
  const isFixedWorkflow = workflowType !== "free";
  const groups = useMemo(
    () => getCanvasWorkflowGroups(elements),
    [elements],
  );
  const readiness = useMemo(
    () => getCanvasTextWorkflowReadiness(elements),
    [elements],
  );
  const activeAnchorId = (() => {
    if (!selectedElement || selectedElement.kind !== "text") {
      return anchorConfig[0]?.id;
    }

    const selectedRole = getCanvasTextRole(selectedElement.textRole);
    return (
      anchorConfig.find((anchor) => anchor.textRole === selectedRole)?.id ||
      anchorConfig[0]?.id
    );
  })();

  const navigateToAnchor = useCallback(
    (anchorId: string) => {
      const anchor = anchorConfig.find((item) => item.id === anchorId);
      if (!anchor?.textRole) return;

      const target = elements.find(
        (element): element is CanvasTextElement =>
          element.kind === "text" &&
          getCanvasTextRole(element.textRole) === anchor.textRole,
      );
      if (!target) {
        onMessage(`当前画布还没有「${anchor.label}」节点。`);
        return;
      }

      onSelectElement(target.id);
      onClearSelectedEdge();
      onViewportChange((current) => ({
        ...current,
        x:
          viewportSize.width / 2 -
          (target.x + target.width / 2) * current.scale,
        y:
          viewportSize.height / 2 -
          (target.y + target.height / 2) * current.scale,
      }));
    },
    [
      anchorConfig,
      elements,
      onClearSelectedEdge,
      onMessage,
      onSelectElement,
      onViewportChange,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  return {
    strategy,
    toolbarConfig,
    anchorConfig,
    aiAssistantConfig,
    starters,
    isFixedWorkflow,
    groups,
    readiness,
    activeAnchorId,
    navigateToAnchor,
  };
}
