import type { Dispatch, SetStateAction } from "react";
import {
  executeCanvasBrainMediaGeneration,
  executeCanvasBrainTextNode,
  getCanvasBrainDoneMessage,
  getCanvasBrainFailureMessage,
  getCanvasBrainGeneratingMessage,
  getCanvasBrainMissingModelMessage,
  getCanvasBrainReadyElementPatch,
  getCanvasBrainTextDoneMessage,
  getCanvasBrainTextGeneratingMessage,
  getCanvasReferenceImageUrls,
  getCanvasModelKindForOutput,
  resolveCanvasExecutionSources,
  type CanvasActionIntent,
  type CanvasModelEntry,
} from "@/features/canvas-brain";
import { createCanvasEdge } from "@/entities/canvas/lib/factory";
import {
  appendResultNodeFromSources,
  createResultPlaceholder,
  createTextResultNode,
} from "@/entities/canvas/lib/workflow";
import {
  getCanvasTextRole,
  getCanvasTextRoleConfig,
} from "@/entities/canvas/lib/textRoles";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasTextElement,
  CanvasTextMeta,
  CanvasTextRole,
} from "@/entities/canvas/model/types";
import type { ModelKind } from "@/types/provider";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  NODE_PADDING,
} from "../model/constants";
import type { CanvasSnapshot } from "../model/types";
import type { CanvasFlowDirection } from "./geometry";
import {
  findReusableFailedTextResult,
  getCanvasGenericResultPosition,
  getCanvasTextResultParentNodeId,
  getCanvasTextResultPosition,
  getCanvasTextResultRelationKind,
  getNextTextChapterNo,
  getNextTextResultVersion,
} from "./textResultLayout";

export type CanvasExecutionOptions = {
  extraSourceIds?: string[];
  extraSourceElements?: CanvasElement[];
  intentOverride?: CanvasActionIntent;
  resultTextRole?: CanvasTextRole;
  generationMode?: "single" | "collaborative";
  baseElements?: CanvasElement[];
  baseEdges?: CanvasEdge[];
  actionId?: string;
  actionLabel?: string;
  doneMessage?: string;
  silent?: boolean;
};

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasEdge[] }
  | ((current: CanvasSnapshot) => { elements?: CanvasElement[]; edges?: CanvasEdge[] });

export function mergeElementsWithUpdates(params: {
  currentElements: CanvasElement[];
  plannedElements: CanvasElement[];
  updatesById?: Map<string, Partial<CanvasElement>>;
}): CanvasElement[] {
  const plannedById = new Map(
    params.plannedElements.map((element) => [element.id, element]),
  );
  const updatesById = params.updatesById || new Map<string, Partial<CanvasElement>>();
  const currentIds = new Set(params.currentElements.map((element) => element.id));
  const merged = params.currentElements.map((element) =>
    updatesById.has(element.id)
      ? ({ ...element, ...updatesById.get(element.id) } as CanvasElement)
      : element,
  );

  params.plannedElements.forEach((plannedElement) => {
    if (currentIds.has(plannedElement.id)) return;
    merged.push({
      ...plannedElement,
      ...(updatesById.get(plannedElement.id) || {}),
    } as CanvasElement);
  });

  return merged.filter((element) => plannedById.has(element.id) || currentIds.has(element.id));
}

function mergeCanvasEdges(currentEdges: CanvasEdge[], plannedEdges: CanvasEdge[]) {
  const edgeKeys = new Set(
    currentEdges.map((edge) => `${edge.sourceId}:${edge.targetId}`),
  );

  return [
    ...currentEdges,
    ...plannedEdges.filter((edge) => {
      const key = `${edge.sourceId}:${edge.targetId}`;
      if (edgeKeys.has(key)) return false;
      edgeKeys.add(key);
      return true;
    }),
  ];
}

function createCanvasAgentRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mergeUniqueCanvasElements(elements: Array<CanvasElement | null | undefined>): CanvasElement[] {
  const byId = new Map<string, CanvasElement>();
  elements.forEach((element) => {
    if (!element) return;
    byId.set(element.id, element);
  });
  return Array.from(byId.values());
}

