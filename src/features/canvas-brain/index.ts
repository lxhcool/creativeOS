export {
  requestCanvasImageGeneration,
  requestCanvasIntent,
  requestCanvasProjectMemoryExtraction,
  requestCanvasTextGeneration,
  requestCanvasVideoGeneration,
  writeCanvasProjectMemoryPatches,
} from "./api/client";
export {
  buildGenerationPrompt,
  buildVisibleResultPrompt,
  getElementMaterialText,
  hasConcreteAsset,
  toTextGenerationSource,
} from "./lib/material";
export { buildFallbackMaterialText } from "./lib/fallback";
export {
  runCanvasBrainTurn,
} from "./model/harness";
export {
  resolveCanvasExecutionSources,
} from "./model/execution-context";
export {
  getCanvasEditorModelKind,
  getCanvasModelEntries,
  getCanvasModelKindForOutput,
  toCanvasModelOptions,
} from "./model/model-selection";
export {
  buildGeneratedMediaElementPatch,
  executeCanvasBrainTextNode,
  executeCanvasBrainMediaGeneration,
  getCanvasBrainDoneMessage,
  getCanvasBrainFailureMessage,
  getCanvasBrainGeneratingMessage,
  getCanvasBrainTextGeneratingMessage,
  getCanvasBrainMediaNodeSize,
  getCanvasBrainMissingModelMessage,
  getCanvasBrainReadyElementPatch,
  getCanvasBrainTextDoneMessage,
  getCanvasReferenceImageUrls,
  readBrowserImageSize,
  readBrowserVideoSize,
} from "./model/executors";
export type {
  CanvasActionIntent,
  CanvasAssetWorkflowKind,
} from "./model/types";
export type {
  CanvasModelEntry,
  CanvasModelOption,
} from "./model/model-selection";
