import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Rect,
  Text,
} from "react-konva";
import { getCanvasTextRole, getCanvasTextRoleConfig } from "@/entities/canvas/lib/textRoles";
import type {
  CanvasElement,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasProcessorElement,
  CanvasShapeElement,
  CanvasTemplateElement,
  CanvasTextElement,
  CanvasTextRole,
} from "@/entities/canvas/model/types";
import { renderCanvasTemplateContent } from "../templates/registry";
import { formatMediaTime, useHtmlAudio, useHtmlImage, useHtmlVideo } from "../lib/media";
import { clamp } from "../lib/geometry";
import {
  NODE_PADDING,
  NODE_RADIUS,
  VIDEO_CONTROLS_HIDE_DELAY,
} from "../model/constants";

type CanvasNodeCommonProps = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  draggable: boolean;
  onClick?: () => void;
  onTap?: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onContextMenu?: (event: KonvaEventObject<MouseEvent>) => void;
  onDragStart: () => void;
  onDragMove: (event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
};

type CanvasNodeRendererProps<TElement extends CanvasElement = CanvasElement> = {
  element: TElement;
  selected: boolean;
  dragging: boolean;
  commonProps: CanvasNodeCommonProps;
  onUploadImage: (element: CanvasImageElement) => void;
  onUploadVideo: (element: CanvasMediaElement) => void;
  onUploadAudio: (element: CanvasMediaElement) => void;
  onPreview?: () => void;
};

type CanvasNodeBadge = {
  title: string;
  color: string;
};

type CanvasElementNodeProps = {
  element: CanvasElement;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
  onContextMenu: (event: KonvaEventObject<MouseEvent>) => void;
  onDragStart: () => void;
  onPreviewChange: (updates: Partial<CanvasElement>) => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  onUploadImage: (element: CanvasImageElement) => void;
  onUploadVideo: (element: CanvasMediaElement) => void;
  onUploadAudio: (element: CanvasMediaElement) => void;
  onPreview: (element: CanvasTextElement) => void;
};

const TEXT_ROLE_BADGE_COLORS: Record<CanvasTextRole, string> = {
  general: "#e5e7eb",
  article: "#34d399",
  novel_setup: "#fbbf24",
  novel_core: "#f97316",
  novel_world: "#22d3ee",
  novel_outline: "#a78bfa",
  novel_volume_outline: "#c084fc",
  novel_chapter_outline: "#f472b6",
  novel_scene_outline: "#f0abfc",
  novel_chapter: "#fb7185",
  novel_bible: "#e2e8f0",
  novel_style_guide: "#86efac",
  character_cast: "#fcd34d",
  character: "#f59e0b",
  character_relation: "#fb923c",
  character_arc: "#2dd4bf",
  scene: "#a3e635",
  script: "#c084fc",
  storyboard: "#4ade80",
  prompt: "#facc15",
};

export function getTextNodeBadge(element: CanvasTextElement): CanvasNodeBadge {
  const role = getCanvasTextRole(element.textRole);
  const config = getCanvasTextRoleConfig(role);

  return {
    title: element.meta?.title || config.title,
    color: TEXT_ROLE_BADGE_COLORS[role],
  };
}

