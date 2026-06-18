import { useEffect, useState } from "react";
import { Image as KonvaImage, Rect, Text } from "react-konva";
import { spriteAssetUrl } from "@/features/sprite-video-lab/api";
import type { SpriteFrame } from "@/features/sprite-video-lab/types";
import { useHtmlImage } from "../lib/media";
import type { CanvasTemplateStrategy } from "./types";

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readFrames(value: unknown): SpriteFrame[] {
  if (!Array.isArray(value)) return [];
  return value.filter((frame): frame is SpriteFrame => (
    Boolean(frame) &&
    typeof frame === "object" &&
    typeof (frame as SpriteFrame).url === "string"
  ));
}

function SequenceViewerContent({ element }: { element: Parameters<CanvasTemplateStrategy["renderContent"]>[0]["element"] }) {
  const props = element.props || {};
  const frames = readFrames(props.frames);
  const fps = readNumber(props.fps, 12);
  const [index, setIndex] = useState(0);
  const image = useHtmlImage(spriteAssetUrl(frames[index]?.url));
  const contentWidth = Math.max(24, element.width - 32);
  const contentHeight = Math.max(24, element.height - 88);

  useEffect(() => {
    if (frames.length <= 1) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % frames.length),
      1000 / Math.max(1, fps),
    );
    return () => window.clearInterval(timer);
  }, [fps, frames.length]);

  if (!image) return null;

  const scale = Math.min(contentWidth / image.naturalWidth, contentHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  return (
    <KonvaImage
      x={16 + (contentWidth - width) / 2}
      y={74 + (contentHeight - height) / 2}
      width={width}
      height={height}
      image={image}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

export const sequenceViewerTemplate: CanvasTemplateStrategy = {
  id: "sequence-viewer",
  label: "序列帧预览",
  supportedArtifactTypes: ["sequence"],
  renderContent: ({ element }) => {
    const props = element.props || {};
    const frames = readFrames(props.frames);
    const frameCount = readNumber(props.frameCount, frames.length);
    const fps = readNumber(props.fps, 12);
    const title = element.title || readText(props.label, "透明序列");
    const contentWidth = Math.max(24, element.width - 32);
    const contentHeight = Math.max(24, element.height - 32);

    return (
      <>
        <Rect
          x={16}
          y={16}
          width={contentWidth}
          height={contentHeight}
          fill="rgba(255,255,255,0.035)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          cornerRadius={8}
          listening={false}
        />
        <Text
          x={32}
          y={34}
          width={Math.max(24, element.width - 64)}
          text={title}
          fill="#f8fafc"
          fontSize={17}
          fontStyle="700"
          ellipsis
          wrap="none"
          listening={false}
        />
        <Text
          x={32}
          y={66}
          width={Math.max(24, element.width - 64)}
          text={`${frameCount || "-"} 帧 · ${fps} FPS`}
          fill="rgba(255,255,255,0.58)"
          fontSize={13}
          fontStyle="600"
          listening={false}
        />
        <SequenceViewerContent element={element} />
        {frameCount === 0 && (
          <Text
            x={32}
            y={element.height / 2 - 10}
            width={Math.max(24, element.width - 64)}
            text="等待序列帧结果"
            align="center"
            fill="rgba(255,255,255,0.45)"
            fontSize={14}
            fontStyle="600"
            listening={false}
          />
        )}
      </>
    );
  },
};
