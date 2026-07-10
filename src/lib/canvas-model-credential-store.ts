import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { prisma } from "./prisma";

export type CanvasModelCredentialProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "litellm"
  | "openrouter"
  | "openai_compatible";

export type CanvasModelCredentialRecord = {
  id: string;
  ownerId: string;
  name: string;
  providerType: CanvasModelCredentialProviderType;
  baseUrl: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type CanvasModelCredentialProviderInput = {
  id: string;
  type: CanvasModelCredentialProviderType;
  baseUrl: string;
  apiKey: string;
};

function createCredentialId(): string {
  return `model_cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getEncryptionKey(): Buffer {
  const secret =
    process.env.CANVAS_MODEL_CREDENTIAL_SECRET ||
    process.env.AUTH_SESSION_SECRET ||
    getDevCredentialSecret();
  if (secret.length < 16) {
    throw new Error("未配置模型凭据加密密钥");
  }
  return createHash("sha256").update(secret).digest();
}

function getDevCredentialSecret(): string {
  if (process.env.NODE_ENV === "production") {
    return "";
  }

  return "creativeos-dev-model-credential-secret";
}

function encryptApiKey(apiKey: string): {
  cipher: string;
  iv: string;
  tag: string;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  return {
    cipher: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptApiKey(params: {
  cipher: string;
  iv: string;
  tag: string;
}): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(params.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(params.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(params.cipher, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function toRecord(row: {
  id: string;
  ownerId: string;
  name: string;
  providerType: string;
  baseUrl: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): CanvasModelCredentialRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    providerType: row.providerType as CanvasModelCredentialProviderType,
    baseUrl: row.baseUrl,
    status: row.status as CanvasModelCredentialRecord["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertCanvasModelCredential(params: {
  ownerId: string;
  credentialId?: string;
  name: string;
  providerType: CanvasModelCredentialProviderType;
  baseUrl: string;
  apiKey: string;
}): Promise<CanvasModelCredentialRecord> {
  const encrypted = encryptApiKey(params.apiKey);
  const id = params.credentialId || createCredentialId();
  const row = await prisma.canvasModelCredential.upsert({
    where: { id },
    create: {
      id,
      ownerId: params.ownerId,
      name: params.name,
      providerType: params.providerType,
      baseUrl: params.baseUrl.replace(/\/+$/, ""),
      apiKeyCipher: encrypted.cipher,
      apiKeyIv: encrypted.iv,
      apiKeyTag: encrypted.tag,
      status: "active",
    },
    update: {
      name: params.name,
      providerType: params.providerType,
      baseUrl: params.baseUrl.replace(/\/+$/, ""),
      apiKeyCipher: encrypted.cipher,
      apiKeyIv: encrypted.iv,
      apiKeyTag: encrypted.tag,
      status: "active",
    },
  });

  return toRecord(row);
}

export async function listCanvasModelCredentials(params: {
  ownerId: string;
}): Promise<CanvasModelCredentialRecord[]> {
  const rows = await prisma.canvasModelCredential.findMany({
    where: {
      ownerId: params.ownerId,
      status: "active",
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return rows.map(toRecord);
}

export async function archiveCanvasModelCredential(params: {
  ownerId: string;
  credentialId: string;
}): Promise<void> {
  await prisma.canvasModelCredential.updateMany({
    where: {
      id: params.credentialId,
      ownerId: params.ownerId,
    },
    data: {
      status: "archived",
    },
  });
}

export async function getCanvasModelCredentialProviderInput(params: {
  ownerId: string;
  credentialId: string;
}): Promise<CanvasModelCredentialProviderInput | null> {
  const row = await prisma.canvasModelCredential.findFirst({
    where: {
      id: params.credentialId,
      ownerId: params.ownerId,
      status: "active",
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    type: row.providerType as CanvasModelCredentialProviderType,
    baseUrl: row.baseUrl,
    apiKey: decryptApiKey({
      cipher: row.apiKeyCipher,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    }),
  };
}
