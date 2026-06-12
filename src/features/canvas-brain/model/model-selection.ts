import type { CanvasElement } from "@/entities/canvas/model/types";
import type { ModelKind, UserModel, UserProvider } from "@/types/provider";
import type { CanvasActionIntent } from "./types";

export type CanvasModelEntry = {
  ref: string;
  model: UserModel;
  provider: UserProvider | undefined;
};

export type CanvasModelOption = {
  ref: string;
  label: string;
};

export function getCanvasEditorModelKind(element: CanvasElement): ModelKind {
  if (element.kind === "image") return "image";
  if (element.kind === "video") return "video";
  return "text";
}

export function getCanvasModelKindForOutput(
  outputKind: CanvasActionIntent["outputKind"],
): ModelKind {
  if (outputKind === "image" || outputKind === "video") return outputKind;
  return "text";
}

export function getCanvasModelRef(providerId: string, modelName: string): string {
  return `${providerId}:${modelName}`;
}

export function getCanvasModelLabel(
  provider: UserProvider | undefined,
  model: UserModel,
): string {
  return `${model.displayName || model.modelName}${provider ? ` · ${provider.name}` : ""}`;
}

export function canvasModelSupportsKind(model: UserModel, kind: ModelKind): boolean {
  if (!model.enabled || model.kind !== kind) return false;
  if (kind === "text") return model.capabilities.includes("text");
  return true;
}

export function getCanvasModelSelectionScore(model: UserModel, kind: ModelKind): number {
  const name = `${model.modelName} ${model.displayName || ""}`.toLowerCase();
  if (kind === "text") {
    let score = 0;
    if (model.capabilities.includes("json")) score += 100;
    if (model.capabilities.includes("tool_calling")) score += 20;
    if (name.includes("gpt-4") || name.includes("gpt-5")) score += 30;
    if (name.includes("claude") || name.includes("gemini")) score += 20;
    return score;
  }

  if (kind !== "image") return 0;

  if (name.includes("gpt-image")) return 100;
  if (name.includes("image")) return 80;
  if (name.includes("dall-e") || name.includes("dalle")) return 70;
  if (name.includes("imagen") || name.includes("flux")) return 60;
  return 0;
}

export function getCanvasModelEntries(params: {
  providerModels: Record<string, UserModel[]>;
  providers: UserProvider[];
  kind: ModelKind;
}): CanvasModelEntry[] {
  return Object.values(params.providerModels)
    .flat()
    .filter((model) => canvasModelSupportsKind(model, params.kind))
    .map((model) => ({
      ref: getCanvasModelRef(model.providerId, model.modelName),
      model,
      provider: params.providers.find((provider) => provider.id === model.providerId),
    }))
    .filter((entry): entry is CanvasModelEntry => Boolean(entry.provider?.enabled))
    .sort(
      (a, b) =>
        getCanvasModelSelectionScore(b.model, params.kind) -
        getCanvasModelSelectionScore(a.model, params.kind),
    );
}

export function toCanvasModelOptions(entries: CanvasModelEntry[]): CanvasModelOption[] {
  return entries.map((entry) => ({
    ref: entry.ref,
    label: getCanvasModelLabel(entry.provider, entry.model),
  }));
}
