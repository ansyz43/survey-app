import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Исследование креативных индустрий — Дальний Восток России",
  description: "Исследование спроса на продукты креативных индустрий Дальнего Востока России на китайском рынке",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50">{children}</body>
    </html>
  );
}
