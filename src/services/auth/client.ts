import type { User } from "@/types";

export interface AuthSuccessResponse {
  success: true;
  user: User;
}

export interface AuthErrorResponse {
  success: false;
  message: string;
}

export type AuthApiResponse = AuthSuccessResponse | AuthErrorResponse;

export interface SessionResponse {
  authenticated: boolean;
  user: User | null;
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fetchSession(): Promise<SessionResponse> {
  const response = await fetch("/api/auth/me");
  return parseJson<SessionResponse>(response);
}

export async function loginWithPassword(params: {
  email: string;
  password: string;
}): Promise<AuthApiResponse> {
  const response = await fetch("/api/auth/password/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return parseJson<AuthApiResponse>(response);
}

export async function registerWithPassword(params: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthApiResponse> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return parseJson<AuthApiResponse>(response);
}

export async function logoutRequest(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function updateProfile(params: {
  name: string;
  avatarUrl?: string;
}): Promise<AuthApiResponse> {
  const response = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return parseJson<AuthApiResponse>(response);
}

export async function uploadAvatar(file: Blob): Promise<{
  success: boolean;
  avatarUrl?: string;
  message?: string;
}> {
  const formData = new FormData();
  formData.append("avatar", file, "avatar.webp");

  const response = await fetch("/api/uploads/avatar", {
    method: "POST",
    body: formData,
  });

  return parseJson<{
    success: boolean;
    avatarUrl?: string;
    message?: string;
  }>(response);
}