function CanvasElementNode({
  element,
  selected,
  dragging,
  onSelect,
  onHover,
  onLeave,
  onContextMenu,
  onDragStart,
  onPreviewChange,
  onChange,
  onUploadImage,
  onUploadVideo,
  onUploadAudio,
  onPreview,
}: CanvasElementNodeProps) {
  const dragPreviewFrameRef = useRef<number | null>(null);
  const dragPreviewUpdatesRef = useRef<Partial<CanvasElement> | null>(null);

  useEffect(() => {
    return () => {
      if (dragPreviewFrameRef.current !== null) {
        cancelAnimationFrame(dragPreviewFrameRef.current);
      }
    };
  }, []);

  const schedulePreviewChange = useCallback(
    (updates: Partial<CanvasElement>) => {
      dragPreviewUpdatesRef.current = updates;
      if (dragPreviewFrameRef.current !== null) return;

      dragPreviewFrameRef.current = requestAnimationFrame(() => {
        dragPreviewFrameRef.current = null;
        const pendingUpdates = dragPreviewUpdatesRef.current;
        dragPreviewUpdatesRef.current = null;
        if (pendingUpdates) {
          onPreviewChange(pendingUpdates);
        }
      });
    },
    [onPreviewChange],
  );

  const commonProps: CanvasNodeCommonProps = {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    draggable: element.kind === "text" ? !element.meta?.workflowLocked : true,
    onClick: element.status === "generating" ? undefined : onSelect,
    onTap: element.status === "generating" ? undefined : onSelect,
    onMouseEnter: onHover,
    onMouseLeave: onLeave,
    onContextMenu:
      element.status === "generating"
        ? undefined
        : onContextMenu,
    onDragStart,
    onDragMove: (event: KonvaEventObject<DragEvent>) => {
      schedulePreviewChange({
        x: event.target.x(),
        y: event.target.y(),
      });
    },
    onDragEnd: (event: KonvaEventObject<DragEvent>) => {
      onChange({
        x: event.target.x(),
        y: event.target.y(),
      });
    },
  };

  const rendererProps = {
    selected,
    dragging,
    commonProps,
    onUploadImage,
    onUploadVideo,
    onUploadAudio,
  };

  switch (element.kind) {
    case "text":
      return (
        <CanvasTextNode
          {...rendererProps}
          element={element}
          onPreview={() => onPreview(element)}
        />
      );
    case "shape":
      return <CanvasShapeNode {...rendererProps} element={element} />;
    case "image":
      return <CanvasImageNode {...rendererProps} element={element} />;
    case "video":
    case "audio":
      return <CanvasMediaNode {...rendererProps} element={element} />;
    case "template":
      return <CanvasTemplateNode {...rendererProps} element={element} />;
    case "processor":
      return <CanvasProcessorNode {...rendererProps} element={element} />;
    default:
      return null;
  }
}

export const MemoCanvasElementNode = memo(
  CanvasElementNode,
  (previous, next) =>
    previous.element === next.element &&
    previous.selected === next.selected &&
    previous.dragging === next.dragging,
);

function CanvasTextNode({
  element,
  selected,
  dragging,
  commonProps,
  onPreview,
}: CanvasNodeRendererProps<CanvasTextElement>) {
  const badge = getTextNodeBadge(element);
  const showGeneratingPreview =
    element.status === "generating" &&
    element.text.trim().length === 0 &&
    Boolean(element.meta?.sourceNodeId);

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
      badge={badge}
      onDblClick={onPreview}
      onDblTap={onPreview}
    >
      {showGeneratingPreview ? (
        <CanvasTextGeneratingPreview
          width={element.width}
          height={element.height}
          title={badge.title}
        />
      ) : element.status === "failed" ? (
        <Text
          x={NODE_PADDING + 8}
          y={NODE_PADDING + 18}
          width={Math.max(24, element.width - NODE_PADDING * 2 - 16)}
          text={element.error || "生成失败"}
          fill="#fecaca"
          fontSize={14}
          lineHeight={1.5}
          fontStyle="600"
          align="left"
          verticalAlign="top"
          wrap="char"
          ellipsis
        />
      ) : (!selected || element.meta?.workflowLocked) && (
        <Group
          clipX={NODE_PADDING + 8}
          clipY={NODE_PADDING + 8}
          clipWidth={Math.max(24, element.width - NODE_PADDING * 2 - 16)}
          clipHeight={Math.max(24, element.height - NODE_PADDING * 2 - 16)}
        >
          <Text
            x={NODE_PADDING + 8}
            y={NODE_PADDING + 8}
            width={Math.max(24, element.width - NODE_PADDING * 2 - 16)}
            height={Math.max(24, element.height - NODE_PADDING * 2 - 16)}
            text={element.text}
            fill="#f8fafc"
            fontSize={14}
            lineHeight={1.45}
            fontStyle="400"
            align="left"
            verticalAlign="top"
            wrap="char"
            ellipsis
          />
        </Group>
      )}
    </CanvasNodeShell>
  );
}

