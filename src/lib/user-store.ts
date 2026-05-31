/**
 * Server-side user store (JSON file-based).
 *
 * For MVP this persists user records in local JSON files.
 * Production can replace the internals with a real database.
 */

import fs from "fs";
import path from "path";
import { generateId } from "./id";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

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
  githubId?: string;
  googleId?: string;
  phone?: string;
  phoneVerified?: boolean;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function readUsers(): ServerUser[] {
  return readJsonFile<ServerUser[]>(USERS_FILE, []);
}

function writeUsers(users: ServerUser[]): void {
  writeJsonFile(USERS_FILE, users);
}

export function findUserByEmail(email: string): ServerUser | undefined {
  const normalizedEmail = email.toLowerCase();
  return readUsers().find((user) => user.email.toLowerCase() === normalizedEmail);
}

export function findUserById(id: string): ServerUser | undefined {
  return readUsers().find((user) => user.id === id);
}

export function createUser(params: {
  email: string;
  name?: string;
  passwordHash?: string;
  passwordSalt?: string;
}): ServerUser {
  const users = readUsers();
  const now = new Date().toISOString();

  const user: ServerUser = {
    id: generateId("user"),
    email: params.email.toLowerCase(),
    name: params.name || params.email.split("@")[0],
    avatarUrl: undefined,
    status: "active",
    passwordHash: params.passwordHash,
    passwordSalt: params.passwordSalt,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };

  users.push(user);
  writeUsers(users);
  return user;
}

export function updateUserLogin(id: string): void {
  const users = readUsers();
  const user = users.find((entry) => entry.id === id);

  if (!user) return;

  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = user.lastLoginAt;
  writeUsers(users);
}

export function updateUserProfile(
  id: string,
  updates: { name?: string; avatarUrl?: string },
): ServerUser | null {
  const users = readUsers();
  const user = users.find((entry) => entry.id === id);

  if (!user) return null;

  if (updates.name !== undefined) {
    user.name = updates.name;
  }

  if (updates.avatarUrl !== undefined) {
    user.avatarUrl = updates.avatarUrl || undefined;
  }

  user.updatedAt = new Date().toISOString();
  writeUsers(users);
  return user;
}

export function setUserPassword(userId: string, hash: string, salt: string): void {
  const users = readUsers();
  const user = users.find((entry) => entry.id === userId);

  if (!user) return;

  user.passwordHash = hash;
  user.passwordSalt = salt;
  user.updatedAt = new Date().toISOString();
  writeUsers(users);
}

export function getUserPassword(
  userId: string,
): { hash: string; salt: string } | null {
  const user = findUserById(userId);
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
