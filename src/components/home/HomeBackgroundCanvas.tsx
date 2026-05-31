"use client";

import { useEffect, useRef } from "react";

function resizeCanvas(canvas: HTMLCanvasElement) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  return { width, height };
}

export function HomeBackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frameId = 0;
    let lastDraw = 0;
    let size = resizeCanvas(canvas);

    const handleResize = () => {
      size = resizeCanvas(canvas);
    };

    const draw = (time: number) => {
      if (time - lastDraw < 42) {
        frameId = window.requestAnimationFrame(draw);
        return;
      }

      lastDraw = time;
      const seconds = time * 0.00022;
      const { width, height } = size;

      context.clearRect(0, 0, width, height);

      const base = context.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, "#02070b");
      base.addColorStop(0.42, "#081523");
      base.addColorStop(1, "#050506");
      context.fillStyle = base;
      context.fillRect(0, 0, width, height);

      const warm = context.createRadialGradient(
        width * (0.62 + Math.sin(seconds * 1.3) * 0.04),
        height * (0.28 + Math.cos(seconds * 0.9) * 0.06),
        0,
        width * 0.62,
        height * 0.3,
        width * 0.55,
      );
      warm.addColorStop(0, "rgba(239, 91, 43, 0.42)");
      warm.addColorStop(0.42, "rgba(190, 58, 34, 0.2)");
      warm.addColorStop(1, "rgba(239, 91, 43, 0)");
      context.fillStyle = warm;
      context.fillRect(0, 0, width, height);

      const cool = context.createRadialGradient(
        width * (0.22 + Math.cos(seconds) * 0.05),
        height * (0.72 + Math.sin(seconds * 1.2) * 0.05),
        0,
        width * 0.2,
        height * 0.74,
        width * 0.46,
      );
      cool.addColorStop(0, "rgba(47, 136, 210, 0.42)");
      cool.addColorStop(0.48, "rgba(15, 80, 136, 0.2)");
      cool.addColorStop(1, "rgba(47, 136, 210, 0)");
      context.fillStyle = cool;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalAlpha = 0.28;
      context.strokeStyle = "rgba(178, 206, 219, 0.22)";
      context.lineWidth = 1;

      const lineGap = 20;
      const amplitude = Math.max(14, Math.min(width, height) * 0.045);
      for (let y = -80; y < height + 100; y += lineGap) {
        context.beginPath();
        for (let x = -40; x < width + 60; x += 18) {
          const waveA = Math.sin(x * 0.008 + y * 0.014 + seconds * 4.2);
          const waveB = Math.cos(x * 0.018 - y * 0.009 - seconds * 2.6);
          const falloff = 0.65 + Math.sin((x / width) * Math.PI) * 0.35;
          const offset = (waveA + waveB * 0.7) * amplitude * falloff;
          const nextY = y + offset;

          if (x === -40) {
            context.moveTo(x, nextY);
          } else {
            context.lineTo(x, nextY);
          }
        }
        context.stroke();
      }
      context.restore();

      context.fillStyle = "rgba(0, 0, 0, 0.24)";
      context.fillRect(0, 0, width, height);

      frameId = window.requestAnimationFrame(draw);
    };

    window.addEventListener("resize", handleResize);
    frameId = window.requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-screen w-screen"
    />
  );
}
