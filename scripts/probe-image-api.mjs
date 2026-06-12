import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
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
  if (/^https?:\/\//i.test(route)) return route;
  return `${base}${route.startsWith("/") ? route : `/${route}`}`;
}

function editEndpoint(generationEndpoint) {
  if (/\/images\/generations\/?$/i.test(generationEndpoint)) {
    return generationEndpoint.replace(/\/images\/generations\/?$/i, "/images/edits");
  }
  if (/\/images\/edits\/?$/i.test(generationEndpoint)) return generationEndpoint;
  return `${generationEndpoint.replace(/\/+$/, "")}/edits`;
}

async function parseResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 800) };
  }

  const image =
    payload?.data?.[0]?.b64_json ||
    payload?.data?.[0]?.url ||
    payload?.data?.[0]?.image_url ||
    payload?.choices?.[0]?.message?.images?.[0]?.url;
  const savedPath = saveImage(image);
  return {
    ok: response.ok,
    status: response.status,
    hasImage: Boolean(image),
    savedPath,
    payload: response.ok ? summarizePayload(payload) : payload,
  };
}

function saveImage(image) {
  if (!image || typeof image !== "string") return undefined;
  if (!image.startsWith("data:image/")) {
    if (/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 80))) {
      const outputDir = path.join(root, "tmp", "generated");
      fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `probe-image-${Date.now()}.png`);
      fs.writeFileSync(outputPath, Buffer.from(image, "base64"));
      return outputPath;
    }
    return undefined;
  }

  const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return undefined;
  const extension = match[1].includes("jpeg") ? "jpg" : "png";
  const outputDir = path.join(root, "tmp", "generated");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `probe-image-${Date.now()}.${extension}`);
  fs.writeFileSync(outputPath, Buffer.from(match[2], "base64"));
  return outputPath;
}

function summarizePayload(payload) {
  return {
    keys: Object.keys(payload || {}),
    dataLength: Array.isArray(payload?.data) ? payload.data.length : undefined,
    firstDataKeys: payload?.data?.[0] ? Object.keys(payload.data[0]) : undefined,
    model: payload?.model,
  };
}

async function runJsonGeneration(url, config) {
  const body = {
    model: config.model,
    prompt: config.prompt,
  };
  if (config.size) body.size = config.size;
  if (config.extraBody) Object.assign(body, JSON.parse(config.extraBody));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

async function runJsonGenerationWithReference(url, config, shape) {
  const imagePath = path.join(root, config.referenceImagePath);
  const imageBase64 = fs.readFileSync(imagePath).toString("base64");
  const dataUrl = `data:image/png;base64,${imageBase64}`;
  const body = {
    model: config.model,
    prompt: config.prompt,
  };
  if (config.size) body.size = config.size;

  if (shape === "image") body.image = dataUrl;
  if (shape === "images") body.images = [dataUrl];
  if (shape === "referenceImageUrls") body.referenceImageUrls = [dataUrl];
  if (shape === "input_image") body.input_image = dataUrl;
  if (config.extraBody) Object.assign(body, JSON.parse(config.extraBody));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

async function runEdit(url, config, fieldName) {
  const imagePath = path.join(root, config.referenceImagePath);
  const image = await fs.openAsBlob(imagePath, { type: "image/png" });
  const formData = new FormData();
  formData.append("model", config.model);
  formData.append("prompt", config.prompt);
  if (config.size) formData.append("size", config.size);
  formData.append(fieldName, image, "image.png");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
  });
  return parseResponse(response);
}

loadEnv(envPath);

const baseUrl = process.env.IMAGE_GENERATION_BASE_URL;
const generationRoute = process.env.IMAGE_GENERATION_ENDPOINT || "/images/generations";
const apiKey = process.env.IMAGE_GENERATION_API_KEY;
const model = process.env.IMAGE_GENERATION_MODEL || "gpt-image-2";
const size = process.env.PROBE_OMIT_SIZE === "1" ? "" : (process.env.IMAGE_GENERATION_SIZE || "");
const extraBody = process.env.IMAGE_GENERATION_EXTRA_BODY;
const referenceImagePath = process.env.PROBE_REFERENCE_IMAGE || (fs.existsSync(path.join(root, "1.png")) ? "1.png" : "image.png");
const prompt =
  process.argv.slice(2).join(" ").trim() ||
  "生成一张极简黄黑配色的日系时装杂志封面插画，主体是女生，无文字，无水印。";

if (!baseUrl || !apiKey) {
  throw new Error("缺少 IMAGE_GENERATION_BASE_URL 或 IMAGE_GENERATION_API_KEY。");
}

const config = { apiKey, model, size, extraBody, prompt, referenceImagePath };
const generationUrl = endpoint(baseUrl, generationRoute);
const editsUrl = editEndpoint(generationUrl);
const onlyJsonReferences = process.env.PROBE_ONLY_JSON_REFERENCES === "1";
const onlyEdits = process.env.PROBE_ONLY_EDITS === "1";

async function runCase(title, fn) {
  console.log(`\n${title}`);
  try {
    console.log(JSON.stringify(await fn(), null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      cause: error?.cause?.code || error?.cause?.message,
    }, null, 2));
  }
}

console.log("image api probe");
console.log(JSON.stringify({
  baseUrl,
  generationPath: generationUrl.replace(baseUrl.replace(/\/+$/, ""), ""),
  editsPath: editsUrl.replace(baseUrl.replace(/\/+$/, ""), ""),
  model,
  size,
  referenceImagePath,
  hasReferenceImage: fs.existsSync(path.join(root, referenceImagePath)),
}, null, 2));

if (!onlyJsonReferences && !onlyEdits) {
  await runCase("[1] 文生图 /images/generations", () => runJsonGeneration(generationUrl, config));
}

if (!onlyJsonReferences) {
  await runCase("[2] 参考图生图 /images/edits field=image[]", () => runEdit(editsUrl, config, "image[]"));
  await runCase("[3] 参考图生图 /images/edits field=image", () => runEdit(editsUrl, config, "image"));
}

if (onlyEdits) process.exit(0);

await runCase("[4] 参考图生图 /images/generations JSON image", () => runJsonGenerationWithReference(generationUrl, config, "image"));
await runCase("[5] 参考图生图 /images/generations JSON images", () => runJsonGenerationWithReference(generationUrl, config, "images"));
await runCase("[6] 参考图生图 /images/generations JSON referenceImageUrls", () => runJsonGenerationWithReference(generationUrl, config, "referenceImageUrls"));
await runCase("[7] 参考图生图 /images/generations JSON input_image", () => runJsonGenerationWithReference(generationUrl, config, "input_image"));
