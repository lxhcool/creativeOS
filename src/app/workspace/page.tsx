"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/useAuthStore";

export default function EmptyPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/auth/login");
    }
  }, [router, status]);

  if (status !== "authenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return <main className="min-h-screen bg-bg-primary" />;
}
