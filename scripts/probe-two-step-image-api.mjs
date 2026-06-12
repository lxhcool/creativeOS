import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function endpoint(baseUrl, route) {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${route.startsWith("/") ? route : `/${route}`}`;
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

function imageDataUrl(fileName) {
  const filePath = path.join(root, fileName);
  const base64 = fs.readFileSync(filePath).toString("base64");
  return `data:image/png;base64,${base64}`;
}

async function refinePrompt(config) {
  const response = await fetch(endpoint(config.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.visionModel,
      messages: [
        {
          role: "system",
          content:
            "你是视觉提示词设计师。根据参考图和用户要求，输出一段可直接交给图片生成模型的中文提示词。只输出提示词，不要解释。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `用户要求：${config.prompt}`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl(config.referenceImagePath),
              },
            },
          ],
        },
      ],
      temperature: 0.35,
      max_tokens: 1800,
    }),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(JSON.stringify(payload));
  }
  return payload.choices?.[0]?.message?.content?.trim() || config.prompt;
}

async function generateImage(config, prompt) {
  const body = {
    model: config.imageModel,
    prompt,
  };
  const response = await fetch(endpoint(config.baseUrl, "/images/generations"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await parseResponse(response);
  const imageBase64 = payload.data?.[0]?.b64_json;
  const imageUrl = payload.data?.[0]?.url;
  let savedPath;
  if (response.ok && imageBase64) {
    const outputDir = path.join(root, "tmp", "generated");
    fs.mkdirSync(outputDir, { recursive: true });
    savedPath = path.join(outputDir, `two-step-image-${Date.now()}.png`);
    fs.writeFileSync(savedPath, Buffer.from(imageBase64, "base64"));
  }
  return {
    ok: response.ok,
    status: response.status,
    hasImage: Boolean(imageBase64 || imageUrl),
    savedPath,
    imageUrl,
    payload: response.ok
      ? {
          keys: Object.keys(payload || {}),
          dataLength: Array.isArray(payload.data) ? payload.data.length : undefined,
          firstDataKeys: payload.data?.[0] ? Object.keys(payload.data[0]) : undefined,
        }
      : payload,
  };
}

loadEnv(path.join(root, ".env"));

const config = {
  baseUrl: process.env.IMAGE_GENERATION_BASE_URL,
  apiKey: process.env.IMAGE_GENERATION_API_KEY,
  imageModel: process.env.IMAGE_GENERATION_MODEL || "gpt-image-2",
  visionModel: process.env.PROBE_VISION_MODEL || process.env.CANVAS_IMAGE_PROMPT_MODEL || "gpt-5.4-mini",
  referenceImagePath: process.env.PROBE_REFERENCE_IMAGE || "1.png",
  prompt:
    process.argv.slice(2).join(" ").trim() ||
    "根据参考图生成一张 9:16 竖构图动漫人物海报，无文字，无水印。",
};

if (!config.baseUrl || !config.apiKey) {
  throw new Error("缺少 IMAGE_GENERATION_BASE_URL 或 IMAGE_GENERATION_API_KEY。");
}

console.log("two-step image probe");
console.log(JSON.stringify({
  baseUrl: config.baseUrl,
  visionModel: config.visionModel,
  imageModel: config.imageModel,
  referenceImagePath: config.referenceImagePath,
}, null, 2));

console.log("\n[1] 视觉模型整理生图提示词");
const refinedPrompt = await refinePrompt(config);
console.log(refinedPrompt.slice(0, 1200));

console.log("\n[2] 图像模型纯文生图");
console.log(JSON.stringify(await generateImage(config, refinedPrompt), null, 2));
