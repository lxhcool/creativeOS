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
import { DEFAULT_SPRITE_PROCESSING_OPTIONS } from "@/features/sprite-video-lab/defaults";
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
const SEQUENCE_NODE_WIDTH = 420;
const SEQUENCE_NODE_HEIGHT = 360;

function processorConfig(config: Record<string, unknown>) {
  return { ...DEFAULT_SPRITE_PROCESSING_OPTIONS, ...config };
}

export function useCanvasActionRunner(params: RunnerParams) {
  const runProcessor = useCallback(
    async (processor: CanvasProcessorElement, configOverride?: Record<string, unknown>) => {
      const source = params.elements.find((item) => item.id === processor.sourceIds[0]);
      const resultId = processor.resultIds?.[0];
      if (!source || source.kind !== "video" || !resultId) return;
      const nextConfig = configOverride || processor.config;

      params.patchElementDraft(processor.id, {
        status: "generating",
        error: undefined,
        config: nextConfig,
      } as Partial<CanvasElement>);
      params.patchElementDraft(resultId, { status: "generating", error: undefined });
      try {
        const { upload, job } = await runVideoToTransparentSequence({
          element: source as CanvasMediaElement,
          options: processorConfig(nextConfig),
        });
        const keepEvery = Number(nextConfig.keepEvery || DEFAULT_SPRITE_PROCESSING_OPTIONS.keepEvery);
        const sourceFps = Number(upload.media_info?.fps || 12);
        const fps = Math.max(1, Math.round(sourceFps / Math.max(1, keepEvery)));
        params.patchElementDraft(processor.id, { status: "done" });
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
          },
        } as Partial<CanvasElement>);
        params.appendMessage(`透明序列已生成，共 ${job.frame_count} 帧。`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "透明序列生成失败";
        params.patchElementDraft(processor.id, { status: "failed", error: message });
        params.patchElementDraft(resultId, { status: "failed", error: message });
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
      const resultPosition = {
        x: processorPosition.x + PROCESSOR_NODE_WIDTH / 2 + WORKFLOW_NODE_GAP + SEQUENCE_NODE_WIDTH / 2,
        y: processorPosition.y,
      };
      const result = createTemplateElement({
        position: resultPosition,
        templateId: "sequence-viewer",
        title: "透明序列",
        width: SEQUENCE_NODE_WIDTH,
        height: SEQUENCE_NODE_HEIGHT,
        props: { label: "透明序列", frameCount: 0, fps: 12 },
      });
      const processor = createProcessorElement({
        position: processorPosition,
        processorId: "video.transparent-sequence",
        title: "抠图处理",
        sourceIds: [element.id],
        resultIds: [result.id],
        config: DEFAULT_SPRITE_PROCESSING_OPTIONS,
        width: PROCESSOR_NODE_WIDTH,
        height: PROCESSOR_NODE_HEIGHT,
      });
      const nextEdges = [
        ...params.edges,
        createCanvasEdge({ sourceId: element.id, targetId: processor.id }),
        createCanvasEdge({ sourceId: processor.id, targetId: result.id }),
      ];

      params.commitCanvas({
        elements: [...params.elements, processor, result],
        edges: nextEdges,
      });
      params.setSelectedId(processor.id);
      params.onWorkflowCreated?.([element, processor, result]);
      params.appendMessage("已创建抠图处理节点。调整参数后点击「开始处理」。");
    },
    [params],
  );

  return { runAction, runProcessor };
}
