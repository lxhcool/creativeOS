import type { CanvasTemplateElement } from "@/entities/canvas/model/types";
import { sequenceViewerTemplate } from "./sequence-viewer";
import type { CanvasTemplateStrategy } from "./types";

const templateStrategies: Record<string, CanvasTemplateStrategy> = {
  [sequenceViewerTemplate.id]: sequenceViewerTemplate,
};

export function getCanvasTemplateStrategy(
  templateId: string,
): CanvasTemplateStrategy | undefined {
  return templateStrategies[templateId];
}

export function renderCanvasTemplateContent(element: CanvasTemplateElement) {
  const strategy = getCanvasTemplateStrategy(element.templateId);
  if (!strategy) return null;
  return strategy.renderContent({ element });
}
