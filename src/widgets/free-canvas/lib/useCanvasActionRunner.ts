import { useCallback } from "react";
import {
  createCanvasEdge,
  createProcessorElement,
  createTemplateElement,
} from "@/entities/canvas/lib/factory";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasMediaElement,
  CanvasProcessorElement,
} from "@/entities/canvas/model/types";
import type { CanvasActionDefinition } from "@/features/canvas-actions";
import {
  CANVAS_DEFAULT_SPRITE_PROCESSING_OPTIONS,
} from "@/features/sprite-video-lab/defaults";
import { runVideoToTransparentSequence } from "@/features/sprite-video-lab/executors/videoToTransparentSequence";

type RunnerParams = {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  commitCanvas: (next: { elements?: CanvasElement[]; edges?: CanvasEdge[] }) => void;
  patchElementDraft: (id: string, updates: Partial<CanvasElement>) => void;
  setSelectedId: (id: string | null) => void;
  appendMessage: (content: string) => void;
  onWorkflowCreated?: (elements: CanvasElement[]) => void;
};

const WORKFLOW_NODE_GAP = 220;
const PROCESSOR_NODE_WIDTH = 880;
const PROCESSOR_NODE_HEIGHT = 720;
const SEQUENCE_PREVIEW_WIDTH = 420;
const SEQUENCE_PREVIEW_HEIGHT = 360;
const FRAME_LIST_WIDTH = 760;
const FRAME_LIST_HEIGHT = 520;

function processorConfig(config: Record<string, unknown>) {
  const canvasMode =
    config.canvasMode === "square_bottom" || config.canvasMode === "square_center"
      ? config.canvasMode
      : CANVAS_DEFAULT_SPRITE_PROCESSING_OPTIONS.canvasMode;

  return {
    ...CANVAS_DEFAULT_SPRITE_PROCESSING_OPTIONS,
    keepEvery: Math.max(
      2,
      typeof config.keepEvery === "number"
        ? config.keepEvery
        : CANVAS_DEFAULT_SPRITE_PROCESSING_OPTIONS.keepEvery,
    ),
    outputScale: Math.min(
      80,
      typeof config.outputScale === "number"
        ? config.outputScale
        : CANVAS_DEFAULT_SPRITE_PROCESSING_OPTIONS.outputScale,
    ),
    canvasMode,
  };
}

export function useCanvasActionRunner(params: RunnerParams) {
  const runProcessor = useCallback(
    async (processor: CanvasProcessorElement, configOverride?: Record<string, unknown>) => {
      const source = params.elements.find((item) => item.id === processor.sourceIds[0]);
      const resultIds = processor.resultIds || [];
      if (!source || source.kind !== "video" || resultIds.length === 0) return;
      const nextConfig = configOverride || processor.config;

      params.patchElementDraft(processor.id, {
        status: "generating",
        error: undefined,
        config: nextConfig,
      } as Partial<CanvasElement>);
      resultIds.forEach((resultId) => {
        params.patchElementDraft(resultId, { status: "generating", error: undefined });
      });
      try {
        const { upload, job, usedOptions, fallbackReason } = await runVideoToTransparentSequence({
          element: source as CanvasMediaElement,
          options: processorConfig(nextConfig),
        });
        const keepEvery = Number(usedOptions.keepEvery || CANVAS_DEFAULT_SPRITE_PROCESSING_OPTIONS.keepEvery);
        const sourceFps = Number(upload.media_info?.fps || 12);
        const fps = Math.max(1, Math.round(sourceFps / Math.max(1, keepEvery)));
        params.patchElementDraft(processor.id, {
          status: "done",
          config: usedOptions,
          error: fallbackReason
            ? `算法 + AI 路线失败，已自动降级为快速生成：${fallbackReason}`
            : undefined,
        } as Partial<CanvasElement>);
        resultIds.forEach((resultId) => {
          params.patchElementDraft(resultId, {
            status: "done",
            props: {
              label: upload.display_name || "透明序列",
              frameCount: job.frame_count,
              frames: job.frames,
              fps,
              jobId: job.job_id,
              processedDir: job.processed_dir,
              sourceMediaType: job.source_media_type,
              processingPreset: usedOptions.processingPreset,
              fallbackReason,
            },
          } as Partial<CanvasElement>);
        });
        params.appendMessage(
          fallbackReason
            ? `透明序列已生成，共 ${job.frame_count} 帧。算法 + AI 路线失败，已自动降级为快速生成。`
            : `透明序列已生成，共 ${job.frame_count} 帧。`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "透明序列生成失败";
        params.patchElementDraft(processor.id, { status: "failed", error: message });
        resultIds.forEach((resultId) => {
          params.patchElementDraft(resultId, { status: "failed", error: message });
        });
        params.appendMessage(message);
      }
    },
    [params],
  );

  const runAction = useCallback(
    async (action: CanvasActionDefinition, element: CanvasElement) => {
      if (action.id !== "video.toTransparentSequence" || element.kind !== "video") return;
      const processorPosition = {
        x: element.x + element.width + WORKFLOW_NODE_GAP + PROCESSOR_NODE_WIDTH / 2,
        y: element.y + element.height / 2,
      };
      const previewPosition = {
        x: processorPosition.x + PROCESSOR_NODE_WIDTH / 2 + WORKFLOW_NODE_GAP + SEQUENCE_PREVIEW_WIDTH / 2,
        y: processorPosition.y,
      };
      const listPosition = {
        x: previewPosition.x,
        y: previewPosition.y + SEQUENCE_PREVIEW_HEIGHT / 2 + WORKFLOW_NODE_GAP + FRAME_LIST_HEIGHT / 2,
      };
      const previewResult = createTemplateElement({
        position: previewPosition,
        templateId: "sequence-viewer",
        title: "透明序列",
        width: SEQUENCE_PREVIEW_WIDTH,
        height: SEQUENCE_PREVIEW_HEIGHT,
        props: { label: "透明序列", frameCount: 0, fps: 12 },
      });
      const frameListResult = createTemplateElement({
        position: listPosition,
        templateId: "frame-sequence-list",
        title: "帧序列",
        width: FRAME_LIST_WIDTH,
        height: FRAME_LIST_HEIGHT,
        props: { label: "帧序列", frameCount: 0, fps: 12 },
      });
      const processor = createProcessorElement({
        position: processorPosition,
        processorId: "video.transparent-sequence",
        title: "批量抠图处理",
        sourceIds: [element.id],
        resultIds: [previewResult.id, frameListResult.id],
        config: CANVAS_DEFAULT_SPRITE_PROCESSING_OPTIONS,
        width: PROCESSOR_NODE_WIDTH,
        height: PROCESSOR_NODE_HEIGHT,
      });
      const nextEdges = [
        ...params.edges,
        createCanvasEdge({ sourceId: element.id, targetId: processor.id }),
        createCanvasEdge({ sourceId: processor.id, targetId: previewResult.id }),
        createCanvasEdge({ sourceId: processor.id, targetId: frameListResult.id }),
      ];

      params.commitCanvas({
        elements: [...params.elements, processor, previewResult, frameListResult],
        edges: nextEdges,
      });
      params.setSelectedId(processor.id);
      params.onWorkflowCreated?.([element, processor, previewResult, frameListResult]);
      params.appendMessage("已创建批量抠图节点。默认使用 80% 输出和快速去绿幕，先兼顾质量和同步处理速度。");
    },
    [params],
  );

  return { runAction, runProcessor };
}
