"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import {
  LayoutDashboard,
  LogOut,
  Cpu,
  Wand2,
  Clock,
  BarChart3,
  BookOpen,
  Users,
  Package,
  Plus,
} from "lucide-react";

const navItems = [
  { href: "/usecase-gen?tab=generate", label: "用例生成", icon: Wand2 },
  { href: "/usecase-gen?tab=history", label: "历史记录", icon: Clock },
  { href: "/usecase-gen?tab=dashboard", label: "数据看板", icon: BarChart3 },
  { href: "/usecase-gen?tab=knowledge", label: "知识库管理", icon: BookOpen },
];

const ADMIN_USERS = (process.env.NEXT_PUBLIC_ADMIN_USERS || "").split(",").filter(Boolean);

function isAdminClient(user: { username?: string | null; permissions?: any }): boolean {
  if (user?.username && ADMIN_USERS.includes(user.username)) return true;
  if (user?.permissions?.is_admin) return true;
  return false;
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, logout } = useAuthStore();

  function isNavActive(href: string) {
    if (href === "/") return pathname === "/";
    const [hrefPath, hrefQuery] = href.split("?");
    if (pathname !== hrefPath) return false;
    if (!hrefQuery) return true;
    const hrefTab = new URLSearchParams(hrefQuery).get("tab");
    return searchParams.get("tab") === hrefTab;
  }

  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      <div className="p-6 border-b">
        <Link href="/usecase-gen" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/30 transition-shadow">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-foreground">
              COBALT
            </h1>
            <p className="text-[10px] text-muted-foreground -mt-0.5">
              AI 执行平台
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isNavActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 transition-colors",
                  isActive ? "text-blue-600" : "text-muted-foreground"
                )}
              />
              {item.label}
            </Link>
          );
        })}

        {user && isAdminClient(user) && (
          <>
            <div className="my-2 border-t" />
            <Link
              href="/tasks/new"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                pathname === "/tasks/new"
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Plus className={cn(
                "w-4 h-4 transition-colors",
                pathname === "/tasks/new" ? "text-blue-600" : "text-muted-foreground"
              )} />
              新建任务
            </Link>
            <Link
              href="/skills"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                pathname.startsWith("/skills")
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Package className={cn(
                "w-4 h-4 transition-colors",
                pathname.startsWith("/skills") ? "text-blue-600" : "text-muted-foreground"
              )} />
              技能管理
            </Link>
            <Link
              href="/"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                pathname === "/"
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <LayoutDashboard className={cn(
                "w-4 h-4 transition-colors",
                pathname === "/" ? "text-blue-600" : "text-muted-foreground"
              )} />
              日志列表
            </Link>
            <Link
              href="/admin/users"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                pathname.startsWith("/admin")
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Users className={cn(
                "w-4 h-4 transition-colors",
                pathname.startsWith("/admin") ? "text-blue-600" : "text-muted-foreground"
              )} />
              用户管理
            </Link>
          </>
        )}
      </nav>

      <div className="p-4 border-t">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.name || user?.email || "User"}
            </p>
          </div>
          <button
            onClick={logout}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="退出登录"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </aside>
  );
}
