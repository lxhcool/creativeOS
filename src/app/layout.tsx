import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";

export const metadata: Metadata = {
  title: "CreativeOS",
  description: "CreativeOS authentication and model configuration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body id="root" className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
