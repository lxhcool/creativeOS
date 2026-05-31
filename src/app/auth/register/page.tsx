"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { useAuthStore } from "@/stores/useAuthStore";

export default function RegisterPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/settings/providers");
    }
  }, [router, status]);

  if (status === "authenticated") {
    return null;
  }

  return (
    <AuthShell
      title="创建账号"
      description="完成邮箱验证后，就可以保存你的大模型配置。"
      footer={
        <>
          已经有账号？{" "}
          <Link
            href="/auth/login"
            className="text-white/60 hover:text-white cursor-pointer transition-colors"
          >
            立即登录
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