function CanvasTextGeneratingPreview({
  width,
  height,
  title,
}: {
  width: number;
  height: number;
  title: string;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((current) => (current + 1) % 4);
    }, 420);

    return () => window.clearInterval(timer);
  }, []);

  const dots = ".".repeat(tick || 1);
  const contentWidth = Math.max(24, width - NODE_PADDING * 2 - 16);
  const lineWidths = [0.82, 0.94, 0.68, 0.88, 0.52];

  return (
    <Group>
      <Text
        x={NODE_PADDING + 8}
        y={NODE_PADDING + 14}
        width={contentWidth}
        text={`${title}生成中${dots}`}
        fill="rgba(255,255,255,0.76)"
        fontSize={14}
        fontStyle="600"
        wrap="none"
        ellipsis
      />
      {lineWidths.map((ratio, index) => {
        const active = (tick + index) % 4 === 0;

        return (
          <Rect
            key={`${ratio}_${index}`}
            x={NODE_PADDING + 8}
            y={NODE_PADDING + 52 + index * 25}
            width={contentWidth * ratio}
            height={10}
            fill={active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}
            cornerRadius={5}
          />
        );
      })}
      <Text
        x={NODE_PADDING + 8}
        y={Math.max(NODE_PADDING + 178, height - NODE_PADDING - 42)}
        width={contentWidth}
        text="创作组正在处理，请稍等"
        fill="rgba(255,255,255,0.38)"
        fontSize={12}
        wrap="none"
        ellipsis
      />
    </Group>
  );
}

function CanvasShapeNode({
  element,
  selected,
  dragging,
  commonProps,
}: CanvasNodeRendererProps<CanvasShapeElement>) {
  const contentSize = Math.max(
    24,
    Math.min(element.width, element.height) - NODE_PADDING * 2,
  );

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      <Rect
        x={(element.width - contentSize) / 2}
        y={(element.height - contentSize) / 2}
        width={contentSize}
        height={contentSize}
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={1}
        cornerRadius={element.shape === "circle" ? contentSize / 2 : 12}
      />
    </CanvasNodeShell>
  );
}

