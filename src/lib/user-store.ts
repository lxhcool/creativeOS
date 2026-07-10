import { generateId } from "./id";
import { prisma } from "./prisma";

export interface ServerUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  status: "active" | "disabled";
  passwordHash?: string;
  passwordSalt?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  status: string;
  passwordHash: string | null;
  passwordSalt: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

function toServerUser(row: UserRow): ServerUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name || undefined,
    avatarUrl: row.avatarUrl || undefined,
    status: row.status === "disabled" ? "disabled" : "active",
    passwordHash: row.passwordHash || undefined,
    passwordSalt: row.passwordSalt || undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString(),
  };
}

export async function findUserByEmail(email: string): Promise<ServerUser | null> {
  const normalizedEmail = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  return user ? toServerUser(user) : null;
}

export async function findUserById(id: string): Promise<ServerUser | null> {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  return user ? toServerUser(user) : null;
}

export async function createUser(params: {
  email: string;
  name?: string;
  passwordHash?: string;
  passwordSalt?: string;
}): Promise<ServerUser> {
  const user = await prisma.user.create({
    data: {
      id: generateId("user"),
      email: params.email.toLowerCase(),
      name: params.name || params.email.split("@")[0],
      status: "active",
      passwordHash: params.passwordHash,
      passwordSalt: params.passwordSalt,
      lastLoginAt: new Date(),
    },
  });

  return toServerUser(user);
}

export async function updateUserLogin(id: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id },
    data: {
      lastLoginAt: new Date(),
    },
  });
}

export async function updateUserProfile(
  id: string,
  updates: { name?: string; avatarUrl?: string },
): Promise<ServerUser | null> {
  const updated = await prisma.user.updateManyAndReturn({
    where: { id },
    data: {
      name: updates.name,
      avatarUrl: updates.avatarUrl || null,
    },
  });

  const user = updated[0];
  return user ? toServerUser(user) : null;
}

export async function setUserPassword(
  userId: string,
  hash: string,
  salt: string,
): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId },
    data: {
      passwordHash: hash,
      passwordSalt: salt,
    },
  });
}

export async function getUserPassword(
  userId: string,
): Promise<{ hash: string; salt: string } | null> {
  const user = await findUserById(userId);
  if (!user?.passwordHash || !user?.passwordSalt) return null;
  return { hash: user.passwordHash, salt: user.passwordSalt };
}

const encoder = new TextEncoder();

async function deriveBits(
  password: string,
  salt: Uint8Array,
): Promise<ArrayBuffer> {
  const encoded = encoder.encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoded,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);

  for (let index = 0; index < len; index++) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hashBuffer = await deriveBits(password, salt);
  return {
    hash: bytesToHex(hashBuffer),
    salt: bytesToHex(salt.buffer),
  };
}

export async function verifyPassword(
  password: string,
  hash: string,
  saltHex: string,
): Promise<boolean> {
  const salt = hexToBytes(saltHex);
  const hashBuffer = await deriveBits(password, salt);
  return bytesToHex(hashBuffer) === hash;
}
