import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "问卷调查 — 海参崴创意内容",
  description: "关于中国市场创意内容需求的调查问卷",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50">{children}</body>
    </html>
  );
}
