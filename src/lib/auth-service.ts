import { Resend } from "resend";
import { createSession, getSession } from "./session-store";
import {
  createUser,
  findUserByEmail,
  findUserById,
  hashPassword,
  updateUserLogin,
  updateUserProfile,
  verifyPassword,
} from "./user-store";
import {
  generateCode,
  removeCode,
  rollbackSendLog,
  storeCode,
  verifyCode,
  type VerificationPurpose,
} from "./verification-store";

export interface AuthPayload {
  user: {
    id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface AuthResult {
  success: boolean;
  message?: string;
  payload?: AuthPayload;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatPayload(userId: string): AuthPayload | null {
  const user = findUserById(userId);
  if (!user) return null;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  };
}

export function updateCurrentUserProfile(params: {
  userId: string;
  name: string;
  avatarUrl?: string;
}): AuthResult {
  const name = params.name.trim();

  if (!name) {
    return { success: false, message: "请输入昵称" };
  }

  if (name.length > 32) {
    return { success: false, message: "昵称最多 32 个字符" };
  }

  if (params.avatarUrl?.startsWith("data:")) {
    return { success: false, message: "头像必须先上传到服务器" };
  }

  if (params.avatarUrl && params.avatarUrl.length > 500) {
    return { success: false, message: "头像地址过长" };
  }

  const user = updateUserProfile(params.userId, {
    name,
    avatarUrl: params.avatarUrl,
  });

  if (!user) {
    return { success: false, message: "用户不存在" };
  }

  const payload = formatPayload(user.id);
  if (!payload) {
    return { success: false, message: "用户信息读取失败" };
  }

  return { success: true, payload };
}

async function createSessionForUser(request: Request, userId: string, email: string) {
  const ip = request.headers.get("x-forwarded-for") || undefined;
  const userAgent = request.headers.get("user-agent") || undefined;
  await createSession({ userId, email, ipAddress: ip, userAgent });
}

function buildEmailHtml(code: string, purpose: VerificationPurpose): string {
  const action = purpose === "register" ? "完成注册" : "登录账号";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f0f0f; color: #e0e0e0; border-radius: 12px; border: 1px solid #333;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 24px; font-weight: bold; background: linear-gradient(135deg, #f59e0b, #6366f1, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0;">CreativeOS</h1>
      </div>
      <h2 style="font-size: 18px; margin: 0 0 12px; color: #e0e0e0;">验证码</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #a0a0a0; margin: 0 0 24px;">请使用下面的验证码${action}。验证码 5 分钟内有效。</p>
      <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #e0e0e0; font-family: 'Courier New', monospace;">${code}</span>
      </div>
      <p style="font-size: 12px; color: #666; margin: 0;">如果这不是你的操作，可以直接忽略这封邮件。</p>
    </div>`;
}

export async function requestEmailCode(params: {
  email: string;
  purpose: VerificationPurpose;
}): Promise<AuthResult> {
  if (!params.email || !isValidEmail(params.email)) {
    return { success: false, message: "请输入有效的邮箱地址" };
  }

  const existingUser = findUserByEmail(params.email);
  if (params.purpose === "register" && existingUser) {
    return { success: false, message: "该邮箱已注册，请直接登录" };
  }

  if (params.purpose === "login" && !existingUser) {
    return { success: false, message: "该邮箱尚未注册，请先创建账号" };
  }

  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    return { success: false, message: "邮件服务未配置" };
  }

  const code = generateCode();
  const rateLimitError = await storeCode({
    email: params.email,
    code,
    purpose: params.purpose,
  });

  if (rateLimitError) {
    return { success: false, message: rateLimitError };
  }

  const resend = new Resend(apiKey);
  const from = process.env["RESEND_FROM_EMAIL"] || "CreativeOS <onboarding@resend.dev>";
  const subject =
    params.purpose === "register"
      ? "CreativeOS 注册验证码"
      : "CreativeOS 登录验证码";

  const { error } = await resend.emails.send({
    from,
    to: [params.email],
    subject,
    html: buildEmailHtml(code, params.purpose),
  });

  if (error) {
    removeCode(params.email, params.purpose);
    rollbackSendLog(params.email);
    return { success: false, message: "验证码发送失败，请稍后再试" };
  }

  return {
    success: true,
    message: "验证码已发送，请检查邮箱",
  };
}

export async function loginWithPasswordAuth(
  request: Request,
  params: { email: string; password: string },
): Promise<AuthResult> {
  if (!params.email || !params.password) {
    return { success: false, message: "请输入邮箱和密码" };
  }

  const user = findUserByEmail(params.email);
  if (!user || !user.passwordHash || !user.passwordSalt) {
    return { success: false, message: "邮箱或密码不正确" };
  }

  const valid = await verifyPassword(
    params.password,
    user.passwordHash,
    user.passwordSalt,
  );

  if (!valid) {
    return { success: false, message: "邮箱或密码不正确" };
  }

  updateUserLogin(user.id);
  await createSessionForUser(request, user.id, user.email);
  const payload = formatPayload(user.id);

  if (!payload) {
    return { success: false, message: "用户信息读取失败" };
  }

  return { success: true, payload };
}

export async function loginWithEmailCodeAuth(
  request: Request,
  params: { email: string; code: string },
): Promise<AuthResult> {
  if (!params.email || !isValidEmail(params.email)) {
    return { success: false, message: "请输入有效的邮箱地址" };
  }

  if (!params.code || !/^\d{6}$/.test(params.code)) {
    return { success: false, message: "请输入 6 位验证码" };
  }

  const result = await verifyCode({
    email: params.email,
    code: params.code,
    purpose: "login",
  });

  if (!result.valid) {
    return { success: false, message: result.error };
  }

  const user = findUserByEmail(params.email);
  if (!user) {
    return { success: false, message: "该邮箱尚未注册，请先创建账号" };
  }

  updateUserLogin(user.id);
  await createSessionForUser(request, user.id, user.email);
  const payload = formatPayload(user.id);

  if (!payload) {
    return { success: false, message: "用户信息读取失败" };
  }

  return { success: true, payload };
}

export async function registerWithEmailCodeAuth(
  request: Request,
  params: { name: string; email: string; password: string; code: string },
): Promise<AuthResult> {
  if (!params.email || !isValidEmail(params.email)) {
    return { success: false, message: "请输入有效的邮箱地址" };
  }

  if (!params.name.trim()) {
    return { success: false, message: "请输入用户名" };
  }

  if (!params.password || params.password.length < 6) {
    return { success: false, message: "密码至少需要 6 个字符" };
  }

  if (!params.code || !/^\d{6}$/.test(params.code)) {
    return { success: false, message: "请输入 6 位验证码" };
  }

  if (findUserByEmail(params.email)) {
    return { success: false, message: "该邮箱已注册，请直接登录" };
  }

  const verifyResult = await verifyCode({
    email: params.email,
    code: params.code,
    purpose: "register",
  });

  if (!verifyResult.valid) {
    return { success: false, message: verifyResult.error };
  }

  const passwordRecord = await hashPassword(params.password);
  const user = createUser({
    email: params.email,
    name: params.name.trim(),
    passwordHash: passwordRecord.hash,
    passwordSalt: passwordRecord.salt,
  });

  await createSessionForUser(request, user.id, user.email);
  const payload = formatPayload(user.id);

  if (!payload) {
    return { success: false, message: "用户信息读取失败" };
  }

  return { success: true, payload };
}

export function getCurrentAuthPayload() {
  return getSession().then((session) => {
    if (!session) return null;
    return formatPayload(session.userId);
  });
}