export async function runCanvasTextNodeGeneration(params: {
  element: CanvasTextElement;
  prompt: string;
  options?: CanvasExecutionOptions;
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
  setPendingTextSourceIds: Dispatch<SetStateAction<Set<string>>>;
  appendAiMessage: (content: string) => void;
}): Promise<void> {
  const {
    element,
    prompt,
    options,
    elements,
    edges,
    currentProjectId,
    flowDirection,
    getModelEntryByRef,
    getModelEntryForKind,
    getResolvedBrainModelEntry,
    commitCanvas,
    patchElementDraft,
    setSelectedId,
    setPendingTextSourceIds,
    appendAiMessage,
  } = params;

  const workingElements = options?.baseElements || elements;
  const workingEdges = options?.baseEdges || edges;
  const modelEntry = getModelEntryByRef(element.modelRef, "text");
  const modelRef = modelEntry?.ref || "";

  if (!modelRef || !modelEntry?.model || !modelEntry.provider) {
    const message = "未配置可用文本模型，请先在模型设置中启用一个文本模型。";
    patchElementDraft(element.id, {
      status: "failed",
      error: message,
    } as Partial<CanvasElement>);
    appendAiMessage(message);
    return;
  }
  const shouldCreatePendingTextResult =
    options?.intentOverride?.outputKind === "text" &&
    options.intentOverride.placement === "create_result";
  const pendingTextRole =
    options?.resultTextRole || getCanvasTextRole(element.textRole);
  const pendingSourceRole = getCanvasTextRole(element.textRole);

  const sourceElements = resolveCanvasExecutionSources({
    targetId: element.id,
    elements: workingElements,
    edges: workingEdges,
    extraSourceIds: options?.extraSourceIds,
    extraSourceElements: mergeUniqueCanvasElements(options?.extraSourceElements || []),
  });
  const textResultSourceElements = mergeUniqueCanvasElements([
    element,
  ]);

  const pendingTextRoleConfig = getCanvasTextRoleConfig(pendingTextRole);
  const pendingTextPrompt = options?.intentOverride?.instruction || prompt;
  const pendingTextTitle =
    options?.actionLabel
      ? options.actionLabel
      : pendingTextRoleConfig.title;
  const pendingTextRelationKind = getCanvasTextResultRelationKind({
    source: element,
    resultTextRole: pendingTextRole,
    actionId: options?.actionId,
  });
  const pendingTextParentNodeId = getCanvasTextResultParentNodeId({
    source: element,
    relationKind: pendingTextRelationKind,
  });
  const reusableFailedTextResult = shouldCreatePendingTextResult
    ? findReusableFailedTextResult({
        elements: workingElements,
        edges: workingEdges,
        sourceId: element.id,
        resultTextRole: pendingTextRole,
        instruction: pendingTextPrompt,
      })
    : undefined;
  const pendingTextVersion = shouldCreatePendingTextResult
    ? reusableFailedTextResult?.meta?.version ||
      getNextTextResultVersion({
        elements: workingElements,
        sourceId: element.id,
        resultTextRole: pendingTextRole,
      })
    : undefined;
  const pendingTextBaseMeta: CanvasTextMeta | undefined =
    shouldCreatePendingTextResult
      ? {
          title:
            pendingTextVersion && pendingTextVersion > 1
              ? `${pendingTextTitle} v${pendingTextVersion}`
              : pendingTextTitle,
          chapterNo: getNextTextChapterNo({
            source: element,
            resultTextRole: pendingTextRole,
            instruction: pendingTextPrompt,
          }),
          version: pendingTextVersion,
          sourceNodeId: element.id,
          sourceRole: pendingSourceRole,
          parentNodeId: pendingTextParentNodeId,
          relationKind: pendingTextRelationKind,
          sourceRunId: createCanvasAgentRunId(),
        }
      : undefined;
  const pendingTextResultNode = shouldCreatePendingTextResult
    ? reusableFailedTextResult
      ? ({
          ...reusableFailedTextResult,
          text: "",
          prompt: pendingTextPrompt,
          modelRef,
          textRole: pendingTextRole,
          meta: {
            ...(reusableFailedTextResult.meta || {}),
            ...(pendingTextBaseMeta || {}),
          },
          status: "generating",
          error: undefined,
        } satisfies CanvasTextElement)
      : ({
          ...createTextResultNode({
            source: element,
            text: "",
            prompt: pendingTextPrompt,
            modelRef,
            position: getCanvasTextResultPosition({
              elements: workingElements,
              edges: workingEdges,
              source: element,
              resultTextRole: pendingTextRole,
              actionId: options?.actionId,
              flowDirection,
            }),
            textRole: pendingTextRole,
            meta: pendingTextBaseMeta,
          }),
          status: "generating",
        } satisfies CanvasTextElement)
    : null;
  const pendingTextSourceId = pendingTextResultNode ? element.id : null;

  if (pendingTextResultNode) {
    setPendingTextSourceIds((current) => {
      const next = new Set(current);
      next.add(element.id);
      return next;
    });
    if (reusableFailedTextResult) {
      commitCanvas((current) => {
        const missingSourceEdges = textResultSourceElements
          .filter(
            (source) =>
              !current.edges.some(
                (edge) =>
                  edge.sourceId === source.id &&
                  edge.targetId === pendingTextResultNode.id,
              ),
          )
          .map((source) =>
            createCanvasEdge({
              sourceId: source.id,
              targetId: pendingTextResultNode.id,
            }),
          );

        return {
          elements: mergeElementsWithUpdates({
            currentElements: current.elements,
            plannedElements: workingElements,
            updatesById: new Map([[pendingTextResultNode.id, pendingTextResultNode]]),
          }),
          edges: [...current.edges, ...missingSourceEdges],
        };
      });
    } else {
      commitCanvas((current) =>
        appendResultNodeFromSources({
          elements: mergeElementsWithUpdates({
            currentElements: current.elements,
            plannedElements: workingElements,
          }),
          edges: current.edges,
          sources: textResultSourceElements,
          result: pendingTextResultNode,
        }),
      );
    }
  } else {
    patchElementDraft(element.id, {
      status: "generating",
      error: undefined,
      modelRef,
    } as Partial<CanvasElement>);
  }

  try {
    if (!options?.silent) {
      appendAiMessage(
        getCanvasBrainTextGeneratingMessage({
          generationMode: options?.generationMode,
        }),
      );
    }
    const execution = await executeCanvasBrainTextNode({
      prompt,
      element,
      sourceElements,
      projectId: currentProjectId,
      provider: modelEntry.provider,
      model: modelEntry.model,
      intentOverride: options?.intentOverride,
      resultTextRole: options?.resultTextRole,
      generationMode: options?.generationMode,
    });

    if (execution.kind === "empty-material") {
      const errorMessage = "当前节点没有可用于生成的素材内容。";
      const updates = new Map<string, Partial<CanvasElement>>([
        [
          element.id,
          {
            status: "failed",
            error: errorMessage,
          } as Partial<CanvasElement>,
        ],
      ]);
      if (pendingTextResultNode) {
        updates.set(pendingTextResultNode.id, {
          status: "failed",
          error: errorMessage,
        } as Partial<CanvasElement>);
      }
      commitCanvas((current) => ({
        elements: mergeElementsWithUpdates({
          currentElements: current.elements,
          plannedElements: workingElements,
          updatesById: updates,
        }),
        edges: current.edges,
      }));
      appendAiMessage(execution.message);
      return;
    }

    if (execution.kind === "media") {
      const intent = execution.intent;
      const outputModelEntry = getModelEntryForKind(
        getCanvasModelKindForOutput(intent.outputKind),
      );

      if (!outputModelEntry?.provider) {
        const message = getCanvasBrainMissingModelMessage(intent.outputKind);
        patchElementDraft(element.id, {
          status: "failed",
          error: message,
        } as Partial<CanvasElement>);
        appendAiMessage(message);
        return;
      }

      const resultNode = createResultPlaceholder({
        source: element,
        kind: intent.outputKind,
        prompt: execution.visiblePrompt,
        modelRef: outputModelEntry.ref,
        position: getCanvasGenericResultPosition(element, flowDirection),
      });

      commitCanvas((current) =>
        appendResultNodeFromSources({
          elements: mergeElementsWithUpdates({
            currentElements: current.elements,
            plannedElements: workingElements,
            updatesById: new Map([
              [element.id, getCanvasBrainReadyElementPatch(modelRef)],
            ]),
          }),
          edges: current.edges,
          sources: [element, ...sourceElements],
          result: resultNode,
        }),
      );
      setSelectedId(resultNode.id);

      if (intent.outputKind === "image") {
        try {
          appendAiMessage(
            getCanvasBrainGeneratingMessage({
              kind: "image",
              hasMaterialContext: true,
            }),
          );
          const patch = await executeCanvasBrainMediaGeneration({
            kind: "image",
            prompt: execution.generationPrompt,
            projectId: currentProjectId,
            referenceImageUrls: getCanvasReferenceImageUrls([
              element,
              ...sourceElements,
            ]),
            provider: outputModelEntry.provider,
            model: outputModelEntry.model,
            promptProvider: getResolvedBrainModelEntry()?.provider,
            promptModel: getResolvedBrainModelEntry()?.model,
            element: resultNode,
            padding: NODE_PADDING,
            fallbackSize: {
              width: DEFAULT_NODE_WIDTH,
              height: DEFAULT_NODE_HEIGHT,
            },
          });

          patchElementDraft(resultNode.id, patch);
          appendAiMessage(
            getCanvasBrainDoneMessage({
              kind: "image",
              createdResult: true,
            }),
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : "图片生成失败";
          const message = getCanvasBrainFailureMessage({
            kind: "image",
            detail,
          });
          patchElementDraft(resultNode.id, {
            status: "failed",
            error: message,
          } as Partial<CanvasElement>);
          appendAiMessage(message);
        }
        return;
      }

      if (intent.outputKind === "video") {
        try {
          appendAiMessage(
            getCanvasBrainGeneratingMessage({
              kind: "video",
              hasMaterialContext: true,
            }),
          );
          const patch = await executeCanvasBrainMediaGeneration({
            kind: "video",
            prompt: execution.generationPrompt,
            projectId: currentProjectId,
            provider: outputModelEntry.provider,
            model: outputModelEntry.model,
            element: resultNode,
            padding: NODE_PADDING,
            fallbackSize: {
              width: DEFAULT_NODE_WIDTH,
              height: DEFAULT_NODE_HEIGHT,
            },
          });

          patchElementDraft(resultNode.id, patch);
          appendAiMessage(
            getCanvasBrainDoneMessage({
              kind: "video",
              createdResult: true,
            }),
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : "视频生成失败";
          const message = getCanvasBrainFailureMessage({
            kind: "video",
            detail,
          });
          patchElementDraft(resultNode.id, {
            status: "failed",
            error: message,
          } as Partial<CanvasElement>);
          appendAiMessage(message);
        }
        return;
      }

      appendAiMessage("我已为这次创作准备好新的结果素材。");
      return;
    }

    if (execution.shouldUpdateCurrent) {
      const previousText = element.text;
      const previousRevisions = element.meta?.revisions || [];
      const shouldSaveRevision =
        previousText.trim().length > 0 && previousText !== execution.content;
      const nextTextMeta = {
        ...(element.meta || {}),
        ...(execution.meta || {}),
        revisions: shouldSaveRevision
          ? [
              {
                id: `rev_${Date.now()}`,
                text: previousText,
                createdAt: new Date().toISOString(),
                label: options?.actionLabel ? `${options.actionLabel}前` : "上一版",
                modelRef,
              },
              ...previousRevisions,
            ].slice(0, 8)
          : previousRevisions,
      };

      commitCanvas((current) => ({
        elements: mergeElementsWithUpdates({
          currentElements: current.elements,
          plannedElements: workingElements,
          updatesById: new Map([
            [
              element.id,
              {
                text: execution.content,
                meta: nextTextMeta,
                ...getCanvasBrainReadyElementPatch(modelRef),
              },
            ],
          ]),
        }),
        edges: mergeCanvasEdges(current.edges, workingEdges),
      }));
      if (!options?.silent) {
        appendAiMessage(options?.doneMessage || getCanvasBrainTextDoneMessage(false));
      }
      return;
    }

    if (pendingTextResultNode) {
      commitCanvas((current) => ({
        elements: mergeElementsWithUpdates({
          currentElements: current.elements,
          plannedElements: workingElements,
          updatesById: new Map([
            [element.id, getCanvasBrainReadyElementPatch(modelRef)],
            [
              pendingTextResultNode.id,
              {
                text: execution.content,
                meta: {
                  ...(pendingTextBaseMeta || {}),
                  ...(execution.meta || {}),
                  title:
                    execution.meta?.title ||
                    pendingTextBaseMeta?.title ||
                    pendingTextRoleConfig.title,
                },
                asset: pendingTextResultNode.asset
                  ? {
                      ...pendingTextResultNode.asset,
                      title:
                        execution.meta?.title ||
                        pendingTextBaseMeta?.title ||
                        pendingTextRoleConfig.title,
                      status: "ready",
                      modelRef,
                    }
                  : undefined,
                status: "done",
                error: undefined,
              } as Partial<CanvasElement>,
            ],
          ]),
        }),
        edges: current.edges,
      }));
      setSelectedId(pendingTextResultNode.id);
      appendAiMessage(getCanvasBrainTextDoneMessage(true));
      return;
    }

    const resultTextRole = pendingTextRole;
    const resultVersion = getNextTextResultVersion({
      elements: workingElements,
      sourceId: element.id,
      resultTextRole,
    });
    const resultRoleConfig = getCanvasTextRoleConfig(resultTextRole);
    const sourceRole = pendingSourceRole;
    const resultRelationKind = getCanvasTextResultRelationKind({
      source: element,
      resultTextRole,
      actionId: options?.actionId,
    });
    const resultNode = createTextResultNode({
      source: element,
      text: execution.content,
      prompt: execution.intent.instruction || prompt,
      modelRef,
      position: getCanvasTextResultPosition({
        elements: workingElements,
        edges: workingEdges,
        source: element,
        resultTextRole,
        actionId: options?.actionId,
        flowDirection,
      }),
      textRole: resultTextRole,
      meta: {
        ...(execution.meta || {}),
        title:
          execution.meta?.title ||
          (resultVersion > 1
            ? `${resultRoleConfig.title} v${resultVersion}`
            : resultRoleConfig.title),
        chapterNo: getNextTextChapterNo({
          source: element,
          resultTextRole,
          instruction: execution.intent.instruction || prompt,
        }),
        version: resultVersion,
        sourceNodeId: element.id,
        sourceRole,
        parentNodeId: getCanvasTextResultParentNodeId({
          source: element,
          relationKind: resultRelationKind,
        }),
        relationKind: resultRelationKind,
        sourceRunId: createCanvasAgentRunId(),
      },
    });
    commitCanvas((current) =>
      appendResultNodeFromSources({
        elements: mergeElementsWithUpdates({
          currentElements: current.elements,
          plannedElements: workingElements,
          updatesById: new Map([
            [element.id, getCanvasBrainReadyElementPatch(modelRef)],
          ]),
        }),
        edges: current.edges,
        sources: textResultSourceElements,
        result: resultNode,
      }),
    );
    setSelectedId(resultNode.id);
    appendAiMessage(getCanvasBrainTextDoneMessage(true));
  } catch (error) {
    const message = error instanceof Error ? error.message : "文本生成失败";
    const updates = new Map<string, Partial<CanvasElement>>([
      [
        element.id,
        {
          status: "failed",
          error: message,
        } as Partial<CanvasElement>,
      ],
    ]);
    if (pendingTextResultNode) {
      updates.set(pendingTextResultNode.id, {
        status: "failed",
        error: message,
      } as Partial<CanvasElement>);
    }
    commitCanvas((current) => ({
      elements: mergeElementsWithUpdates({
        currentElements: current.elements,
        plannedElements: workingElements,
        updatesById: updates,
      }),
      edges: mergeCanvasEdges(current.edges, workingEdges),
    }));
    appendAiMessage(message);
  } finally {
    if (pendingTextSourceId) {
      setPendingTextSourceIds((current) => {
        const next = new Set(current);
        next.delete(pendingTextSourceId);
        return next;
      });
    }
  }
}
