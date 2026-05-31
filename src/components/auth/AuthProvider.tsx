"use client";

import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/useAuthStore";

function FullscreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-bg-primary">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((state) => state.hydrate);
  const initialized = useAuthStore((state) => state.initialized);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!initialized) {
    return <FullscreenLoader />;
  }

  return <>{children}</>;
}
