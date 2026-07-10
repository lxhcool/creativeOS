"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/useAuthStore";

interface RegisterFormProps {
  onSuccess?: () => void;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishRegister = () => {
    if (onSuccess) {
      onSuccess();
      return;
    }
    router.replace("/settings/providers");
  };

  const validateInfoStep = () => {
    if (!name.trim()) return "请输入用户名";
    if (!isValidEmail(email)) return "请输入有效的邮箱地址";
    if (password.length < 6) return "密码至少需要 6 个字符";
    if (password !== confirmPassword) return "两次输入的密码不一致";
    return null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const validationError = validateInfoStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    const result = await register({ name, email, password });
    setSubmitting(false);

    if (!result.success) {
      setError(result.message || "注册失败");
      return;
    }

    finishRegister();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger backdrop-blur-2xl"
        >
          {error}
        </div>
      )}

      <Input
        label="用户名"
        placeholder="你的名字"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
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
        placeholder="至少 6 个字符"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <Input
        label="确认密码"
        type="password"
        placeholder="再次输入密码"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        required
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={submitting}
        className="w-full"
      >
        创建账号
      </Button>
    </form>
  );
}
