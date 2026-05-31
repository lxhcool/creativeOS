"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/useAuthStore";
import { VerificationCodeInput } from "./VerificationCodeInput";

type RegisterStep = "info" | "verify";

interface RegisterFormProps {
  onSuccess?: () => void;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const router = useRouter();
  const requestCode = useAuthStore((state) => state.requestCode);
  const register = useAuthStore((state) => state.register);

  const [step, setStep] = useState<RegisterStep>("info");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((v) => v - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

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

  // Step 1 → Step 2: validate and send code
  const handleGoVerify = async () => {
    setError(null);
    setMessage(null);

    const validationError = validateInfoStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    const result = await requestCode({ email, purpose: "register" });
    setSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setCountdown(60);
    setMessage(result.message);
    setStep("verify");
  };

  // Step 2: final submit
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (code.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }

    setSubmitting(true);
    const result = await register({ name, email, password, code });
    setSubmitting(false);

    if (!result.success) {
      setError(result.message || "注册失败");
      return;
    }

    finishRegister();
  };

  // Resend code from step 2
  const handleResendCode = async () => {
    setError(null);
    setMessage(null);
    setSubmitting(true);
    const result = await requestCode({ email, purpose: "register" });
    setSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setCountdown(60);
    setMessage(result.message);
  };

  // Step indicator
  const steps = ["账户信息", "验证邮箱"];

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                (i === 0 && step === "info") || (i === 1 && step === "verify")
                  ? "bg-white text-[#02070b]"
                  : i < steps.findIndex((_, idx) => steps[idx] === step)
                    ? "bg-white/20 text-white"
                    : "bg-white/[0.08] text-white/40"
              }`}
            >
              {i < steps.findIndex((_, idx) => steps[idx] === step) ? "✓" : i + 1}
            </span>
            <span
              className={`text-sm font-medium transition-colors duration-300 ${
                (i === 0 && step === "info") || (i === 1 && step === "verify")
                  ? "text-white/90"
                  : i < steps.findIndex((_, idx) => steps[idx] === step)
                    ? "text-white/50"
                    : "text-white/30"
              }`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className="flex-1 mx-2 h-px bg-white/10" />
            )}
          </div>
        ))}
      </div>

      {/* Messages */}
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

      {step === "info" ? (
        /* Step 1: Account Info */
        <div className="space-y-4">
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
            type="button"
            variant="primary"
            size="lg"
            loading={submitting}
            onClick={handleGoVerify}
            className="w-full"
          >
            下一步，验证邮箱
          </Button>
        </div>
      ) : (
        /* Step 2: Email Verification */
        <form onSubmit={handleSubmit} className="space-y-4">
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
                onClick={handleResendCode}
              >
                重新发送验证码
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => {
                setStep("info");
                setError(null);
                setMessage(null);
              }}
              className="flex-1"
            >
              上一步
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="flex-1"
            >
              创建账号
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
