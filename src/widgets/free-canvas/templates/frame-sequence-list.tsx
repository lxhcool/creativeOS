import { Rect, Text } from "react-konva";
import type { SpriteFrame } from "@/features/sprite-video-lab/types";
import type { CanvasTemplateStrategy } from "./types";

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readFrames(value: unknown): SpriteFrame[] {
  if (!Array.isArray(value)) return [];
  return value.filter((frame): frame is SpriteFrame => (
    Boolean(frame) &&
    typeof frame === "object" &&
    typeof (frame as SpriteFrame).url === "string"
  ));
}

export const frameSequenceListTemplate: CanvasTemplateStrategy = {
  id: "frame-sequence-list",
  label: "帧序列列表",
  supportedArtifactTypes: ["sequence"],
  renderContent: ({ element }) => {
    const props = element.props || {};
    const frames = readFrames(props.frames);
    const frameCount = readNumber(props.frameCount, frames.length);

    return (
      <>
        <Rect
          x={16}
          y={16}
          width={Math.max(24, element.width - 32)}
          height={Math.max(24, element.height - 32)}
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
          text={element.title || "帧序列"}
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
          text={`${frameCount || "-"} 帧 · 可选择单帧进行 AI 修图`}
          fill="rgba(255,255,255,0.58)"
          fontSize={13}
          fontStyle="600"
          listening={false}
        />
      </>
    );
  },
};
