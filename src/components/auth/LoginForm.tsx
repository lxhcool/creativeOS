"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/useAuthStore";
import { VerificationCodeInput } from "./VerificationCodeInput";

type LoginMode = "password" | "code";

interface LoginFormProps {
  onSuccess?: () => void;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter();
  const requestCode = useAuthStore((state) => state.requestCode);
  const loginWithPassword = useAuthStore((state) => state.loginWithPassword);
  const loginWithCode = useAuthStore((state) => state.loginWithCode);

  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;

    const timer = window.setTimeout(() => {
      setCountdown((value) => value - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  const finishLogin = () => {
    if (onSuccess) {
      onSuccess();
      return;
    }

    router.replace("/settings/providers");
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isValidEmail(email)) {
      setError("请输入有效的邮箱地址");
      return;
    }

    if (!password) {
      setError("请输入密码");
      return;
    }

    setSubmitting(true);
    const result = await loginWithPassword(email, password);
    setSubmitting(false);

    if (!result.success) {
      setError(result.message || "登录失败");
      return;
    }

    finishLogin();
  };

  const handleRequestCode = async () => {
    setError(null);
    setMessage(null);

    if (!isValidEmail(email)) {
      setError("请输入有效的邮箱地址");
      return;
    }

    setSubmitting(true);
    const result = await requestCode({ email, purpose: "login" });
    setSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setCodeSent(true);
    setCountdown(60);
    setMessage(result.message);
  };

  const handleCodeSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (code.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }

    setSubmitting(true);
    const result = await loginWithCode(email, code);
    setSubmitting(false);

    if (!result.success) {
      setError(result.message || "登录失败");
      return;
    }

    finishLogin();
  };

  return (
    <div className="space-y-4">
      <div className="flex rounded-2xl border border-white/10 bg-white/[0.06] p-1 backdrop-blur-2xl">
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setError(null);
            setMessage(null);
          }}
          className={`flex-1 rounded-xl py-2 text-sm font-medium transition-all cursor-pointer ${
            mode === "password"
              ? "bg-white/[0.15] text-white shadow-sm"
              : "text-white/40 hover:text-white/70"
          }`}
        >
          密码登录
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("code");
            setError(null);
            setMessage(null);
          }}
          className={`flex-1 rounded-xl py-2 text-sm font-medium transition-all cursor-pointer ${
            mode === "code"
              ? "bg-white/[0.15] text-white shadow-sm"
              : "text-white/40 hover:text-white/70"
          }`}
        >
          验证码登录
        </button>
      </div>

      {(error || message) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm backdrop-blur-2xl ${
            error
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-white/10 bg-white/[0.06] text-white/70"
          }`}
        >
          {error || message}
        </div>
      )}

      <Input
        label="邮箱"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      {mode === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <Input
            label="密码"
            type="password"
            placeholder="请输入密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            className="w-full"
          >
            登录
          </Button>
        </form>
      ) : (
        <form onSubmit={handleCodeSubmit} className="space-y-4">
          {!codeSent ? (
            <Button
              type="button"
              variant="primary"
              size="lg"
              loading={submitting}
              onClick={handleRequestCode}
              className="w-full"
            >
              发送验证码
            </Button>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/60 backdrop-blur-2xl">
                验证码已发送至{" "}
                <span className="text-white/85">{email}</span>
              </div>
              <VerificationCodeInput value={code} onChange={setCode} />
              <div className="text-center text-xs text-white/40">
                {countdown > 0 ? (
                  <span>{countdown} 秒后可重新发送</span>
                ) : (
                  <button
                    type="button"
                    className="text-white/70 hover:text-white cursor-pointer transition-colors"
                    onClick={handleRequestCode}
                  >
                    重新发送验证码
                  </button>
                )}
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                className="w-full"
              >
                登录
              </Button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
