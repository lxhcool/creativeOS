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

async function parseResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text.slice(0, 1200) };
  }
}

function imageDataUrl(fileName) {
  const imagePath = path.join(root, fileName);
  const base64 = fs.readFileSync(imagePath).toString("base64");
  return `data:image/png;base64,${base64}`;
}

function extractImage(payload) {
  const message = payload.choices?.[0]?.message;
  const imageFromImages =
    message?.images?.[0]?.image_url?.url ||
    message?.images?.[0]?.url;
  if (imageFromImages) return imageFromImages;

  const content = message?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.image_url?.url) return part.image_url.url;
      if (part?.url) return part.url;
    }
  }
  if (typeof content === "string") {
    const markdown = content.match(/!\[[^\]]*]\(([^)]+)\)/);
    if (markdown?.[1]) return markdown[1];
    const data = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (data?.[0]) return data[0];
    const url = content.match(/https?:\/\/\S+/);
    if (url?.[0]) return url[0].replace(/[),.]+$/, "");
  }
  return undefined;
}

function saveImage(image, prefix) {
  if (!image?.startsWith("data:image/")) return undefined;
  const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return undefined;
  const extension = match[1].includes("jpeg") ? "jpg" : "png";
  const outputDir = path.join(root, "tmp", "generated");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${prefix}-${Date.now()}.${extension}`);
  fs.writeFileSync(outputPath, Buffer.from(match[2], "base64"));
  return outputPath;
}

loadEnv(path.join(root, ".env"));

const baseUrl = (process.env.IMAGE_GENERATION_BASE_URL || "").replace(/\/+$/, "");
const apiKey = process.env.IMAGE_GENERATION_API_KEY;
const model = process.env.IMAGE_GENERATION_MODEL || "gpt-image-2";
const referenceImagePath = process.env.PROBE_REFERENCE_IMAGE || "1.png";
const prompt =
  process.argv.slice(2).join(" ").trim() ||
  "根据参考图生成一张 9:16 竖构图动漫人物海报，保留角色发型、发饰、服饰和配色。";

if (!baseUrl || !apiKey) {
  throw new Error("缺少 IMAGE_GENERATION_BASE_URL 或 IMAGE_GENERATION_API_KEY。");
}

console.log("chat image probe");
console.log(JSON.stringify({
  endpoint: `${baseUrl}/chat/completions`,
  model,
  referenceImagePath,
}, null, 2));

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl(referenceImagePath),
            },
          },
        ],
      },
    ],
  }),
});

const payload = await parseResponse(response);
const image = extractImage(payload);
console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  hasImage: Boolean(image),
  savedPath: saveImage(image, "chat-image"),
  payload: response.ok
    ? {
        keys: Object.keys(payload || {}),
        choiceKeys: payload.choices?.[0] ? Object.keys(payload.choices[0]) : undefined,
        messageKeys: payload.choices?.[0]?.message
          ? Object.keys(payload.choices[0].message)
          : undefined,
        contentPreview: typeof payload.choices?.[0]?.message?.content === "string"
          ? payload.choices[0].message.content.slice(0, 300)
          : undefined,
      }
    : payload,
}, null, 2));
