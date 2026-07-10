"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/useAuthStore";

interface LoginFormProps {
  onSuccess?: () => void;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter();
  const loginWithPassword = useAuthStore((state) => state.loginWithPassword);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <form onSubmit={handlePasswordSubmit} className="space-y-4">
      {error && (
        <div
          className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger backdrop-blur-2xl"
        >
          {error}
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
  );
}
