"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  PlusCircle,
  Wand2,
  Settings,
  FileText,
  Cpu,
} from "lucide-react";

const navItems = [
  { href: "/", label: "项目列表", icon: LayoutDashboard },
  { href: "/projects/new", label: "新建项目", icon: PlusCircle },
  { href: "/skills", label: "技能管理", icon: Wand2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-skill-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-skill-500/20 group-hover:shadow-skill-500/30 transition-shadow">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-foreground">
              SkillFlow
            </h1>
            <p className="text-[10px] text-muted-foreground -mt-0.5">
              AI 驱动需求处理
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-skill-50 text-skill-700 shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 transition-colors",
                  isActive ? "text-skill-600" : "text-muted-foreground"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t space-y-3">
        <div className="px-3 py-2 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
            <FileText className="w-3.5 h-3.5" />
            本月使用
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 mb-1">
            <div
              className="bg-gradient-to-r from-skill-500 to-cyan-500 h-1.5 rounded-full transition-all"
              style={{ width: "42%" }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            42K / 100K tokens
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-skill-400 to-cyan-400 flex items-center justify-center text-white text-xs font-bold">
            U
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">User</p>
            <p className="text-[10px] text-muted-foreground">Free Plan</p>
          </div>
          <Settings className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
        </div>
      </div>
    </aside>
  );
}
