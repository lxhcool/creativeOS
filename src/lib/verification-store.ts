/**
 * Server-side Email Verification Code Store (in-memory).
 *
 * Codes are scoped by purpose so registration and login flows stay separate.
 */

const CODE_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_SEND_MS = 60 * 1000;
const MAX_SENDS_PER_10MIN = 5;
const SEND_WINDOW_MS = 10 * 60 * 1000;

export type VerificationPurpose = "login" | "register";

interface CodeEntry {
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

interface SendLog {
  timestamps: number[];
}

const codes = new Map<string, CodeEntry>();
const sendLogs = new Map<string, SendLog>();

function getCodeKey(email: string, purpose: VerificationPurpose): string {
  return `${purpose}:${email.toLowerCase()}`;
}

function getSendKey(email: string): string {
  return email.toLowerCase();
}

async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyHash(code: string, hash: string): Promise<boolean> {
  const computed = await hashCode(code);
  return computed === hash;
}

export function generateCode(): string {
  const digits = new Uint32Array(1);
  crypto.getRandomValues(digits);
  const num = ((digits[0] ?? 0) % 900000) + 100000;
  return num.toString();
}

export async function storeCode(params: {
  email: string;
  code: string;
  purpose: VerificationPurpose;
}): Promise<string | null> {
  const now = Date.now();
  const codeKey = getCodeKey(params.email, params.purpose);
  const sendKey = getSendKey(params.email);

  const existing = codes.get(codeKey);
  if (existing) {
    const age = CODE_EXPIRY_MS - (existing.expiresAt - now);
    if (age < RATE_LIMIT_SEND_MS) {
      return "请等待 60 秒后再请求新的验证码";
    }
  }

  const log = sendLogs.get(sendKey) || { timestamps: [] };
  log.timestamps = log.timestamps.filter((timestamp) => now - timestamp < SEND_WINDOW_MS);
  if (log.timestamps.length >= MAX_SENDS_PER_10MIN) {
    return "发送次数过多，请 10 分钟后再试";
  }

  log.timestamps.push(now);
  sendLogs.set(sendKey, log);

  codes.set(codeKey, {
    codeHash: await hashCode(params.code),
    expiresAt: now + CODE_EXPIRY_MS,
    attempts: 0,
  });

  return null;
}

export function removeCode(
  email: string,
  purpose: VerificationPurpose,
): void {
  codes.delete(getCodeKey(email, purpose));
}

export function rollbackSendLog(email: string): void {
  const sendKey = getSendKey(email);
  const log = sendLogs.get(sendKey);
  if (!log || log.timestamps.length === 0) return;

  log.timestamps.pop();
  if (log.timestamps.length === 0) {
    sendLogs.delete(sendKey);
  }
}

export async function verifyCode(params: {
  email: string;
  code: string;
  purpose: VerificationPurpose;
}): Promise<{ valid: boolean; error?: string }> {
  const codeKey = getCodeKey(params.email, params.purpose);
  const entry = codes.get(codeKey);

  if (!entry) {
    return { valid: false, error: "验证码不存在或已过期，请重新获取" };
  }

  if (Date.now() > entry.expiresAt) {
    codes.delete(codeKey);
    return { valid: false, error: "验证码已过期，请重新获取" };
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    codes.delete(codeKey);
    return { valid: false, error: "验证码尝试次数过多，请重新获取" };
  }

  const valid = await verifyHash(params.code, entry.codeHash);
  if (!valid) {
    return { valid: false, error: "验证码错误，请重试" };
  }

  codes.delete(codeKey);
  return { valid: true };
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of codes) {
      if (now > entry.expiresAt) {
        codes.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}
