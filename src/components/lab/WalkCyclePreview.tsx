"use client";

import { useEffect, useRef } from "react";
import {
  sampleWalkCycle,
  type Point,
} from "@/app/lab/walk-cycle/walk-cycle-data";

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 320;
const GROUND_Y = 285;

function drawGround(context: CanvasRenderingContext2D) {
  context.save();
  context.strokeStyle = "rgba(148, 163, 184, 0.28)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(36, GROUND_Y);
  context.lineTo(CANVAS_WIDTH - 36, GROUND_Y);
  context.stroke();

  context.lineWidth = 1;
  context.strokeStyle = "rgba(148, 163, 184, 0.12)";
  for (let x = 44; x < CANVAS_WIDTH - 44; x += 22) {
    context.beginPath();
    context.moveTo(x, GROUND_Y - 6);
    context.lineTo(x + 6, GROUND_Y);
    context.stroke();
  }
  context.restore();
}

function drawSegment(
  context: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  width: number,
) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function drawJoint(context: CanvasRenderingContext2D, point: Point, radius = 4) {
  context.save();
  context.fillStyle = "rgba(226, 246, 255, 0.95)";
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawWalkFrame(context: CanvasRenderingContext2D, elapsedMs: number) {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const gradient = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#07111d");
  gradient.addColorStop(1, "#030712");
  context.fillStyle = gradient;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  drawGround(context);

  const sample = sampleWalkCycle(elapsedMs);
  const frame = sample.frame;

  const shadowWidth = 42 + Math.cos(sample.phase * Math.PI * 4) * 3;
  context.save();
  context.fillStyle = "rgba(15, 23, 42, 0.52)";
  context.beginPath();
  context.ellipse(frame.pelvis.x + 4, GROUND_Y + 6, shadowWidth, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  drawSegment(context, frame.rightShoulder, frame.rightElbow, "rgba(94, 234, 212, 0.45)", 8);
  drawSegment(context, frame.rightElbow, frame.rightHand, "rgba(94, 234, 212, 0.45)", 8);
  drawSegment(context, frame.rightHip, frame.rightKnee, "rgba(94, 234, 212, 0.45)", 8);
  drawSegment(context, frame.rightKnee, frame.rightFoot, "rgba(94, 234, 212, 0.45)", 8);

  drawSegment(context, frame.neck, frame.pelvis, "#cbd5f5", 10);
  drawSegment(context, frame.leftShoulder, frame.rightShoulder, "#cbd5f5", 8);
  drawSegment(context, frame.leftHip, frame.rightHip, "#cbd5f5", 8);

  drawSegment(context, frame.leftHip, frame.leftKnee, "#5eead4", 9);
  drawSegment(context, frame.leftKnee, frame.leftFoot, "#5eead4", 9);
  drawSegment(context, { x: frame.leftFoot.x - 16, y: frame.leftFoot.y }, frame.leftFoot, "#5eead4", 9);
  drawSegment(context, frame.rightFoot, { x: frame.rightFoot.x - 16, y: frame.rightFoot.y }, "rgba(94, 234, 212, 0.45)", 8);
  drawSegment(context, frame.leftShoulder, frame.leftElbow, "#5eead4", 8);
  drawSegment(context, frame.leftElbow, frame.leftHand, "#5eead4", 8);

  context.save();
  context.fillStyle = "#e2e8f0";
  context.beginPath();
  context.arc(
    frame.headCenter.x,
    frame.headCenter.y,
    43,
    0,
    Math.PI * 2,
  );
  context.fill();

  context.strokeStyle = "rgba(8, 15, 28, 0.32)";
  context.lineWidth = 2;
  context.stroke();
  context.restore();

  drawJoint(context, frame.neck, 5);
  drawJoint(context, frame.leftShoulder);
  drawJoint(context, frame.leftElbow, 3.5);
  drawJoint(context, frame.leftHand, 4);
  drawJoint(context, frame.rightElbow, 3.5);
  drawJoint(context, frame.pelvis, 5);
  drawJoint(context, frame.leftKnee, 4);
  drawJoint(context, frame.rightKnee, 4);
  drawJoint(context, frame.leftFoot, 4);
  drawJoint(context, frame.rightFoot, 4);

  context.save();
  context.fillStyle = "rgba(226, 232, 240, 0.72)";
  context.font = "12px monospace";
  context.fillText("walk cycle", 18, 24);
  context.fillText(`loop ${(sample.cycleDurationMs / 1000).toFixed(2)}s`, 18, 42);
  context.restore();
}

export function WalkCyclePreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || CANVAS_WIDTH;
      const height = canvas.clientHeight || CANVAS_HEIGHT;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    let frameId = 0;
    let startTime = performance.now();

    const render = (now: number) => {
      const elapsedMs = now - startTime;
      drawWalkFrame(context, elapsedMs);
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      startTime = 0;
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30 shadow-2xl shadow-black/30">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block h-auto w-full max-w-[420px]"
      />
    </div>
  );
}