function CanvasMediaNode({
  element,
  selected,
  dragging,
  commonProps,
  onUploadVideo,
  onUploadAudio,
}: CanvasNodeRendererProps<CanvasMediaElement>) {
  const isAudio = element.kind === "audio";
  const videoState = useHtmlVideo(element.kind === "video" ? element.src : undefined);
  const videoImageRef = useRef<Konva.Image>(null);
  const videoControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoControlsVisible, setVideoControlsVisible] = useState(true);
  const hasUploadButton = !element.src;
  const titleY = hasUploadButton ? element.height / 2 - 44 : element.height / 2 - 14;

  const clearVideoControlsTimer = useCallback(() => {
    if (videoControlsTimerRef.current) {
      clearTimeout(videoControlsTimerRef.current);
      videoControlsTimerRef.current = null;
    }
  }, []);

  const revealVideoControls = useCallback(() => {
    if (element.kind !== "video") return;
    setVideoControlsVisible(true);
    clearVideoControlsTimer();

    if (videoState.isPlaying) {
      videoControlsTimerRef.current = setTimeout(() => {
        setVideoControlsVisible(false);
        videoControlsTimerRef.current = null;
      }, VIDEO_CONTROLS_HIDE_DELAY);
    }
  }, [clearVideoControlsTimer, element.kind, videoState.isPlaying]);

  useEffect(() => {
    if (!videoState.isPlaying) {
      clearVideoControlsTimer();
      setVideoControlsVisible(true);
      return;
    }

    revealVideoControls();
    return clearVideoControlsTimer;
  }, [clearVideoControlsTimer, revealVideoControls, videoState.isPlaying]);

  useEffect(() => {
    if (!videoState.video) return;
    const layer = videoImageRef.current?.getLayer();
    if (!layer) return;

    layer.batchDraw();
    if (!videoState.isPlaying) return;

    const animation = new Konva.Animation(() => {
      layer.batchDraw();
    }, layer);
    animation.start();

    return () => {
      animation.stop();
    };
  }, [videoState.coverReady, videoState.isPlaying, videoState.video]);

  if (element.kind === "video" && videoState.video && videoState.coverReady) {
    return (
      <CanvasNodeShell
        commonProps={commonProps}
        width={element.width}
        height={element.height}
        selected={selected}
        dragging={dragging}
        onMouseMove={revealVideoControls}
        onMouseEnter={revealVideoControls}
      >
        <KonvaImage
          ref={videoImageRef}
          x={NODE_PADDING}
          y={NODE_PADDING}
          width={Math.max(24, element.width - NODE_PADDING * 2)}
          height={Math.max(24, element.height - NODE_PADDING * 2)}
          image={videoState.video}
          cornerRadius={NODE_RADIUS}
          listening={false}
          perfectDrawEnabled={false}
        />
        {!videoState.isPlaying && (
          <CanvasCenterPlayButton
            x={element.width / 2 - 28}
            y={element.height / 2 - 28}
            onClick={videoState.toggle}
          />
        )}
        {videoState.isPlaying && videoControlsVisible && (
          <CanvasMediaControlBar
            x={NODE_PADDING + 10}
            y={element.height - NODE_PADDING - 58}
            width={Math.max(260, element.width - NODE_PADDING * 2 - 20)}
            currentTime={videoState.currentTime}
            duration={videoState.duration}
            isPlaying={videoState.isPlaying}
            muted={videoState.muted}
            progress={videoState.progress}
            onSeek={videoState.seekToRatio}
            onToggleMute={videoState.toggleMute}
            onTogglePlay={videoState.toggle}
          />
        )}
      </CanvasNodeShell>
    );
  }

  if (isAudio && element.src) {
    return (
      <CanvasNodeShell
        commonProps={commonProps}
        width={element.width}
        height={element.height}
        selected={selected}
        dragging={dragging}
      >
        <CanvasAudioPlayer element={element} />
      </CanvasNodeShell>
    );
  }

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      <Text
        x={NODE_PADDING}
        y={titleY}
        width={Math.max(24, element.width - NODE_PADDING * 2)}
        text={
          element.status === "generating"
            ? "生成中..."
            : element.status === "failed"
              ? element.error || "生成失败"
              : element.label
        }
        align="center"
        fill={element.status === "failed" ? "#fecaca" : "#f8fafc"}
        fontSize={18}
        fontStyle="600"
        ellipsis
        wrap="none"
      />
      {!isAudio && !element.src && element.status !== "generating" && (
        <CanvasUploadButton
          x={element.width / 2 - 68}
          y={element.height / 2}
          label="上传视频"
          onClick={() => onUploadVideo(element)}
        />
      )}
      {isAudio && !element.src && (
        <CanvasUploadButton
          x={element.width / 2 - 68}
          y={element.height / 2}
          label="上传音乐"
          onClick={() => onUploadAudio(element)}
        />
      )}
    </CanvasNodeShell>
  );
}

function CanvasAudioPlayer({ element }: { element: CanvasMediaElement }) {
  const audio = useHtmlAudio(element.src);
  const contentWidth = Math.max(24, element.width - NODE_PADDING * 2);
  const playerWidth = Math.max(300, Math.min(520, contentWidth - 40));
  const playerX = element.width / 2 - playerWidth / 2;
  const playerY = element.height / 2 - 28;

  return (
    <>
      <Text
        x={NODE_PADDING}
        y={playerY - 42}
        width={contentWidth}
        text={element.label}
        align="center"
        fill="#f8fafc"
        fontSize={16}
        fontStyle="600"
        ellipsis
        wrap="none"
      />
      <CanvasMediaControlBar
        x={playerX}
        y={playerY}
        width={playerWidth}
        currentTime={audio.currentTime}
        duration={audio.duration}
        isPlaying={audio.isPlaying}
        muted={audio.muted}
        progress={audio.progress}
        onSeek={audio.seekToRatio}
        onToggleMute={audio.toggleMute}
        onTogglePlay={audio.toggle}
      />
    </>
  );
}

