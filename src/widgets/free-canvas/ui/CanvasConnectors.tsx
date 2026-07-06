import { memo, useEffect, useRef } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Circle, Group, Path, Rect, Text } from "react-konva";
import type { CanvasElement } from "@/entities/canvas/model/types";
import type { CanvasWorkflowGroup } from "@/features/canvas-workflows";
import {
  getConnectorPathData,
  getInputPortPosition,
  getOutputPortPosition,
  type CanvasFlowDirection,
} from "../lib/geometry";
import type { CanvasDraftEdge } from "../model/types";
import { PORT_RADIUS } from "../model/constants";

export function CanvasConnectionHandle({
  element,
  direction = "horizontal",
  onHover,
  onLeave,
  onStartConnection,
}: {
  element: CanvasElement;
  direction?: CanvasFlowDirection;
  onHover: () => void;
  onLeave: () => void;
  onStartConnection: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void;
}) {
  const input = getInputPortPosition(element, direction);
  const output = getOutputPortPosition(element, direction);

  return (
    <Group listening onMouseEnter={onHover} onMouseLeave={onLeave}>
      <Circle
        x={input.x}
        y={input.y}
        radius={PORT_RADIUS}
        fill="rgba(255,255,255,0.96)"
        stroke="rgba(0,0,0,0.3)"
        strokeWidth={1}
        listening={false}
      />
      <Circle
        x={output.x}
        y={output.y}
        radius={16}
        fill="rgba(255,255,255,0.001)"
        onMouseDown={onStartConnection}
        onTouchStart={onStartConnection}
        draggable={false}
      />
      <Circle
        x={output.x}
        y={output.y}
        radius={PORT_RADIUS}
        fill="rgba(255,255,255,0.96)"
        stroke="rgba(0,0,0,0.3)"
        strokeWidth={1}
        onMouseDown={onStartConnection}
        onTouchStart={onStartConnection}
        draggable={false}
      />
    </Group>
  );
}

