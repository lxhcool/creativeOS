import { memo, useEffect, useRef } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Circle, Group, Path, Rect, Text } from "react-konva";
import type { CanvasElement } from "@/entities/canvas/model/types";
import {
  getConnectorPathData,
  getInputPortPosition,
  getOutputPortPosition,
} from "../lib/geometry";
import type { CanvasDraftEdge } from "../model/types";
import { PORT_RADIUS } from "../model/constants";

export function CanvasConnectionHandle({
  element,
  onHover,
  onLeave,
  onStartConnection,
}: {
  element: CanvasElement;
  onHover: () => void;
  onLeave: () => void;
  onStartConnection: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void;
}) {
  const input = getInputPortPosition(element);
  const output = getOutputPortPosition(element);

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
  selected,
  onSelect,
  onDelete,
}: {
  source: CanvasElement;
  target: CanvasElement;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const sourcePort = getOutputPortPosition(source);
  const targetPort = getInputPortPosition(target);

  return (
    <FlowingConnector
      from={sourcePort}
      to={targetPort}
      opacity={selected ? 0.96 : 0.72}
      selected={selected}
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
    previous.selected === next.selected,
);

export function DraftEdgeNode({ edge }: { edge: CanvasDraftEdge }) {
  return (
    <FlowingConnector
      from={edge.from}
      to={edge.to}
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
  opacity,
  selected,
  animated = false,
  showEndpoints,
  onSelect,
  onDelete,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  opacity: number;
  selected: boolean;
  animated?: boolean;
  showEndpoints: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}) {
  const pathRef = useRef<Konva.Path>(null);
  const pathData = getConnectorPathData(from, to);
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
        stroke={selected ? "rgba(255,184,112,0.96)" : "rgba(76,166,235,0.72)"}
        strokeWidth={selected ? 2.4 : 1.8}
        dash={selected ? [14, 14] : [10, 14]}
        lineCap="round"
        lineJoin="round"
        shadowColor={selected ? "rgba(239,91,43,0.45)" : "rgba(47,136,210,0.34)"}
        shadowBlur={selected ? 12 : 8}
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
