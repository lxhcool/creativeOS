import type {
  CanvasElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getCanvasNodeEditorTitle(element: CanvasElement): string {
  if (element.kind === "image") return "图片";
  if (element.kind === "video") return "视频";
  if (element.kind === "audio") return "音乐";
  if (element.kind === "text") return "文本";
  if (element.kind === "template") return element.title || "模板";
  if (element.kind === "processor") return element.title;
  return "节点";
}

export function getCanvasNodeEditorPlaceholder(element: CanvasElement): string {
  if (element.kind === "image") return "描述你想生成的图片内容";
  if (element.kind === "video") return "描述你想生成的视频画面、动作和风格";
  if (element.kind === "audio") return "描述你想生成的音乐氛围、节奏或用途";
  if (element.kind === "text") return "描述你想对上面的内容做什么";
  if (element.kind === "template") return "描述你想对这个模板资产做什么";
  if (element.kind === "processor") return "调整处理参数后重新生成";
  return "描述你想生成的内容";
}

export function getCanvasNodeEditorFrame(
  element: CanvasElement,
  viewport: CanvasViewport,
  screenSize: { width: number; height: number },
): { left: number; top: number; width: number } {
  const nodeScreenWidth = element.width * viewport.scale;
  const nodeScreenHeight = element.height * viewport.scale;
  const panelWidth = element.kind === "processor"
    ? clamp(Math.max(nodeScreenWidth, 820), 720, 920)
    : clamp(nodeScreenWidth, 420, 720);
  const nodeLeft = viewport.x + element.x * viewport.scale;
  const nodeTop = viewport.y + element.y * viewport.scale;
  const desiredLeft = nodeLeft + (nodeScreenWidth - panelWidth) / 2;
  const panelHeight = element.kind === "processor" ? 620 : 230;
  const belowTop = nodeTop + nodeScreenHeight + 16;
  const aboveTop = nodeTop - panelHeight - 16;
  const top =
    belowTop + panelHeight > screenSize.height - 20
      ? Math.max(20, aboveTop)
      : belowTop;

  return {
    left: clamp(desiredLeft, 20, Math.max(20, screenSize.width - panelWidth - 20)),
    top,
    width: panelWidth,
  };
}
