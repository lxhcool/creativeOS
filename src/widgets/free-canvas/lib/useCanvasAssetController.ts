import { useCallback, useRef } from "react";
import {
  createImageElement,
  createMediaElement,
} from "@/entities/canvas/lib/factory";
import type {
  CanvasElement,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasProjectExport,
} from "@/entities/canvas/model/types";
import {
  getCanvasBrainMediaNodeSize,
  readBrowserImageSize,
  readBrowserVideoSize,
} from "@/features/canvas-brain";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  NODE_PADDING,
} from "../model/constants";
import {
  getCanvasProjectName,
  normalizeCanvasProjectExport,
} from "./canvasProjectStorage";

type UploadedCanvasAsset = {
  url: string;
  name: string;
  type: string;
  kind: "image" | "video" | "audio" | "file";
};

async function uploadCanvasAssetFile(
  file: File,
  projectId?: string | null,
): Promise<UploadedCanvasAsset> {
  const formData = new FormData();
  formData.append("file", file);
  if (projectId) formData.append("projectId", projectId);

  const response = await fetch("/api/canvas/assets/upload", {
    method: "POST",
    body: formData,
  });
  const data = (await response.json()) as Partial<UploadedCanvasAsset> & {
    error?: string;
  };

  if (!response.ok || !data.url || !data.name || !data.kind) {
    throw new Error(data.error || "资产上传失败");
  }

  return {
    url: data.url,
    name: data.name,
    type: data.type || file.type,
    kind: data.kind,
  };
}

const readImageSize = readBrowserImageSize;

function readVideoSize(src: string): Promise<{ width: number; height: number }> {
  return readBrowserVideoSize(src, {
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
  });
}

function getMediaNodeSize(intrinsicWidth: number, intrinsicHeight: number): {
  width: number;
  height: number;
} {
  return getCanvasBrainMediaNodeSize({
    intrinsicSize: {
      width: intrinsicWidth,
      height: intrinsicHeight,
    },
    padding: NODE_PADDING,
  });
}

const getImageNodeSize = getMediaNodeSize;
const getVideoNodeSize = getMediaNodeSize;

