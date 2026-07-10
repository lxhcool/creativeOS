/**
 * Server-side Session Store (signed cookie).
 *
 * This avoids in-memory session loss during local dev restarts and hot reloads.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "creativeos_sid";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_SECRET =
  process.env["AUTH_SESSION_SECRET"] ||
  process.env["NEXTAUTH_SECRET"] ||
  getDevSessionSecret();

function getDevSessionSecret(): string {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("AUTH_SESSION_SECRET must be configured in production.");
  }

  return "creativeos-dev-session-secret";
}

export interface SessionData {
  id: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
}

interface SessionTokenPayload {
  id: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
}

export async function createSession(params: {
  userId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<SessionData> {
  const now = Date.now();
  const session: SessionData = {
    id: generateSessionId(now, params.userId),
    userId: params.userId,
    email: params.email,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  };

  await writeSessionCookie(session);
  return session;
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!raw) return null;

  const session = verifySessionToken(raw);
  if (!session) {
    await clearSessionCookie();
    return null;
  }

  if (Date.now() > session.expiresAt) {
    await clearSessionCookie();
    return null;
  }

  if (session.expiresAt - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
    const renewed: SessionData = {
      ...session,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    await writeSessionCookie(renewed);
    return renewed;
  }

  return session;
}

export async function destroySession(): Promise<void> {
  await clearSessionCookie();
}

async function writeSessionCookie(session: SessionData): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSessionToken(session), {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function signSessionToken(session: SessionData): string {
  const payload = {
    id: session.id,
    userId: session.userId,
    email: session.email,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  } satisfies SessionTokenPayload;
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

function verifySessionToken(token: string): SessionData | null {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return null;

  const expected = signValue(payloadEncoded);
  if (!safeEqual(signature, expected)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payloadEncoded)) as Partial<SessionTokenPayload>;
    if (
      !parsed.id ||
      !parsed.userId ||
      !parsed.email ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    return {
      id: parsed.id,
      userId: parsed.userId,
      email: parsed.email,
      createdAt: parsed.createdAt,
      expiresAt: parsed.expiresAt,
      ipAddress: parsed.ipAddress,
      userAgent: parsed.userAgent,
    };
  } catch {
    return null;
  }
}

function signValue(value: string): string {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function generateSessionId(now: number, userId: string): string {
  return createHmac("sha256", SESSION_SECRET)
    .update(`${userId}:${now}:${Math.random()}`)
    .digest("base64url");
}