function CanvasMediaControlBar({
  x,
  y,
  width,
  currentTime,
  duration,
  isPlaying,
  muted,
  progress,
  onSeek,
  onToggleMute,
  onTogglePlay,
}: {
  x: number;
  y: number;
  width: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  muted: boolean;
  progress: number;
  onSeek: (ratio: number) => void;
  onToggleMute: () => void;
  onTogglePlay: () => void;
}) {
  const height = 48;
  const playSize = 34;
  const trackX = 104;
  const volumeWidth = 34;
  const timeWidth = 42;
  const trackWidth = Math.max(48, width - trackX - timeWidth - volumeWidth - 26);
  const stop = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
  };
  const handleSeek = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    const absolutePosition = event.target.getAbsolutePosition();
    const absoluteScale = event.target.getAbsoluteScale();
    const ratio = (pointer.x - absolutePosition.x) / (trackWidth * absoluteScale.x);
    onSeek(ratio);
  };

  return (
    <Group
      x={x}
      y={y}
      onMouseDown={stop}
      onTouchStart={stop}
    >
      <Rect
        width={width}
        height={height}
        fill="rgba(8,12,10,0.42)"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth={1}
        cornerRadius={NODE_RADIUS}
        shadowColor="rgba(0,0,0,0.42)"
        shadowBlur={12}
        listening={false}
      />
      <Group
        x={8}
        y={7}
        onClick={(event) => {
          event.cancelBubble = true;
          onTogglePlay();
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          onTogglePlay();
        }}
      >
        <Rect
          width={playSize}
          height={playSize}
          fill="rgba(255,255,255,0.12)"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={1}
          cornerRadius={NODE_RADIUS}
        />
        <Text
          width={playSize}
          height={playSize}
          text={isPlaying ? "Ⅱ" : "▶"}
          align="center"
          verticalAlign="middle"
          fill="rgba(255,255,255,0.88)"
          fontSize={14}
          fontStyle="600"
          listening={false}
        />
      </Group>
      <Text
        x={50}
        y={16}
        width={46}
        text={formatMediaTime(currentTime)}
        align="left"
        fill="rgba(255,255,255,0.72)"
        fontSize={13}
        fontStyle="600"
        listening={false}
      />
      <Rect
        x={trackX}
        y={21}
        width={trackWidth}
        height={7}
        fill="rgba(255,255,255,0.14)"
        cornerRadius={4}
        listening={false}
      />
      <Rect
        x={trackX}
        y={21}
        width={trackWidth * clamp(progress, 0, 1)}
        height={7}
        fill="rgba(255,255,255,0.72)"
        cornerRadius={4}
        listening={false}
      />
      <Rect
        x={trackX}
        y={14}
        width={trackWidth}
        height={22}
        fill="rgba(255,255,255,0.001)"
        onClick={handleSeek}
        onTap={handleSeek}
      />
      <Text
        x={trackX + trackWidth + 10}
        y={16}
        width={timeWidth}
        text={formatMediaTime(duration)}
        align="left"
        fill="rgba(255,255,255,0.72)"
        fontSize={13}
        fontStyle="600"
        listening={false}
      />
      <Group
        x={width - 42}
        y={7}
        onClick={(event) => {
          event.cancelBubble = true;
          onToggleMute();
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          onToggleMute();
        }}
      >
        <Rect
          width={34}
          height={34}
          fill="rgba(255,255,255,0.08)"
          cornerRadius={NODE_RADIUS}
        />
        <Text
          width={34}
          height={34}
          text={muted ? "×" : "♪"}
          align="center"
          verticalAlign="middle"
          fill="rgba(255,255,255,0.76)"
          fontSize={16}
          fontStyle="600"
          listening={false}
        />
      </Group>
    </Group>
  );
}

