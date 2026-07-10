import { ModelGateway } from "@/services/model/gateway";
import type { ModelGatewayConfig } from "@/services/model/types";

export const CANVAS_MEMORY_EMBEDDING_DIM = 96;
export const CANVAS_MEMORY_EMBEDDING_MODEL = "creativeos-local-hash-v1";

export type CanvasMemoryEmbeddingInput = {
  type: string;
  title: string;
  content: unknown;
};

export type CanvasMemoryEmbeddingData = {
  embedding: number[];
  embeddingModel: string;
  embeddingUpdatedAt: Date;
};

export function tokenizeForCanvasMemory(value: string): string[] {
  const normalized = value.toLowerCase();
  const latinTokens = normalized.match(/[a-z0-9_]{2,}/g) || [];
  const cjkTokens = normalized.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const cjkBigrams = cjkTokens.flatMap((token) => {
    const parts: string[] = [];
    for (let index = 0; index < token.length - 1; index += 1) {
      parts.push(token.slice(index, index + 2));
    }
    return parts;
  });
  return Array.from(new Set([...latinTokens, ...cjkTokens, ...cjkBigrams]));
}

export function memoryContentToSearchText(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const value = content as {
    summary?: string;
    text?: string;
    title?: string;
    items?: Array<{ title?: string; excerpt?: string }>;
  };

  return [
    value.summary,
    value.title,
    value.text,
    ...(value.items || []).flatMap((item) => [item.title, item.excerpt]),
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join("\n");
}

export function buildCanvasMemoryEmbeddingText(params: CanvasMemoryEmbeddingInput): string {
  return [
    params.type,
    params.title,
    memoryContentToSearchText(params.content),
  ].join("\n");
}

export function createLocalCanvasMemoryEmbedding(value: string): number[] {
  const vector = new Array<number>(CANVAS_MEMORY_EMBEDDING_DIM).fill(0);
  const tokens = tokenizeForCanvasMemory(value);
  if (tokens.length === 0) return vector;

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = hash % CANVAS_MEMORY_EMBEDDING_DIM;
    const sign = hash & 1 ? 1 : -1;
    vector[index] = (vector[index] || 0) + sign;
  }

  const norm = Math.sqrt(vector.reduce((total, item) => total + item * item, 0));
  if (norm === 0) return vector;
  return vector.map((item) => item / norm);
}

export async function createCanvasMemoryEmbeddingData(
  params: CanvasMemoryEmbeddingInput,
): Promise<CanvasMemoryEmbeddingData> {
  const text = buildCanvasMemoryEmbeddingText(params);
  if (getEmbeddingDriver() === "model_gateway") {
    const result = await createModelGatewayMemoryEmbedding(text);
    return {
      embedding: result.embedding,
      embeddingModel: result.model,
      embeddingUpdatedAt: new Date(),
    };
  }

  return {
    embedding: createLocalCanvasMemoryEmbedding(text),
    embeddingModel: CANVAS_MEMORY_EMBEDDING_MODEL,
    embeddingUpdatedAt: new Date(),
  };
}

export async function createCanvasMemoryQueryEmbedding(value: string): Promise<number[]> {
  if (getEmbeddingDriver() === "model_gateway") {
    const result = await createModelGatewayMemoryEmbedding(value);
    return result.embedding;
  }

  return createLocalCanvasMemoryEmbedding(value);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const size = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < size; index += 1) {
    const leftValue = left[index] || 0;
    const rightValue = right[index] || 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getEmbeddingDriver(): "local" | "model_gateway" {
  return process.env.CANVAS_MEMORY_EMBEDDING_DRIVER === "model_gateway"
    ? "model_gateway"
    : "local";
}

async function createModelGatewayMemoryEmbedding(text: string): Promise<{
  embedding: number[];
  model: string;
}> {
  const providerType = process.env.CANVAS_MEMORY_EMBEDDING_PROVIDER_TYPE || "openai_compatible";
  const baseUrl = process.env.CANVAS_MEMORY_EMBEDDING_BASE_URL;
  const apiKey = process.env.CANVAS_MEMORY_EMBEDDING_API_KEY;
  const modelId = process.env.CANVAS_MEMORY_EMBEDDING_MODEL;

  if (!baseUrl || !apiKey || !modelId) {
    throw new Error(
      "CANVAS_MEMORY_EMBEDDING_DRIVER=model_gateway 时必须配置 CANVAS_MEMORY_EMBEDDING_BASE_URL、CANVAS_MEMORY_EMBEDDING_API_KEY 和 CANVAS_MEMORY_EMBEDDING_MODEL",
    );
  }
  if (providerType !== "openai" && providerType !== "openai_compatible") {
    throw new Error("记忆 embedding 目前只支持 openai 或 openai_compatible provider");
  }

  const gateway = new ModelGateway(createMemoryEmbeddingGatewayConfig({
    providerType,
    baseUrl,
    apiKey,
    modelId,
  }));
  const result = await gateway.embed({
    task: "memory_embedding",
    texts: [text],
  });
  const embedding = result.embeddings[0];

  if (!embedding || embedding.length === 0) {
    throw new Error("记忆 embedding 服务未返回向量");
  }

  return {
    embedding,
    model: `${result.providerId}:${result.modelId}`,
  };
}

function createMemoryEmbeddingGatewayConfig(params: {
  providerType: "openai" | "openai_compatible";
  baseUrl: string;
  apiKey: string;
  modelId: string;
}): ModelGatewayConfig {
  return {
    providers: [
      {
        id: "memory_embedding",
        name: "Memory Embedding",
        type: params.providerType,
        enabled: true,
        baseUrl: params.baseUrl.replace(/\/+$/, ""),
        apiKey: params.apiKey,
        models: [
          {
            id: params.modelId,
            capabilities: ["embedding"],
          },
        ],
      },
    ],
    routing: {
      memory_embedding: [`memory_embedding:${params.modelId}`],
    },
  };
}
