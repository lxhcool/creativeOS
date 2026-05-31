"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { HomeBackgroundCanvas } from "@/components/home/HomeBackgroundCanvas";
import { ProviderCenter } from "@/components/settings/ProviderCenter";
import { useAuthStore } from "@/stores/useAuthStore";

export default function ProvidersPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/");
    }
  }, [router, status]);

  if (status !== "authenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <main className="relative h-screen overflow-hidden bg-[#02070b] text-white">
      <HomeBackgroundCanvas />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_55%_35%,transparent_0,rgba(0,0,0,0.36)_48%,rgba(0,0,0,0.8)_100%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.5),transparent_48%,rgba(0,0,0,0.25))]" />

      <div className="relative z-10 flex h-full flex-col px-5 pt-[30px] pb-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/logo-text.png"
              alt="CreativeOS"
              height={28}
              width={204}
              priority
              className="h-5 w-auto"
            />
          </Link>

          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 text-xs font-medium text-white/[0.82] shadow-lg shadow-black/20 backdrop-blur-2xl transition hover:bg-white/[0.14] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回首页
          </Link>
        </header>

        <ProviderCenter />
      </div>
    </main>
  );
}
