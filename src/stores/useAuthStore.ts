import { create } from "zustand";
import type { User } from "@/types";
import {
  fetchSession,
  loginWithCode,
  loginWithPassword,
  logoutRequest,
  registerWithCode,
  requestAuthCode,
  updateProfile,
  type CodeRequestResponse,
} from "@/services/auth/client";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  user: User | null;
  status: AuthStatus;
  initialized: boolean;
  hydrate: () => Promise<void>;
  requestCode: (params: {
    email: string;
    purpose: "login" | "register";
  }) => Promise<CodeRequestResponse>;
  loginWithPassword: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  loginWithCode: (email: string, code: string) => Promise<{ success: boolean; message?: string }>;
  register: (params: {
    name: string;
    email: string;
    password: string;
    code: string;
  }) => Promise<{ success: boolean; message?: string }>;
  updateProfile: (params: {
    name: string;
    avatarUrl?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

function applyAuthenticatedState(
  set: (partial: Partial<AuthState>) => void,
  payload: { user: User },
) {
  set({
    user: payload.user,
    status: "authenticated",
    initialized: true,
  });
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: "loading",
  initialized: false,

  hydrate: async () => {
    set({ status: "loading" });

    try {
      const session = await fetchSession();
      if (session.authenticated && session.user) {
        applyAuthenticatedState(set, {
          user: session.user,
        });
        return;
      }
    } catch {
      // Ignore and fall back to anonymous.
    }

    set({
      user: null,
      status: "anonymous",
      initialized: true,
    });
  },

  requestCode: async ({ email, purpose }) => {
    return requestAuthCode({ email: email.trim(), purpose });
  },

  loginWithPassword: async (email, password) => {
    const result = await loginWithPassword({
      email: email.trim(),
      password,
    });

    if (!result.success) {
      set({ status: "anonymous", initialized: true });
      return { success: false, message: result.message };
    }

    applyAuthenticatedState(set, result);
    return { success: true };
  },

  loginWithCode: async (email, code) => {
    const result = await loginWithCode({
      email: email.trim(),
      code,
    });

    if (!result.success) {
      return { success: false, message: result.message };
    }

    applyAuthenticatedState(set, result);
    return { success: true };
  },

  register: async ({ name, email, password, code }) => {
    const result = await registerWithCode({
      name: name.trim(),
      email: email.trim(),
      password,
      code,
    });

    if (!result.success) {
      return { success: false, message: result.message };
    }

    applyAuthenticatedState(set, result);
    return { success: true };
  },

  updateProfile: async ({ name, avatarUrl }) => {
    const result = await updateProfile({ name, avatarUrl });

    if (!result.success) {
      return { success: false, message: result.message };
    }

    applyAuthenticatedState(set, result);
    return { success: true };
  },

  logout: async () => {
    try {
      await logoutRequest();
    } finally {
      set({
        user: null,
        status: "anonymous",
        initialized: true,
      });
    }
  },
}));
