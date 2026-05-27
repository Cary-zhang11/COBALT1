import type { UsecaseModule } from "./types";

export interface MockRecentReq {
  id: number;
  name: string;
  date: string;
  count: number;
}

export interface MockKPICard {
  label: string;
  value: string;
  trend: number;
  color: string;
  bg: string;
  icon: React.ComponentType<{ className?: string }>;
  reverse?: boolean;
}

export interface MockRecord {
  time: string;
  user: string;
  req: string;
  count: number;
  score: number;
  tokens: number;
  scheme: string;
}

export interface MockPromptTemplate {
  name: string;
  version: string;
  active: boolean;
  usage: number;
  avgScore: number;
  date: string;
  content: string;
}

export const mockRecentReqs: MockRecentReq[] = [
  { id: 1, name: "用户登录与权限管理 v2.3", date: "2026-05-24", count: 48 },
  { id: 2, name: "商品详情页改版需求", date: "2026-05-22", count: 32 },
];

export const mockDefaultTree: UsecaseModule[] = [
  {
    name: "1. 登录模块", open: true, cases: [
      { id: "c1", title: "正常登录（手机号+密码）", priority: "P0", precondition: "用户已注册", steps: "1. 打开登录页\n2. 输入手机号\n3. 点击登录", expected: "登录成功", tags: "功能,冒烟" },
    ],
  },
];

import { FileText, Users, BarChart3, Timer } from "lucide-react";

export const mockKPICards: MockKPICard[] = [
  { label: "累计生成用例数", value: "12,847", trend: 23, color: "text-blue-600", bg: "bg-blue-50", icon: FileText },
  { label: "本月活跃用户", value: "34", trend: 12, color: "text-cyan-600", bg: "bg-cyan-50", icon: Users },
  { label: "平均质量分", value: "88.6", trend: 5, color: "text-green-600", bg: "bg-green-50", icon: BarChart3 },
  { label: "平均生成耗时", value: "4.2s", trend: -8, color: "text-amber-600", bg: "bg-amber-50", icon: Timer, reverse: true },
];

export const mockPromptTemplates: MockPromptTemplate[] = [
  {
    name: "标准用例生成 Prompt", version: "v2.3", active: true, usage: 412, avgScore: 89, date: "2026-05-20",
    content: "你是一个专业的软件测试工程师...",
  },
];
