import { useEffect, useState } from "react";
import type { CanvasElement } from "@/entities/canvas/model/types";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  NODE_PADDING,
  PORT_OFFSET,
} from "../model/constants";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getTextNodeSize(text: string, fontSize: number): {
  width: number;
  height: number;
} {
  const lines = text.split(/\r?\n/);
  const charWidth = fontSize * 0.72;
  const maxContentWidth = 560;
  const minWidth = DEFAULT_NODE_WIDTH;
  const contentPadding = NODE_PADDING * 2;
  const rawWidth =
    Math.max(...lines.map((line) => Math.max(1, Array.from(line).length))) *
    charWidth;
  const width = clamp(rawWidth + contentPadding, minWidth, maxContentWidth);
  const charsPerLine = Math.max(
    1,
    Math.floor((width - NODE_PADDING * 2) / charWidth),
  );
  const visualLineCount = lines.reduce(
    (count, line) =>
      count + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)),
    0,
  );

  return {
    width,
    height: Math.max(
      DEFAULT_NODE_HEIGHT,
      fontSize * 1.45 + NODE_PADDING * 2,
      visualLineCount * fontSize * 1.32 + NODE_PADDING * 2,
    ),
  };
}

export function useViewportSize() {
  const [size, setSize] = useState({ width: 1280, height: 720 });

  useEffect(() => {
    const update = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return size;
}

export function getOutputPortPosition(element: CanvasElement): { x: number; y: number } {
  return {
    x: element.x + element.width + PORT_OFFSET,
    y: element.y + element.height / 2,
  };
}

export function getInputPortPosition(element: CanvasElement): { x: number; y: number } {
  return {
    x: element.x - PORT_OFFSET,
    y: element.y + element.height / 2,
  };
}

export function isPointInsideElement(
  point: { x: number; y: number },
  element: CanvasElement,
): boolean {
  return (
    point.x >= element.x &&
    point.x <= element.x + element.width &&
    point.y >= element.y &&
    point.y <= element.y + element.height
  );
}

export function getConnectorPathData(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const sameDirection = deltaX >= 0;
  const bend = sameDirection
    ? clamp(Math.abs(deltaX) * 0.45, 96, 260)
    : clamp(Math.abs(deltaX) * 0.32 + Math.abs(deltaY) * 0.18, 120, 300);
  const sourceControlX = from.x + bend;
  const targetControlX = sameDirection ? to.x - bend : to.x - bend;

  return [
    `M ${from.x} ${from.y}`,
    `C ${sourceControlX} ${from.y}`,
    `${targetControlX} ${to.y}`,
    `${to.x} ${to.y}`,
  ].join(" ");
}