function CanvasCenterPlayButton({
  x,
  y,
  onClick,
}: {
  x: number;
  y: number;
  onClick: () => void;
}) {
  const stop = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
  };

  return (
    <Group
      x={x}
      y={y}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={(event) => {
        event.cancelBubble = true;
        onClick();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onClick();
      }}
    >
      <Rect
        width={56}
        height={56}
        fill="rgba(0,0,0,0.42)"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth={1}
        cornerRadius={NODE_RADIUS}
        shadowColor="rgba(0,0,0,0.36)"
        shadowBlur={12}
      />
      <Text
        width={56}
        height={56}
        text="▶"
        align="center"
        verticalAlign="middle"
        fill="rgba(255,255,255,0.92)"
        fontSize={22}
        fontStyle="600"
        listening={false}
      />
    </Group>
  );
}

function CanvasImageNode({
  element,
  commonProps,
  selected,
  dragging,
  onUploadImage,
}: CanvasNodeRendererProps<CanvasImageElement>) {
  const image = useHtmlImage(element.src);

  if (image) {
    return (
      <CanvasNodeShell
        commonProps={commonProps}
        width={element.width}
        height={element.height}
        selected={selected}
        dragging={dragging}
      >
        <KonvaImage
          x={NODE_PADDING}
          y={NODE_PADDING}
          width={Math.max(24, element.width - NODE_PADDING * 2)}
          height={Math.max(24, element.height - NODE_PADDING * 2)}
          image={image}
          cornerRadius={NODE_RADIUS}
          listening={false}
          perfectDrawEnabled={false}
        />
      </CanvasNodeShell>
    );
  }

  const titleY = element.height / 2 - 44;

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      <Text
        x={NODE_PADDING}
        y={titleY}
        width={Math.max(24, element.width - NODE_PADDING * 2)}
        text={
          element.status === "generating"
            ? "生成中..."
            : element.status === "failed"
              ? element.error || "生成失败"
              : element.label || "图像素材"
        }
        align="center"
        fill={element.status === "failed" ? "#fecaca" : "#f8fafc"}
        fontSize={16}
        fontStyle="600"
        ellipsis
        wrap="none"
      />
      {element.status !== "generating" && (
        <CanvasUploadButton
          x={element.width / 2 - 68}
          y={element.height / 2}
          label="上传图片"
          onClick={() => onUploadImage(element)}
        />
      )}
    </CanvasNodeShell>
  );
}

function CanvasTemplateNode({
  element,
  selected,
  dragging,
  commonProps,
}: CanvasNodeRendererProps<CanvasTemplateElement>) {
  const content = renderCanvasTemplateContent(element);

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      {content || (
        <Text
          x={NODE_PADDING}
          y={element.height / 2 - 10}
          width={Math.max(24, element.width - NODE_PADDING * 2)}
          text={element.title || "未知模板"}
          align="center"
          fill="rgba(255,255,255,0.55)"
          fontSize={14}
          fontStyle="600"
          listening={false}
        />
      )}
    </CanvasNodeShell>
  );
}

function CanvasProcessorNode({
  element,
  selected,
  dragging,
  commonProps,
}: CanvasNodeRendererProps<CanvasProcessorElement>) {
  const statusText =
    element.status === "generating"
      ? "处理中"
      : element.status === "failed"
        ? "处理失败"
        : "可重新生成";
  const keepEvery = Number(element.config.keepEvery || 2);
  const matteMode = String(element.config.matteMode || "chroma");

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      <Text
        x={24}
        y={28}
        width={Math.max(24, element.width - 48)}
        text={element.title}
        fill="#f8fafc"
        fontSize={18}
        fontStyle="700"
        listening={false}
      />
      <Text
        x={24}
        y={64}
        width={Math.max(24, element.width - 48)}
        text={`${statusText} · ${matteMode} · 每 ${keepEvery} 帧`}
        fill={element.status === "failed" ? "#fecaca" : "rgba(255,255,255,0.58)"}
        fontSize={13}
        fontStyle="600"
        listening={false}
      />
      <Rect
        x={24}
        y={112}
        width={Math.max(24, element.width - 48)}
        height={88}
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
        cornerRadius={8}
        listening={false}
      />
      <Text
        x={40}
        y={142}
        width={Math.max(24, element.width - 80)}
        text={element.error || "选中节点可调整抠图参数并重新生成"}
        align="center"
        fill="rgba(255,255,255,0.42)"
        fontSize={13}
        fontStyle="600"
        listening={false}
      />
    </CanvasNodeShell>
  );
}

