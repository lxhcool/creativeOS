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

async function formatPayload(userId: string): Promise<AuthPayload | null> {
  const user = await findUserById(userId);
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

export async function updateCurrentUserProfile(params: {
  userId: string;
  name: string;
  avatarUrl?: string;
}): Promise<AuthResult> {
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

  const user = await updateUserProfile(params.userId, {
    name,
    avatarUrl: params.avatarUrl,
  });

  if (!user) {
    return { success: false, message: "用户不存在" };
  }

  const payload = await formatPayload(user.id);
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

export async function loginWithPasswordAuth(
  request: Request,
  params: { email: string; password: string },
): Promise<AuthResult> {
  if (!params.email || !params.password) {
    return { success: false, message: "请输入邮箱和密码" };
  }

  const user = await findUserByEmail(params.email);
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

  await updateUserLogin(user.id);
  await createSessionForUser(request, user.id, user.email);
  const payload = await formatPayload(user.id);

  if (!payload) {
    return { success: false, message: "用户信息读取失败" };
  }

  return { success: true, payload };
}

export async function registerWithPasswordAuth(
  request: Request,
  params: { name: string; email: string; password: string },
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

  if (await findUserByEmail(params.email)) {
    return { success: false, message: "该邮箱已注册，请直接登录" };
  }

  const passwordRecord = await hashPassword(params.password);
  const user = await createUser({
    email: params.email,
    name: params.name.trim(),
    passwordHash: passwordRecord.hash,
    passwordSalt: passwordRecord.salt,
  });

  await createSessionForUser(request, user.id, user.email);
  const payload = await formatPayload(user.id);

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