export function useCanvasAssetController(params: {
  elements: CanvasElement[];
  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  worldCenter: () => { x: number; y: number };
  setBrainAttachmentIds: (updater: (current: string[]) => string[]) => void;
  appendAssistantMessage: (content: string) => void;
  currentProjectId: string | null;
  restoreCanvasProject: (
    payload: CanvasProjectExport,
    options?: { projectId?: string; useHistory?: boolean },
  ) => boolean;
  persistProjectRecord: (
    projectId: string,
    payload: CanvasProjectExport,
    name?: string,
  ) => Promise<boolean>;
  addCanvasSaveHistory: (
    payload: CanvasProjectExport,
    name?: string,
  ) => Promise<unknown>;
  showCanvasSaveStatus: (message: string) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const brainImageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const pendingImageTargetRef = useRef<string | null>(null);
  const pendingVideoTargetRef = useRef<string | null>(null);
  const pendingAudioTargetRef = useRef<string | null>(null);

  const requestImageUpload = useCallback((element: CanvasImageElement) => {
    pendingImageTargetRef.current = element.id;
    imageInputRef.current?.click();
  }, []);

  const requestVideoUpload = useCallback((element: CanvasMediaElement) => {
    pendingVideoTargetRef.current = element.id;
    videoInputRef.current?.click();
  }, []);

  const requestAudioUpload = useCallback((element: CanvasMediaElement) => {
    pendingAudioTargetRef.current = element.id;
    audioInputRef.current?.click();
  }, []);

  const handleImageFile = useCallback(
    async (file: File | undefined, targetId?: string | null) => {
      if (!file) return;
      let upload: UploadedCanvasAsset;
      try {
        upload = await uploadCanvasAssetFile(file, params.currentProjectId);
      } catch (error) {
        params.showCanvasSaveStatus(error instanceof Error ? error.message : "图片上传失败");
        return;
      }
      const src = upload.url;
      const imageSize = await readImageSize(src);
      const nodeSize = getImageNodeSize(imageSize.width, imageSize.height);

      if (targetId) {
        const target = params.elements.find(
          (element) => element.id === targetId && element.kind === "image",
        );
        if (!target) return;

        params.updateElement(target.id, {
          src,
          label: upload.name,
          x: target.x + target.width / 2 - nodeSize.width / 2,
          y: target.y + target.height / 2 - nodeSize.height / 2,
          width: nodeSize.width,
          height: nodeSize.height,
        } as Partial<CanvasElement>);
        return;
      }

      const center = params.worldCenter();
      params.addElement({
        ...createImageElement({
          position: center,
          src,
          label: upload.name,
        }),
        x: center.x - nodeSize.width / 2,
        y: center.y - nodeSize.height / 2,
        width: nodeSize.width,
        height: nodeSize.height,
      });
    },
    [params],
  );

  const handleBrainImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      let upload: UploadedCanvasAsset;
      try {
        upload = await uploadCanvasAssetFile(file, params.currentProjectId);
      } catch (error) {
        params.showCanvasSaveStatus(error instanceof Error ? error.message : "参考图上传失败");
        return;
      }
      const src = upload.url;
      const imageSize = await readImageSize(src);
      const nodeSize = getImageNodeSize(imageSize.width, imageSize.height);
      const center = params.worldCenter();
      const element = {
        ...createImageElement({
          position: {
            x: center.x - 260,
            y: center.y,
          },
          src,
          label: upload.name,
        }),
        x: center.x - 260 - nodeSize.width / 2,
        y: center.y - nodeSize.height / 2,
        width: nodeSize.width,
        height: nodeSize.height,
      };

      params.addElement(element);
      params.setBrainAttachmentIds((current) =>
        Array.from(new Set([...current, element.id])),
      );
      params.appendAssistantMessage(
        `已把「${upload.name}」添加为画布图片素材，下一次发送会优先参考它。`,
      );
    },
    [params],
  );

  const handleVideoFile = useCallback(
    async (file: File | undefined, targetId?: string | null) => {
      if (!file) return;
      let upload: UploadedCanvasAsset;
      try {
        upload = await uploadCanvasAssetFile(file, params.currentProjectId);
      } catch (error) {
        params.showCanvasSaveStatus(error instanceof Error ? error.message : "视频上传失败");
        return;
      }
      const src = upload.url;
      const videoSize = await readVideoSize(src);
      const nodeSize = getVideoNodeSize(videoSize.width, videoSize.height);

      if (targetId) {
        const target = params.elements.find(
          (element) => element.id === targetId && element.kind === "video",
        );
        if (!target) return;

        params.updateElement(target.id, {
          src,
          label: upload.name,
          x: target.x + target.width / 2 - nodeSize.width / 2,
          y: target.y + target.height / 2 - nodeSize.height / 2,
          width: nodeSize.width,
          height: nodeSize.height,
        } as Partial<CanvasElement>);
        return;
      }

      const center = params.worldCenter();
      params.addElement({
        ...createMediaElement({
          kind: "video",
          position: center,
          src,
          label: upload.name,
        }),
        x: center.x - nodeSize.width / 2,
        y: center.y - nodeSize.height / 2,
        width: nodeSize.width,
        height: nodeSize.height,
      });
    },
    [params],
  );

  const handleAudioFile = useCallback(
    async (file: File | undefined, targetId?: string | null) => {
      if (!file) return;
      let upload: UploadedCanvasAsset;
      try {
        upload = await uploadCanvasAssetFile(file, params.currentProjectId);
      } catch (error) {
        params.showCanvasSaveStatus(error instanceof Error ? error.message : "音频上传失败");
        return;
      }
      const src = upload.url;

      if (targetId) {
        const target = params.elements.find(
          (element) => element.id === targetId && element.kind === "audio",
        );
        if (!target) return;

        params.updateElement(target.id, {
          src,
          label: upload.name,
        } as Partial<CanvasElement>);
        return;
      }

      params.addElement(
        createMediaElement({
          kind: "audio",
          position: params.worldCenter(),
          src,
          label: upload.name,
        }),
      );
    },
    [params],
  );

  const handleImportFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      if (file.type.startsWith("image/")) {
        await handleImageFile(file);
        return;
      }

      if (file.type.startsWith("video/")) {
        await handleVideoFile(file);
        return;
      }

      if (file.type.startsWith("audio/")) {
        await handleAudioFile(file);
        return;
      }

      if (!file.name.toLowerCase().endsWith(".json")) return;

      try {
        const text = await file.text();
        const payload = normalizeCanvasProjectExport(
          JSON.parse(text) as Partial<CanvasProjectExport>,
        );

        params.restoreCanvasProject(payload, {
          projectId: params.currentProjectId || undefined,
          useHistory: true,
        });
        if (params.currentProjectId) {
          void params.persistProjectRecord(
            params.currentProjectId,
            payload,
            file.name.replace(/\.json$/i, "") || undefined,
          );
        }
        void params.addCanvasSaveHistory(
          payload,
          file.name.replace(/\.json$/i, "") || getCanvasProjectName(payload),
        );
        params.showCanvasSaveStatus("已导入画布，并加入保存记录");
      } catch (error) {
        console.warn("Failed to import canvas project", error);
        params.showCanvasSaveStatus("导入失败，JSON 文件无法解析");
      }
    },
    [handleAudioFile, handleImageFile, handleVideoFile, params],
  );

  return {
    imageInputRef,
    brainImageInputRef,
    videoInputRef,
    audioInputRef,
    importInputRef,
    pendingImageTargetRef,
    pendingVideoTargetRef,
    pendingAudioTargetRef,
    requestImageUpload,
    requestVideoUpload,
    requestAudioUpload,
    handleImageFile,
    handleBrainImageFile,
    handleVideoFile,
    handleAudioFile,
    handleImportFile,
  };
}
