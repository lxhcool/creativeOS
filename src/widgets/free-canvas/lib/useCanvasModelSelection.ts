import { useCallback, useEffect } from "react";
import type { CanvasElement } from "@/entities/canvas/model/types";
import {
  getCanvasEditorModelKind,
  getCanvasModelEntries,
  toCanvasModelOptions,
  type CanvasModelEntry,
} from "@/features/canvas-brain";
import { useProviderStore } from "@/stores/useProviderStore";
import type { ModelKind } from "@/types/provider";
import type { CanvasSelectOption } from "../model/types";

export function useCanvasModelSelection(params: {
  selectedElement: CanvasElement | null;
  brainModelRef: string;
}) {
  const providerModels = useProviderStore((state) => state.models);
  const providers = useProviderStore((state) => state.providers);
  const defaultModels = useProviderStore((state) => state.defaultModels);
  const providersLoaded = useProviderStore((state) => state.isLoaded);
  const loadProviders = useProviderStore((state) => state.loadProviders);

  useEffect(() => {
    if (!providersLoaded) {
      void loadProviders();
    }
  }, [loadProviders, providersLoaded]);

  const selectedModelKind = params.selectedElement
    ? getCanvasEditorModelKind(params.selectedElement)
    : "text";

  const getModelEntriesForKind = useCallback(
    (kind: ModelKind): CanvasModelEntry[] =>
      getCanvasModelEntries({
        providerModels,
        providers,
        kind,
      }),
    [providerModels, providers],
  );

  const getModelEntryForKind = useCallback(
    (kind: ModelKind): CanvasModelEntry | undefined => {
      const entries = getModelEntriesForKind(kind);
      const preferred = defaultModels[kind];

      return entries.find((entry) => entry.ref === preferred) || entries[0];
    },
    [defaultModels, getModelEntriesForKind],
  );

  const getModelEntryByRef = useCallback(
    (modelRef: string | undefined, kind: ModelKind): CanvasModelEntry | undefined => {
      const entries = getModelEntriesForKind(kind);
      return entries.find((entry) => entry.ref === modelRef) || getModelEntryForKind(kind);
    },
    [getModelEntriesForKind, getModelEntryForKind],
  );

  const modelOptions: CanvasSelectOption[] = toCanvasModelOptions(
    getCanvasModelEntries({
      providerModels,
      providers,
      kind: selectedModelKind,
    }),
  );
  const preferredModelValue =
    params.selectedElement?.modelRef || defaultModels[selectedModelKind] || "";
  const selectedModelValue = modelOptions.some(
    (option) => option.ref === preferredModelValue,
  )
    ? preferredModelValue
    : modelOptions[0]?.ref || "";

  const brainModelEntries = getModelEntriesForKind("text");
  const resolvedBrainModelRef =
    brainModelEntries.find((entry) => entry.ref === params.brainModelRef)?.ref ||
    defaultModels.text ||
    brainModelEntries[0]?.ref ||
    "";
  const hasBrainModel = brainModelEntries.some(
    (entry) => entry.ref === resolvedBrainModelRef,
  );
  const getResolvedBrainModelEntry = useCallback(
    (): CanvasModelEntry | undefined =>
      brainModelEntries.find((entry) => entry.ref === resolvedBrainModelRef),
    [brainModelEntries, resolvedBrainModelRef],
  );
  const brainModelOptions: CanvasSelectOption[] = toCanvasModelOptions(brainModelEntries);

  return {
    brainModelOptions,
    getModelEntryByRef,
    getModelEntryForKind,
    getResolvedBrainModelEntry,
    hasBrainModel,
    modelOptions,
    resolvedBrainModelRef,
    selectedModelValue,
  };
}
