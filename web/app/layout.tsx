import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "轻效 Todo · 任务与番茄时间",
  description: "四象限待办、任务与子任务番茄钟、每日时间表，手机与电脑同步。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
