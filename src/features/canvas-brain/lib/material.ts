import type { CanvasElement } from "@/entities/canvas/model/types";
import type { CanvasTextGenerationSource } from "../model/types";

export function getElementMaterialText(element: CanvasElement): string {
  if (element.kind === "text") return element.text.trim();
  if (element.kind === "image" || element.kind === "video" || element.kind === "audio") {
    return (element.prompt || element.label || "").trim();
  }
  return "";
}

export function hasConcreteAsset(element: CanvasElement): boolean {
  if (element.kind === "text") return element.text.trim().length > 0;
  if (element.kind === "image" || element.kind === "video" || element.kind === "audio") {
    return Boolean(element.src);
  }
  return true;
}

export function getElementsMaterialText(elements: CanvasElement[]): string {
  return elements.map(getElementMaterialText).filter(Boolean).join("\n\n");
}

export function buildGenerationPrompt(params: {
  instruction: string;
  current: CanvasElement;
  sources: CanvasElement[];
}): string {
  const parts = [
    params.instruction.trim(),
    getElementMaterialText(params.current),
    getElementsMaterialText(params.sources),
  ].filter(Boolean);

  return Array.from(new Set(parts)).join("\n\n");
}

export function buildVisibleResultPrompt(params: {
  current: CanvasElement;
  sources: CanvasElement[];
  fallback: string;
}): string {
  const material = getElementsMaterialText([params.current, ...params.sources]);
  return material || params.fallback;
}

export function toBrainNodeSummary(element: CanvasElement): {
  id: string;
  kind: string;
  content?: string;
  hasAsset: boolean;
} {
  const content = getElementMaterialText(element);
  return {
    id: element.id,
    kind: element.kind,
    content: content || undefined,
    hasAsset: hasConcreteAsset(element),
  };
}

export function toTextGenerationSource(element: CanvasElement): CanvasTextGenerationSource {
  return {
    kind: element.kind,
    text: element.kind === "text" ? element.text : undefined,
    prompt: element.prompt,
    label:
      element.kind === "image" || element.kind === "video" || element.kind === "audio"
        ? element.label
        : undefined,
  };
}