function CanvasUploadButton({
  x,
  y,
  label,
  onClick,
}: {
  x: number;
  y: number;
  label: string;
  onClick: () => void;
}) {
  const stop = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
  };

  return (
    <Group
      x={x}
      y={y}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={(event) => {
        event.cancelBubble = true;
        onClick();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onClick();
      }}
    >
      <Rect
        width={136}
        height={40}
        fill="rgba(255,255,255,0.1)"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth={1}
        cornerRadius={NODE_RADIUS}
      />
      <Text
        width={136}
        height={40}
        text={label}
        align="center"
        verticalAlign="middle"
        fill="rgba(255,255,255,0.84)"
        fontSize={13}
        fontStyle="600"
        listening={false}
      />
    </Group>
  );
}

function CanvasNodeShell({
  commonProps,
  width,
  height,
  selected,
  dragging,
  children,
  badge,
  onDblClick,
  onDblTap,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: {
  commonProps: Record<string, unknown>;
  width: number;
  height: number;
  selected: boolean;
  dragging: boolean;
  children: ReactNode;
  badge?: CanvasNodeBadge;
  onDblClick?: () => void;
  onDblTap?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseMove?: () => void;
}) {
  const commonMouseEnter = commonProps.onMouseEnter as
    | ((event: KonvaEventObject<MouseEvent>) => void)
    | undefined;
  const commonMouseLeave = commonProps.onMouseLeave as
    | ((event: KonvaEventObject<MouseEvent>) => void)
    | undefined;

  return (
    <Group
      {...commonProps}
      onDblClick={onDblClick}
      onDblTap={onDblTap}
      onMouseEnter={(event) => {
        commonMouseEnter?.(event);
        onMouseEnter?.();
      }}
      onMouseLeave={(event) => {
        commonMouseLeave?.(event);
        onMouseLeave?.();
      }}
      onMouseMove={() => onMouseMove?.()}
    >
      {badge && (
        <Group x={2} y={-24} listening={false}>
          <Circle
            x={5}
            y={10}
            radius={5}
            fill={badge.color}
            shadowColor={badge.color}
            shadowBlur={8}
            shadowOpacity={0.4}
          />
          <Text
            x={17}
            y={3}
            width={Math.max(80, width - 24)}
            text={badge.title}
            fill="rgba(255,255,255,0.74)"
            fontSize={12}
            fontStyle="600"
            wrap="none"
            ellipsis
            listening={false}
          />
        </Group>
      )}
      <Rect
        width={width}
        height={height}
        fill="#111214"
        stroke={selected ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.06)"}
        strokeWidth={selected ? 1.5 : 1}
        cornerRadius={NODE_RADIUS}
        shadowColor="rgba(0,0,0,0.45)"
        shadowBlur={selected && !dragging ? 16 : 0}
        shadowOffsetY={selected && !dragging ? 10 : 0}
        shadowOpacity={selected && !dragging ? 0.32 : 0}
      />
      {selected && (
        <Rect
          width={width}
          height={height}
          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
          fillRadialGradientEndRadius={Math.max(width, height) * 1.2}
          fillRadialGradientColorStops={[
            0,
            "rgba(255,255,255,0.04)",
            0.45,
            "rgba(255,255,255,0)",
            1,
            "rgba(255,255,255,0)",
          ]}
          cornerRadius={NODE_RADIUS}
          listening={false}
        />
      )}
      <Rect
        x={NODE_RADIUS}
        y={1}
        width={Math.max(0, width - NODE_RADIUS * 2)}
        height={1}
        fill="rgba(255,255,255,0.03)"
        listening={false}
      />
      {children}
    </Group>
  );
}
