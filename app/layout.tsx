import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { QueryProvider } from "@/components/query-provider";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "COBALT - AI 驱动需求处理平台",
  description: "上传需求，智能处理，生成高质量产出",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans">
        <QueryProvider>
          <AuthProvider>
            <div className="flex h-screen bg-background">
              <Sidebar />
              <main className="flex-1 flex flex-col overflow-hidden">
                {children}
              </main>
            </div>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
