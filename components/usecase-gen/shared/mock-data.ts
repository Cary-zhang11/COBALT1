import type { UsecaseModule } from "./types";

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

export interface MockCapability {
  name: string;
  desc: string;
  selected: boolean;
}

export interface MockDimension {
  name: string;
  active: boolean;
}

export interface MockQuickAction {
  icon: string;
  label: string;
}

export interface MockKBItem {
  name: string;
  date: string;
  tags: string[];
  refs: number;
}

export const mockCapabilities: MockCapability[] = [
  { name: "业务域知识库", desc: "自动检索业务规则和历史文档", selected: true },
  { name: "用例规范库", desc: "遵循团队用例编写规范", selected: true },
  { name: "优先级模型", desc: "基于需求风险评估自动定级", selected: false },
  { name: "相似用例推荐", desc: "复用历史高分用例作参考", selected: true },
];

export const mockDimensions: MockDimension[] = [
  { name: "功能测试", active: true }, { name: "异常测试", active: true },
  { name: "边界测试", active: true }, { name: "兼容测试", active: false },
  { name: "性能测试", active: false }, { name: "安全测试", active: false },
];

export const mockQuickActions: MockQuickAction[] = [
  { icon: "🔍", label: "补充边界场景" },
  { icon: "⚠️", label: "增加异常覆盖" },
  { icon: "✂️", label: "精简步骤描述" },
  { icon: "🔼", label: "提升P0覆盖率" },
  { icon: "🔒", label: "增加安全场景" },
  { icon: "📱", label: "补充兼容测试" },
];

export const mockRecords: MockRecord[] = [
  { time: "05-25 14:32", user: "张小明", req: "用户登录与权限管理", count: 48, score: 92, tokens: 4238, scheme: "B" },
  { time: "05-25 11:18", user: "李雅婷", req: "商品详情页改版", count: 32, score: 85, tokens: 3102, scheme: "A" },
];

export const mockKBTabs: string[] = ["业务知识", "历史用例", "用例规范", "Prompt 模板"];
export const mockKBTags: string[] = ["认证", "支付", "订单", "商品", "通用", "冒烟", "安全", "性能"];

export const mockKBItems: MockKBItem[][] = [
  [
    { name: "用户身份认证业务规则 v2.1", date: "2026-05-20", tags: ["认证", "安全"], refs: 47 },
    { name: "订单状态流转规则手册", date: "2026-05-15", tags: ["订单", "流程"], refs: 38 },
  ],
  [
    { name: "登录鉴权测试用例集 v3", date: "2026-05-22", tags: ["登录", "冒烟"], refs: 63 },
    { name: "商品购买全链路用例", date: "2026-05-18", tags: ["电商", "E2E"], refs: 41 },
  ],
  [],
];

export const mockPromptTemplates: MockPromptTemplate[] = [
  {
    name: "标准用例生成 Prompt", version: "v2.3", active: true, usage: 412, avgScore: 89, date: "2026-05-20",
    content: "你是一个专业的软件测试工程师...",
  },
];
