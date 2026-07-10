"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { useAuthStore } from "@/stores/useAuthStore";

export default function LoginPage() {
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
      title="登录"
      description="使用邮箱和密码进入你的 CreativeOS。"
      footer={
        <>
          还没有账号？{" "}
          <Link
            href="/auth/register"
            className="text-white/60 hover:text-white cursor-pointer transition-colors"
          >
            立即注册
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
