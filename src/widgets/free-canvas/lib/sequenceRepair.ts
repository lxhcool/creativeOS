import { spriteAssetUrl } from "@/features/sprite-video-lab/api";

export const AI_REPAIR_PROMPT = [
  "You will receive reference images in this order:",
  "1. The original video frame, when available, which contains the complete character details but still has the background.",
  "2. The current algorithmic cutout, when available, which defines the target sprite position, scale, canvas size, and rough silhouette.",
  "",
  "Create an RGB repair candidate for sprite detail restoration.",
  "This output is NOT the final transparent sprite and does not need to contain a usable alpha channel.",
  "Use the original frame to restore lost character details, missing edge pixels, hair, clothing, accessories, texture, and correct colors.",
  "Use the cutout reference only to keep the same subject placement, scale, and silhouette intent.",
  "Repair green spill, black or white fringe, jagged edges, holes, dirty edge pixels, and damaged details caused by keying.",
  "This is repainting and detail restoration, not background removal and not a new character design.",
  "Do not invent a new pose, costume, weapon, face, hairstyle, proportions, lighting, or style.",
  "Do not output a checkerboard transparency preview or simulated transparent background.",
  "A plain neutral preview background is acceptable because alpha will be solved by a later compositing step.",
  "Keep the subject visually aligned with the cutout reference as much as the model allows.",
  "",
  "请生成一张 RGB 补绘候选图，用于修复 sprite 细节。",
  "这不是最终透明 sprite，不要求输出可用 alpha 通道。",
  "参考图顺序：第一张是原始视频帧，包含完整角色细节但有背景；第二张是当前算法抠图，定义目标位置、大小和大致轮廓。",
  "AI 的任务是根据原始帧补回被算法抠丢的角色细节、边缘像素、头发、衣服、配饰、纹理、颜色和脏边。",
  "当前抠图只作为位置、尺寸和轮廓参考，不要重新设计角色。",
  "修复绿幕残留、黑边、白边、锯齿、破洞、脏边像素和抠图造成的细节损坏。",
  "不要改变角色姿势、轮廓意图、比例、像素风格、颜色、服装、发型、五官、武器、配饰和光照。",
  "不要绘制透明背景预览格子，不要假装透明。外部背景可以是普通中性预览背景，后续会由 Alpha 合成节点处理透明通道。",
].join("\n");

export function referenceFrameUrl(url: string): string {
  const resolved = spriteAssetUrl(url);
  if (/^(data:|https?:\/\/)/i.test(resolved)) return resolved;
  return new URL(resolved, window.location.origin).toString();
}

function canLoadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve(false);
    }, 5000);

    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(true);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve(false);
    };
    image.src = url;
  });
}

export async function getRepairReferenceImageUrls(params: {
  sourceUrl: string;
  cutoutUrl: string;
}): Promise<{ urls: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const sourceUrl = params.sourceUrl ? referenceFrameUrl(params.sourceUrl) : "";
  const cutoutUrl = params.cutoutUrl ? referenceFrameUrl(params.cutoutUrl) : "";
  const urls: string[] = [];

  if (sourceUrl) {
    if (await canLoadImage(sourceUrl)) {
      urls.push(sourceUrl);
    } else {
      warnings.push("原始帧读取失败，已降级为仅参考当前抠图。");
    }
  }

  if (cutoutUrl && cutoutUrl !== sourceUrl) {
    if (await canLoadImage(cutoutUrl)) {
      urls.push(cutoutUrl);
    } else {
      warnings.push("当前抠图读取失败。");
    }
  }

  if (urls.length === 0) {
    throw new Error("参考图读取失败，无法生成 AI 补绘候选。");
  }

  return { urls, warnings };
}