function CanvasEdgeNode({
  source,
  target,
  groups = [],
  direction = "horizontal",
  selected,
  onSelect,
  onDelete,
}: {
  source: CanvasElement;
  target: CanvasElement;
  groups?: CanvasWorkflowGroup[];
  direction?: CanvasFlowDirection;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const sourceGroup = groups.find((group) => group.elementIds.includes(source.id));
  const targetGroup = groups.find((group) => group.elementIds.includes(target.id));
  const rawSourcePort = getOutputPortPosition(source, direction);
  const rawTargetPort = getInputPortPosition(target, direction);
  const sourcePort = sourceGroup
    ? getGroupOutputPortPosition(sourceGroup, direction, rawTargetPort)
    : rawSourcePort;
  const targetPort = targetGroup
    ? getGroupInputPortPosition(targetGroup, direction, rawSourcePort)
    : rawTargetPort;

  return (
    <FlowingConnector
      from={sourcePort}
      to={targetPort}
      opacity={selected ? 0.96 : 0.72}
      selected={selected}
      direction={direction}
      animated
      showEndpoints
      onSelect={onSelect}
      onDelete={onDelete}
    />
  );
}

export const MemoCanvasEdgeNode = memo(
  CanvasEdgeNode,
  (previous, next) =>
    previous.source === next.source &&
    previous.target === next.target &&
    previous.groups === next.groups &&
    previous.direction === next.direction &&
    previous.selected === next.selected,
);

function getGroupOutputPortPosition(
  group: CanvasWorkflowGroup,
  direction: CanvasFlowDirection,
  anchor?: { x: number; y: number },
): { x: number; y: number } {
  if (direction === "vertical") {
    return {
      x: clampToRange(anchor?.x ?? group.x + group.width / 2, group.x, group.x + group.width),
      y: group.y + group.height + 10,
    };
  }

  return {
    x: group.x + group.width + 10,
    y: clampToRange(anchor?.y ?? group.y + group.height / 2, group.y, group.y + group.height),
  };
}

function getGroupInputPortPosition(
  group: CanvasWorkflowGroup,
  direction: CanvasFlowDirection,
  anchor?: { x: number; y: number },
): { x: number; y: number } {
  if (direction === "vertical") {
    return {
      x: clampToRange(anchor?.x ?? group.x + group.width / 2, group.x, group.x + group.width),
      y: group.y - 10,
    };
  }

  return {
    x: group.x - 10,
    y: clampToRange(anchor?.y ?? group.y + group.height / 2, group.y, group.y + group.height),
  };
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function DraftEdgeNode({
  edge,
  direction = "horizontal",
}: {
  edge: CanvasDraftEdge;
  direction?: CanvasFlowDirection;
}) {
  return (
    <FlowingConnector
      from={edge.from}
      to={edge.to}
      direction={direction}
      opacity={0.9}
      selected={false}
      animated
      showEndpoints
    />
  );
}

function FlowingConnector({
  from,
  to,
  direction = "horizontal",
  opacity,
  selected,
  animated = false,
  showEndpoints,
  onSelect,
  onDelete,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  direction?: CanvasFlowDirection;
  opacity: number;
  selected: boolean;
  animated?: boolean;
  showEndpoints: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}) {
  const pathRef = useRef<Konva.Path>(null);
  const pathData = getConnectorPathData(from, to, direction);
  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
  const handleSelect = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
    onSelect?.();
  };
  const handleDelete = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
    onDelete?.();
  };

  useEffect(() => {
    if (!animated) return;
    const path = pathRef.current;
    const layer = path?.getLayer();
    if (!path || !layer) return;

    const animation = new Konva.Animation((frame) => {
      path.dashOffset(-((frame?.time || 0) / 28));
    }, layer);
    animation.start();

    return () => {
      animation.stop();
    };
  }, [animated]);

  return (
    <Group listening={Boolean(onSelect)}>
      {onSelect && (
        <Path
          data={pathData}
          stroke="rgba(255,255,255,0.001)"
          strokeWidth={16}
          lineCap="round"
          lineJoin="round"
          onMouseDown={handleSelect}
          onTouchStart={handleSelect}
        />
      )}
      <Path
        data={pathData}
        stroke={selected ? "rgba(239,91,43,0.88)" : `rgba(255,255,255,${opacity})`}
        strokeWidth={selected ? 2.7 : 1.9}
        lineCap="round"
        lineJoin="round"
        shadowColor={selected ? "rgba(239,91,43,0.42)" : "rgba(47,136,210,0.18)"}
        shadowBlur={selected ? 10 : 4}
        listening={false}
      />
      <Path
        ref={pathRef}
        data={pathData}
        stroke={selected ? "rgba(255,214,170,0.92)" : "rgba(214,224,226,0.46)"}
        strokeWidth={selected ? 2.3 : 1.6}
        dash={selected ? [14, 16] : [10, 18]}
        lineCap="round"
        lineJoin="round"
        shadowColor={selected ? "rgba(239,91,43,0.34)" : "rgba(178,206,219,0.2)"}
        shadowBlur={selected ? 10 : 6}
        listening={false}
      />
      {selected && onDelete && (
        <Group
          x={midpoint.x - 13}
          y={midpoint.y - 13}
          onMouseDown={handleDelete}
          onTouchStart={handleDelete}
        >
          <Rect
            width={26}
            height={26}
            fill="rgba(8,10,12,0.82)"
            stroke="rgba(250,204,21,0.48)"
            strokeWidth={1}
            cornerRadius={8}
            shadowColor="rgba(0,0,0,0.42)"
            shadowBlur={12}
          />
          <Text
            width={26}
            height={26}
            text="×"
            align="center"
            verticalAlign="middle"
            fill="rgba(255,255,255,0.86)"
            fontSize={17}
            fontStyle="700"
            listening={false}
          />
        </Group>
      )}
      {showEndpoints && (
        <>
          <Circle
            x={from.x}
            y={from.y}
            radius={PORT_RADIUS}
            fill="rgba(255,255,255,0.96)"
            listening={false}
          />
          <Circle
            x={to.x}
            y={to.y}
            radius={PORT_RADIUS}
            fill="rgba(255,255,255,0.96)"
            listening={false}
          />
        </>
      )}
    </Group>
  );
}
