/**
 * Server-side Session Store (in-memory).
 *
 * Sessions are stored in a Map with auto-cleanup.
 * Session cookie: HttpOnly, Secure, Lax, 30-day expiry.
 *
 * For production: replace with Redis or database-backed sessions.
 */

import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "creativeos_sid";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // Renew if < 7 days remaining

export interface SessionData {
  id: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
}

const sessions = new Map<string, SessionData>();

/** Create a session and set the HttpOnly cookie */
export async function createSession(params: {
  userId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<SessionData> {
  const id = generateToken(48);
  const now = Date.now();

  const session: SessionData = {
    id,
    userId: params.userId,
    email: params.email,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  };

  sessions.set(id, session);

  // Set HttpOnly cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, id, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return session;
}

/** Get the current session from the request cookie */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) return null;

  // Check expiry
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    await clearSessionCookie();
    return null;
  }

  // Auto-renew if within threshold
  if (session.expiresAt - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
  }

  return session;
}

/** Destroy the current session and clear the cookie */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    sessions.delete(sessionId);
  }

  await clearSessionCookie();
}

async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0, // Delete immediately
  });
}

/** Generate a cryptographically random token */
function generateToken(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[array[i]! % chars.length];
  }
  return result;
}

// Clean up expired sessions every hour
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now > session.expiresAt) sessions.delete(id);
    }
  }, 60 * 60 * 1000);
}
