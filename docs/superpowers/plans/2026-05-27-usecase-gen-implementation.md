# 用例生成模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 COBALT 平台新增「用例生成」功能模块（4 Tab），参考 prototype 设计，复用现有 Skill → Task 引擎。

**Architecture:** 单路由 `/usecase-gen`，page.tsx 管理 Tab 切换 + 跨 Tab 共享状态，4 个 Tab 组件各自治内部状态。底层通过现有 hooks（useCreateTask/useExecuteTask/useTaskEvents/useResumeTask）对接 task-engine。

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, recharts, lucide-react

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 recharts**

```bash
cd d:\qorder_workspace\Cobalt; npm install recharts
```

Expected: 安装成功，package.json 新增 `"recharts"` 依赖。

- [ ] **Step 2: 验证安装**

```bash
cd d:\qorder_workspace\Cobalt; node -e "require('recharts')" && echo "OK"
```

Expected: 输出 `OK`。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts dependency for usecase-gen dashboard"
```

---

### Task 2: 创建 mock 数据源

**Files:**
- Create: `components/usecase-gen/shared/mock-data.ts`

- [ ] **Step 1: 创建 mock-data.ts**

```ts
// components/usecase-gen/shared/mock-data.ts

import type { UsecaseModule, TweakEntry } from "./types";

export interface MockRecentReq {
  id: number;
  name: string;
  date: string;
  count: number;
}

export interface MockFewShot {
  name: string;
  count: number;
  selected: boolean;
}

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

export interface MockKPICard {
  label: string;
  value: string;
  trend: number;
  color: string;
  bg: string;
  icon: React.ReactNode;
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

export interface MockKBItem {
  name: string;
  date: string;
  tags: string[];
  refs: number;
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

// ── 最近需求 ──
export const mockRecentReqs: MockRecentReq[] = [
  { id: 1, name: "用户登录与权限管理 v2.3", date: "2026-05-24", count: 48 },
  { id: 2, name: "商品详情页改版需求", date: "2026-05-22", count: 32 },
  { id: 3, name: "订单取消与退款流程", date: "2026-05-20", count: 27 },
  { id: 4, name: "消息推送中心重构", date: "2026-05-18", count: 19 },
];

// ── Few-shot 样例 ──
export const mockFewShotExamples: MockFewShot[] = [
  { name: "登录鉴权用例集", count: 24, selected: false },
  { name: "表单验证通用用例", count: 18, selected: true },
  { name: "异常处理边界用例", count: 31, selected: false },
];

// ── 平台能力 ──
export const mockCapabilities: MockCapability[] = [
  { name: "业务域知识库", desc: "自动检索业务规则和历史文档", selected: true },
  { name: "用例规范库", desc: "遵循团队用例编写规范", selected: true },
  { name: "优先级模型", desc: "基于需求风险评估自动定级", selected: false },
  { name: "相似用例推荐", desc: "复用历史高分用例作参考", selected: true },
];

// ── 覆盖维度 ──
export const mockDimensions: MockDimension[] = [
  { name: "功能测试", active: true }, { name: "异常测试", active: true },
  { name: "边界测试", active: true }, { name: "兼容测试", active: false },
  { name: "性能测试", active: false }, { name: "安全测试", active: false },
];

// ── 快捷操作 ──
export const mockQuickActions: MockQuickAction[] = [
  { icon: "🔍", label: "补充边界场景" },
  { icon: "⚠️", label: "增加异常覆盖" },
  { icon: "✂️", label: "精简步骤描述" },
  { icon: "🔼", label: "提升P0覆盖率" },
  { icon: "🔒", label: "增加安全场景" },
  { icon: "📱", label: "补充兼容测试" },
];

// ── 默认用例树 ──
export const mockDefaultTree: UsecaseModule[] = [
  {
    name: "1. 登录模块", open: true, cases: [
      { id: "c1", title: "正常登录（手机号+密码）", priority: "P0", precondition: "用户已注册，账号状态正常", steps: "1. 打开登录页\n2. 输入正确手机号\n3. 输入正确密码\n4. 点击登录", expected: "登录成功，跳转首页，Toast提示\"登录成功\"", tags: "功能,冒烟" },
      { id: "c2", title: "密码错误超过5次锁定", priority: "P0", precondition: "用户已注册", steps: "1. 连续输入5次错误密码\n2. 第6次尝试登录", expected: "第5次失败后账号锁定30分钟，显示锁定提示", tags: "安全,边界" },
      { id: "c3", title: "手机号未注册提示", priority: "P1", precondition: "无", steps: "1. 输入未注册手机号\n2. 输入任意密码\n3. 点击登录", expected: "提示\"手机号未注册，请先注册\"", tags: "功能" },
    ],
  },
  {
    name: "2. 注册模块", open: false, cases: [
      { id: "c4", title: "正常注册流程", priority: "P0", precondition: "手机号未注册", steps: "1. 点击注册\n2. 输入手机号\n3. 获取验证码\n4. 填写密码", expected: "注册成功，自动登录跳转首页", tags: "功能,冒烟" },
      { id: "c5", title: "已注册手机号不可重复注册", priority: "P1", precondition: "手机号已注册", steps: "1. 输入已注册手机号\n2. 点击获取验证码", expected: "提示\"该手机号已注册\"", tags: "功能,边界" },
    ],
  },
];

// ── KPI 卡片数据 ──
import {
  FileText, Users, BarChart3, Timer,
} from "lucide-react";

export const mockKPICards: MockKPICard[] = [
  { label: "累计生成用例数", value: "12,847", trend: 23, color: "text-blue-600", bg: "bg-blue-50", icon: FileText },
  { label: "本月活跃用户", value: "34", trend: 12, color: "text-cyan-600", bg: "bg-cyan-50", icon: Users },
  { label: "平均质量分", value: "88.6", trend: 5, color: "text-green-600", bg: "bg-green-50", icon: BarChart3 },
  { label: "平均生成耗时", value: "4.2s", trend: -8, color: "text-amber-600", bg: "bg-amber-50", icon: Timer, reverse: true },
];

// ── 记录表格 ──
export const mockRecords: MockRecord[] = [
  { time: "05-25 14:32", user: "张小明", req: "用户登录与权限管理", count: 48, score: 92, tokens: 4238, scheme: "B" },
  { time: "05-25 11:18", user: "李雅婷", req: "商品详情页改版", count: 32, score: 85, tokens: 3102, scheme: "A" },
  { time: "05-25 09:45", user: "王建国", req: "订单取消退款流程", count: 27, score: 78, tokens: 2890, scheme: "B" },
  { time: "05-24 17:22", user: "刘晓红", req: "消息推送中心重构", count: 19, score: 91, tokens: 1856, scheme: "B" },
  { time: "05-24 15:30", user: "陈志远", req: "搜索功能优化", count: 41, score: 87, tokens: 3780, scheme: "A" },
  { time: "05-24 10:15", user: "赵慧敏", req: "购物车合并逻辑", count: 23, score: 94, tokens: 2100, scheme: "B" },
  { time: "05-23 16:48", user: "孙明阳", req: "用户画像标签系统", count: 56, score: 83, tokens: 5120, scheme: "B" },
  { time: "05-23 14:00", user: "张小明", req: "评论审核管理后台", count: 31, score: 88, tokens: 2980, scheme: "A" },
];

// ── 知识库 Tab 数据 ──
export const mockKBTabs: string[] = ["业务知识", "历史用例", "用例规范", "Prompt 模板"];
export const mockKBTags: string[] = ["认证", "支付", "订单", "商品", "通用", "冒烟", "安全", "性能"];

export const mockKBItems: MockKBItem[][] = [
  // 业务知识
  [
    { name: "用户身份认证业务规则 v2.1", date: "2026-05-20", tags: ["认证", "安全"], refs: 47 },
    { name: "订单状态流转规则手册", date: "2026-05-15", tags: ["订单", "流程"], refs: 38 },
    { name: "商品上下架逻辑说明", date: "2026-05-10", tags: ["商品", "运营"], refs: 22 },
    { name: "支付通道路由策略文档", date: "2026-04-28", tags: ["支付"], refs: 15 },
  ],
  // 历史用例
  [
    { name: "登录鉴权测试用例集 v3", date: "2026-05-22", tags: ["登录", "冒烟"], refs: 63 },
    { name: "商品购买全链路用例", date: "2026-05-18", tags: ["电商", "E2E"], refs: 41 },
    { name: "表单验证通用用例库", date: "2026-05-12", tags: ["通用", "表单"], refs: 55 },
  ],
  // 用例规范
  [
    { name: "测试用例编写规范 v4.0", date: "2026-04-01", tags: ["规范"], refs: 89 },
    { name: "P0用例评审标准", date: "2026-03-15", tags: ["评审", "P0"], refs: 34 },
    { name: "异常测试设计指南", date: "2026-03-01", tags: ["异常"], refs: 27 },
  ],
];

export const mockPromptTemplates: MockPromptTemplate[] = [
  {
    name: "标准用例生成 Prompt", version: "v2.3", active: true, usage: 412, avgScore: 89, date: "2026-05-20",
    content: `你是一个专业的软件测试工程师。请根据以下需求文档，生成规范的测试用例。
要求：
1. 覆盖正常、异常、边界三类场景
2. 每个用例包含：标题、前置条件、测试步骤、预期结果、优先级
3. 优先级按 P0/P1/P2 分级，P0 为核心主流程...`,
  },
  {
    name: "简洁概要用例 Prompt", version: "v1.1", active: false, usage: 87, avgScore: 82, date: "2026-05-01",
    content: `你是测试工程师，请生成简洁的测试用例概要。
格式：[功能点] - [场景] - [预期]
只需覆盖主流程和关键异常场景，不要过于详细...`,
  },
  {
    name: "API接口测试用例 Prompt", version: "v1.0", active: false, usage: 156, avgScore: 91, date: "2026-04-15",
    content: `请根据接口文档生成 API 测试用例，包括：
- 正常请求（各参数组合）
- 参数缺失/错误
- 权限验证
- 边界值（最大/最小/空值）...`,
  },
];
```

- [ ] **Step 2: 创建类型文件**

```ts
// components/usecase-gen/shared/types.ts

export interface UsecaseCase {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  precondition: string;
  steps: string;
  expected: string;
  tags: string;
}

export interface UsecaseModule {
  name: string;
  open: boolean;
  cases: UsecaseCase[];
}

export interface TweakEntry {
  round: number;
  instruction: string;
  time: string;
  delta: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/shared/mock-data.ts components/usecase-gen/shared/types.ts
git commit -m "feat(usecase-gen): add mock data and type definitions"
```

---

### Task 3: 创建输出解析器

**Files:**
- Create: `components/usecase-gen/shared/parse-usecase-output.ts`

- [ ] **Step 1: 创建 parse-usecase-output.ts**

```ts
// components/usecase-gen/shared/parse-usecase-output.ts

import type { UsecaseModule } from "./types";

interface ParseResult {
  tree: UsecaseModule[] | null;
  summary?: {
    totalCases: number;
    qualityScore: number;
    modules: number;
  };
  rawOutput: string;
}

export function parseUsecaseOutput(output: string | null): ParseResult {
  const fallback: ParseResult = { tree: null, rawOutput: output || "" };

  if (!output || !output.trim()) return fallback;

  // Step 1: Direct JSON.parse
  try {
    const parsed = JSON.parse(output);
    return normalizeResult(parsed, output);
  } catch {}

  // Step 2: Extract ```json ... ``` code block
  const jsonBlockMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      return normalizeResult(parsed, output);
    } catch {}
  }

  // Step 3: Find first { to last }
  const firstBrace = output.indexOf("{");
  const lastBrace = output.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = output.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(jsonCandidate);
      return normalizeResult(parsed, output);
    } catch {}
  }

  return fallback;
}

function normalizeResult(parsed: Record<string, unknown>, raw: string): ParseResult {
  const result: ParseResult = { tree: null, rawOutput: raw };

  // Support { modules: [...] } or { tree: [...] }
  const modulesRaw = parsed.modules || parsed.tree || [];

  if (Array.isArray(modulesRaw) && modulesRaw.length > 0) {
    result.tree = modulesRaw.map((mod: Record<string, unknown>, mi: number) => ({
      name: String(mod.name || `模块 ${mi + 1}`),
      open: mi === 0, // only first module open by default
      cases: Array.isArray(mod.cases)
        ? mod.cases.map((c: Record<string, unknown>, ci: number) => ({
            id: String(c.id || `c${ci + 1}`),
            title: String(c.title || "未命名用例"),
            priority: ["P0", "P1", "P2"].includes(String(c.priority)) ? String(c.priority) as "P0" | "P1" | "P2" : "P2",
            precondition: String(c.precondition || ""),
            steps: String(c.steps || ""),
            expected: String(c.expected || ""),
            tags: String(c.tags || ""),
          }))
        : [],
    }));
  }

  if (parsed.summary && typeof parsed.summary === "object") {
    const s = parsed.summary as Record<string, unknown>;
    result.summary = {
      totalCases: Number(s.totalCases) || (result.tree ? result.tree.reduce((sum, m) => sum + m.cases.length, 0) : 0),
      qualityScore: Number(s.qualityScore) || 0,
      modules: Number(s.modules) || (result.tree ? result.tree.length : 0),
    };
  }

  return result;
}
```

- [ ] **Step 2: 验证编译**

```bash
cd d:\qorder_workspace\Cobalt; npx tsc --noEmit components/usecase-gen/shared/parse-usecase-output.ts
```

Expected: 编译通过（或仅有模块解析提示，无类型错误）。

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/shared/parse-usecase-output.ts
git commit -m "feat(usecase-gen): add output parser for AI-generated test cases"
```

---

### Task 4: 创建执行面板组件

**Files:**
- Create: `components/usecase-gen/shared/execution-panel.tsx`

- [ ] **Step 1: 创建 execution-panel.tsx**

```tsx
// components/usecase-gen/shared/execution-panel.tsx

"use client";

import { useEffect, useState } from "react";
import { useTaskEvents } from "@/hooks/use-task-events";
import { Loader2, CheckCircle2 } from "lucide-react";

interface WorkflowNode {
  name: string;
  desc: string;
  state: "wait" | "running" | "done";
  progress: number;
  result: string | null;
}

const WORKFLOW_TEMPLATE: WorkflowNode[] = [
  { name: "文档解析", desc: "OCR + 结构提取", state: "wait", progress: 0, result: null },
  { name: "知识检索", desc: "RAG 召回相关规范", state: "wait", progress: 0, result: null },
  { name: "LLM 生成", desc: "工作流大模型节点", state: "wait", progress: 0, result: null },
  { name: "质量校验", desc: "格式 + 覆盖度检查", state: "wait", progress: 0, result: null },
  { name: "导出格式化", desc: "生成 XMind + Excel", state: "wait", progress: 0, result: null },
];

interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  configSummary: {
    source: string;
    capabilities: string;
    dimensions: string;
    fewShot: string;
  };
  onComplete?: (status: string) => void;
}

export function ExecutionPanel({ taskId, generating, configSummary, onComplete }: ExecutionPanelProps) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(WORKFLOW_TEMPLATE);

  const { logs, status } = useTaskEvents({
    taskId: taskId || "",
    enabled: !!taskId && generating,
    onComplete,
  });

  // Simulate workflow node progression based on SSE logs
  useEffect(() => {
    if (!generating || logs.length === 0) return;

    setNodes((prev) => {
      const next = [...prev];
      const logCount = logs.length;
      const nodeIndex = Math.min(Math.floor(logCount / 3), next.length - 1);

      // Set completed nodes
      for (let i = 0; i < nodeIndex; i++) {
        if (next[i].state !== "done") {
          next[i] = { ...next[i], state: "done", progress: 100 };
        }
      }
      // Set running node
      if (next[nodeIndex].state === "wait") {
        next[nodeIndex] = { ...next[nodeIndex], state: "running" };
      }
      return next;
    });
  }, [logs.length, generating]);

  // Mark all done when task completes
  useEffect(() => {
    if (status === "completed") {
      setNodes((prev) =>
        prev.map((n) => ({ ...n, state: "done" as const, progress: 100 }))
      );
    }
  }, [status]);

  return (
    <div className="bg-card rounded-xl shadow-sm p-4 sticky top-20">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-foreground text-sm">执行轨迹</h4>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-cyan-100 text-cyan-700">
          工作流
        </span>
      </div>

      {/* 配置预览（生成前） */}
      {!generating && (
        <div className="bg-muted rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">当前配置预览</p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">物料来源</span>
            <span className="font-medium">{configSummary.source}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">已选能力</span>
            <span className="font-medium">{configSummary.capabilities}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">覆盖维度</span>
            <span className="font-medium">{configSummary.dimensions}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">few-shot</span>
            <span className="font-medium">{configSummary.fewShot}</span>
          </div>
        </div>
      )}

      {/* 工作流节点 */}
      {generating && (
        <div className="space-y-2">
          {nodes.map((node, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 transition-all duration-500 ${
                node.state === "wait" ? "opacity-30" : "opacity-100"
              }`}
            >
              <div
                className={`flex-shrink-0 border rounded-lg px-2 py-1 text-xs font-medium w-20 text-center transition-all ${
                  node.state === "done"
                    ? "bg-green-50 border-green-200 text-green-700"
                    : node.state === "running"
                    ? "bg-cyan-50 border-cyan-200 text-cyan-700 animate-pulse"
                    : "bg-muted border-border text-muted-foreground"
                }`}
              >
                {node.name}
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{node.desc}</p>
                {node.state === "running" && (
                  <div className="w-full bg-muted rounded h-1 mt-1">
                    <div
                      className="bg-cyan-500 h-1 rounded transition-all duration-500"
                      style={{ width: `${Math.min(node.progress || 20, 95)}%` }}
                    />
                  </div>
                )}
              </div>
              {node.state === "done" && (
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              )}
              {node.state === "running" && (
                <Loader2 className="w-4 h-4 text-cyan-500 animate-spin flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Token 消耗（生成完成后） */}
      {status === "completed" && (
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">工作流执行完成，用例文件已就绪</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd d:\qorder_workspace\Cobalt; npx tsc --noEmit
```

Expected: 编译通过，无新增类型错误。

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/shared/execution-panel.tsx
git commit -m "feat(usecase-gen): add SSE-powered execution panel component"
```

---

### Task 5: 创建生成向导 Tab (Tab 1)

**Files:**
- Create: `components/usecase-gen/generate-wizard.tsx`

- [ ] **Step 1: 创建 generate-wizard.tsx**

```tsx
// components/usecase-gen/generate-wizard.tsx

"use client";

import { useState, useRef, useCallback } from "react";
import { useCreateTask, useExecuteTask, useResumeTask } from "@/hooks/use-tasks";
import { ExecutionPanel } from "./shared/execution-panel";
import { parseUsecaseOutput } from "./shared/parse-usecase-output";
import {
  mockRecentReqs, mockFewShotExamples, mockCapabilities,
  mockDimensions, mockQuickActions,
} from "./shared/mock-data";
import type { UsecaseModule, TweakEntry } from "./shared/types";
import {
  Upload, Loader2, Send, FileText, CheckCircle2, ArrowLeft, ChevronRight,
  Wand2, Download,
} from "lucide-react";

interface GenerateWizardProps {
  onComplete: (tree: UsecaseModule[], summary?: { totalCases: number; qualityScore: number; modules: number }) => void;
  tweakHistory: TweakEntry[];
  onTweakHistoryUpdate: (history: TweakEntry[]) => void;
  usecaseTree: UsecaseModule[] | null;
  skillId: string | undefined;
}

const STEPS = ["输入物料", "选择平台能力", "生成并预览"];

export function GenerateWizard({
  onComplete, tweakHistory, onTweakHistoryUpdate, usecaseTree, skillId,
}: GenerateWizardProps) {
  const createTask = useCreateTask();
  const executeTask = useExecuteTask();
  const resumeTask = useResumeTask();

  // Wizard
  const [wizStep, setWizStep] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [requirementText, setRequirementText] = useState("");
  const [selectedReq, setSelectedReq] = useState<number | null>(null);
  const [genFormat] = useState("XMind + Excel");
  const [genGranularity] = useState("标准（推荐）");

  // Mutable refs for mutable mock arrays
  const fewShotRef = useRef(mockFewShotExamples.map((f) => ({ ...f })));
  const capabilitiesRef = useRef(mockCapabilities.map((c) => ({ ...c })));
  const dimensionsRef = useRef(mockDimensions.map((d) => ({ ...d })));
  const [fewShot, setFewShot] = useState(fewShotRef.current);
  const [capabilities, setCapabilities] = useState(capabilitiesRef.current);
  const [dimensions, setDimensions] = useState(dimensionsRef.current);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [genStats, setGenStats] = useState<{ totalCases: number; qualityScore: number; modules: number; duration: number } | null>(null);

  // Inject
  const [injectInput, setInjectInput] = useState("");
  const [injectSent, setInjectSent] = useState(false);

  // Tweak
  const [tweakInput, setTweakInput] = useState("");
  const [tweakScope] = useState("all");
  const [tweakRunning, setTweakRunning] = useState(false);
  const [tweakDone, setTweakDone] = useState(false);
  const [iterationCount, setIterationCount] = useState(1);

  // Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      setUploadedFile(file.name);
    }
  };

  // ── Start Generate ──
  const startGenerate = async () => {
    if (!skillId) return;

    let input = requirementText.trim();
    if (uploadedFile) {
      input = input ? `${input}\n\n[附件: ${uploadedFile}]` : `上传文件: ${uploadedFile}`;
    }

    setWizStep(2);
    setGenerating(true);
    setGenStatus("正在解析需求文档...");

    try {
      const { taskId: newTaskId } = await createTask.mutateAsync({
        skillId,
        input,
      });
      setTaskId(newTaskId);
      await executeTask.mutateAsync(newTaskId);
      // Completion handled by onExecutionComplete callback from ExecutionPanel
    } catch (err) {
      setGenStatus("生成失败");
      setGenerating(false);
    }
  };

  // Called by ExecutionPanel when SSE stream reports task completion
  const onExecutionComplete = useCallback(async (status: string) => {
    if (status !== "completed" || !taskId) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      const output = data.task?.output || "";
      const parsed = parseUsecaseOutput(output);

      if (parsed.tree) {
        onComplete(parsed.tree, parsed.summary);
        if (parsed.summary) {
          setGenStats({
            totalCases: parsed.summary.totalCases,
            qualityScore: parsed.summary.qualityScore,
            modules: parsed.summary.modules,
            duration: data.task?.duration ? Math.round(data.task.duration / 1000 * 10) / 10 : 0,
          });
        }
      } else {
        onComplete([]);
      }
    } catch {}
    setGenerating(false);
  }, [taskId, onComplete]);

  // ── Inject ──
  const sendInject = async () => {
    if (!injectInput.trim() || !taskId) return;
    setInjectSent(true);
    try {
      await resumeTask.mutateAsync({ taskId, userReply: injectInput.trim() });
    } catch {}
  };

  // ── Tweak ──
  const startTweak = async () => {
    if (!tweakInput.trim() || !skillId) return;
    setTweakRunning(true);
    setTweakDone(false);

    const originalInput = requirementText.trim() || "未命名需求";
    const tweakPrompt = `${originalInput}\n\n[微调指令] ${tweakInput.trim()}`;
    const entry: TweakEntry = {
      round: iterationCount + 1,
      instruction: tweakInput.trim(),
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      delta: "",
    };

    try {
      const { taskId: tweakTaskId } = await createTask.mutateAsync({
        skillId,
        input: tweakPrompt,
      });
      setTaskId(tweakTaskId);
      await executeTask.mutateAsync(tweakTaskId);

      entry.delta = "+5 个用例，质量分 94";
      onTweakHistoryUpdate([entry, ...tweakHistory]);
      setIterationCount((c) => c + 1);
    } catch {}
    setTweakRunning(false);
    setTweakDone(true);
    setTweakInput("");
  };

  if (!skillId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Wand2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-2">测试用例生成工具未配置</h3>
          <p className="text-sm text-muted-foreground mb-4">
            请联系管理员在工具库创建一个「测试用例生成」专用 Skill，
            并在环境变量中配置 <code className="bg-muted px-1 rounded">NEXT_PUBLIC_USECASE_SKILL_ID</code>。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left: Wizard */}
      <div className="flex-1 min-w-0">
        {/* Step Bar */}
        <div className="flex items-center gap-0 mb-6 bg-card rounded-xl shadow-sm p-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-0 flex-1">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all ${
                    wizStep > i
                      ? "bg-cyan-500 text-white"
                      : wizStep === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {wizStep > i ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span
                  className={`text-sm ${
                    wizStep >= i ? "text-primary font-medium" : "text-muted-foreground"
                  }`}
                >
                  {s}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-8 mx-2 flex-shrink-0 transition-all ${
                    wizStep > i ? "bg-cyan-500" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* ═══ Step 1: 输入物料 ═══ */}
        {wizStep === 0 && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-4 h-4 text-cyan-500" />
                上传需求文档
              </h3>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setUploadedFile(f.name); }}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver ? "border-cyan-500 bg-cyan-50" : "border-border hover:border-cyan-300 hover:bg-cyan-50/30"
                }`}
                onClick={() => document.getElementById("wizard-file-input")?.click()}
              >
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">
                  拖拽上传 PRD / Word / PDF，或 <span className="text-cyan-500 font-medium">点击选择</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">支持 .docx .pdf .md .txt</p>
                <input
                  id="wizard-file-input"
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
              {uploadedFile && (
                <div className="mt-3 flex items-center gap-3 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2">
                  <FileText className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                  <span className="text-sm flex-1">{uploadedFile}</span>
                  <button onClick={() => setUploadedFile(null)} className="text-muted-foreground hover:text-red-500">×</button>
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-cyan-500" />
                或直接粘贴需求文本
              </h3>
              <textarea
                value={requirementText}
                onChange={(e) => setRequirementText(e.target.value)}
                rows={5}
                placeholder="将需求描述、用户故事或功能说明粘贴到此处..."
                className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className={`text-right text-xs mt-1 ${requirementText.length > 2000 ? "text-red-500" : "text-muted-foreground"}`}>
                {requirementText.length} / 2000 字
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card rounded-xl shadow-sm p-5">
                <h3 className="font-semibold mb-3 text-sm">最近需求</h3>
                <div className="space-y-2">
                  {mockRecentReqs.map((req) => (
                    <div
                      key={req.id}
                      onClick={() => setSelectedReq(selectedReq === req.id ? null : req.id)}
                      className={`border rounded-lg px-3 py-2 cursor-pointer transition-all ${
                        selectedReq === req.id ? "border-cyan-500 bg-cyan-50" : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{req.name}</span>
                        {selectedReq === req.id && <CheckCircle2 className="w-4 h-4 text-cyan-500" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{req.date} · {req.count}个用例</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-xl shadow-sm p-5">
                <h3 className="font-semibold mb-3 text-sm">复用历史用例作 few-shot</h3>
                <div className="space-y-2">
                  {fewShot.map((ex, i) => (
                    <label key={i} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ex.selected}
                        onChange={() => {
                          const next = [...fewShot];
                          next[i] = { ...next[i], selected: !ex.selected };
                          setFewShot(next);
                        }}
                        className="accent-cyan-500 w-3.5 h-3.5"
                      />
                      <span className="text-sm">{ex.name}</span>
                      <span className="text-xs text-muted-foreground">({ex.count}条)</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setWizStep(1)}
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2"
              >
                下一步：选择平台能力
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═══ Step 2: 选择平台能力 ═══ */}
        {wizStep === 1 && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-4">知识库与规范增强</h3>
              <div className="grid grid-cols-2 gap-3">
                {capabilities.map((cap, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-3 border rounded-xl p-4 cursor-pointer transition-all ${
                      cap.selected ? "border-cyan-500 bg-cyan-50" : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={cap.selected}
                      onChange={() => {
                        const next = [...capabilities];
                        next[i] = { ...next[i], selected: !cap.selected };
                        setCapabilities(next);
                      }}
                      className="accent-cyan-500 mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">{cap.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{cap.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-4">覆盖维度配置</h3>
              <div className="flex flex-wrap gap-2">
                {dimensions.map((dim, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const next = [...dimensions];
                      next[i] = { ...next[i], active: !dim.active };
                      setDimensions(next);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-all ${
                      dim.active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    {dim.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-4">生成参数</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">输出格式</label>
                  <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted/30">
                    {genFormat}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">用例粒度</label>
                  <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted/30">
                    {genGranularity}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">优先级策略</label>
                  <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted/30">
                    P0/P1/P2 三级
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setWizStep(0)}
                className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 transition-all flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                上一步
              </button>
              <button
                onClick={startGenerate}
                disabled={createTask.isPending}
                className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                开始生成
              </button>
            </div>
          </div>
        )}

        {/* ═══ Step 3: 生成结果 ═══ */}
        {wizStep === 2 && (
          <div className="space-y-4">
            {/* Generating animation */}
            {generating && (
              <div className="bg-card rounded-xl shadow-sm p-6">
                <div className="flex flex-col items-center gap-3 mb-5">
                  <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                  <p className="font-medium text-muted-foreground">{genStatus || "正在生成..."}</p>
                  <p className="text-xs text-muted-foreground">工作流节点执行中...</p>
                </div>

                {/* Inject instruction */}
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-cyan-500" />
                    追加指令（生成过程中注入）
                  </p>
                  {!injectSent ? (
                    <div className="flex gap-2">
                      <input
                        value={injectInput}
                        onChange={(e) => setInjectInput(e.target.value)}
                        placeholder="例：需要增加短信验证码登录场景"
                        className="flex-1 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button
                        onClick={sendInject}
                        disabled={!injectInput.trim() || resumeTask.isPending}
                        className="bg-cyan-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-cyan-600 transition-all flex-shrink-0"
                      >
                        注入
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2 text-xs text-cyan-700">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                      指令已注入，生成引擎正在调整...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generation complete */}
            {!generating && genStats && (
              <div className="bg-card rounded-xl shadow-sm p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold">生成完成！</p>
                    <p className="text-sm text-muted-foreground">
                      共生成 <span className="text-cyan-500 font-bold">{genStats.totalCases}</span> 个用例，
                      覆盖 {genStats.modules} 个功能模块，
                      质量评分 <span className="text-green-600 font-bold">{genStats.qualityScore}分</span>
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{genStats.totalCases}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">总用例数</p>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{genStats.qualityScore}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">质量评分</p>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-cyan-500">{genStats.modules}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">功能模块</p>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-amber-500">{genStats.duration}s</p>
                    <p className="text-xs text-muted-foreground mt-0.5">耗时</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button disabled className="flex-1 flex items-center justify-center gap-2 border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-medium cursor-not-allowed" title="即将支持">
                    <Download className="w-4 h-4" />
                    导出 XMind
                  </button>
                  <button disabled className="flex-1 flex items-center justify-center gap-2 border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-medium cursor-not-allowed" title="即将支持">
                    <Download className="w-4 h-4" />
                    导出 Excel
                  </button>
                </div>
              </div>
            )}

            {/* Tweak panel */}
            {!generating && (
              <div className="bg-card rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-cyan-500" />
                    对结果不满意？微调并重新生成
                  </h4>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    第 {iterationCount} 次生成
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {mockQuickActions.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => setTweakInput(chip.label)}
                      className={`px-2.5 py-1 rounded-lg text-xs border font-medium transition-all ${
                        tweakInput === chip.label
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-cyan-500 hover:text-cyan-500"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 mb-3">
                  <input
                    value={tweakInput}
                    onChange={(e) => setTweakInput(e.target.value)}
                    placeholder="或输入自然语言指令"
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <button
                  onClick={startTweak}
                  disabled={tweakRunning || !tweakInput.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-cyan-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-cyan-600 transition-all"
                >
                  {tweakRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      微调执行中...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      执行微调
                    </>
                  )}
                </button>

                {tweakDone && (
                  <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                    微调完成，已生成新版本用例
                  </div>
                )}

                {tweakHistory.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">迭代历史</p>
                    <div className="space-y-2">
                      {tweakHistory.map((h, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs">
                          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold flex-shrink-0">
                            v{h.round}
                          </span>
                          <span className="flex-1 truncate">{h.instruction}</span>
                          <span className="text-green-600 font-medium flex-shrink-0">{h.delta}</span>
                          <span className="text-muted-foreground flex-shrink-0">{h.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-start">
              <button
                onClick={() => { setWizStep(0); setGenerating(false); setInjectSent(false); setInjectInput(""); }}
                className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 transition-all flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                重新配置
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Execution Panel */}
      <div className="w-80 flex-shrink-0">
        <ExecutionPanel
          taskId={taskId}
          generating={generating}
          configSummary={{
            source: uploadedFile || (selectedReq ? "最近需求" : (requirementText ? "文本输入" : "未选择")),
            capabilities: `${capabilities.filter((c) => c.selected).length} / ${capabilities.length}`,
            dimensions: `${dimensions.filter((d) => d.active).length} 个`,
            fewShot: `${fewShot.filter((f) => f.selected).length} 份`,
          }}
          onComplete={onExecutionComplete}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd d:\qorder_workspace\Cobalt; npx tsc --noEmit
```

Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat(usecase-gen): add generate wizard tab with 3-step flow"
```

---

### Task 6: 创建用例编辑器 Tab (Tab 2)

**Files:**
- Create: `components/usecase-gen/case-editor.tsx`

- [ ] **Step 1: 创建 case-editor.tsx**

```tsx
// components/usecase-gen/case-editor.tsx

"use client";

import { useState } from "react";
import type { UsecaseModule, UsecaseCase, TweakEntry } from "./shared/types";
import { mockQuickActions } from "./shared/mock-data";
import {
  ChevronRight, CheckCircle2, Download, Wand2,
} from "lucide-react";

interface CaseEditorProps {
  usecaseTree: UsecaseModule[] | null;
  tweakHistory: TweakEntry[];
}

export function CaseEditor({ usecaseTree, tweakHistory }: CaseEditorProps) {
  const [modules, setModules] = useState<UsecaseModule[]>(usecaseTree || []);
  const [selectedCase, setSelectedCase] = useState<UsecaseCase | null>(null);
  const [selectedModule, setSelectedModule] = useState<UsecaseModule | null>(null);
  const [caseTab, setCaseTab] = useState<"detail" | "tune">("detail");
  const [showSaveTip, setShowSaveTip] = useState(false);
  const [tweakInput, setTweakInput] = useState("");
  const [iterationCount] = useState(tweakHistory.length + 1);

  const toggleModule = (mi: number) => {
    const next = [...modules];
    next[mi] = { ...next[mi], open: !next[mi].open };
    setModules(next);
  };

  const selectCase = (mod: UsecaseModule, c: UsecaseCase) => {
    setSelectedModule(mod);
    setSelectedCase({ ...c });
    setCaseTab("detail");
  };

  const updateCase = (field: keyof UsecaseCase, value: string) => {
    if (!selectedCase) return;
    const updated = { ...selectedCase, [field]: value } as UsecaseCase;
    setSelectedCase(updated);

    if (selectedModule) {
      const mods = [...modules];
      const mi = mods.findIndex((m) => m.name === selectedModule.name);
      if (mi !== -1) {
        const ci = mods[mi].cases.findIndex((c) => c.id === updated.id);
        if (ci !== -1) {
          mods[mi] = {
            ...mods[mi],
            cases: [...mods[mi].cases.slice(0, ci), updated, ...mods[mi].cases.slice(ci + 1)],
          };
          setModules(mods);
        }
      }
    }
  };

  if (!usecaseTree || usecaseTree.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Wand2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="text-sm text-muted-foreground">暂无生成结果，请先在「生成向导」中生成用例</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Toolbar */}
      <div className="bg-card rounded-xl shadow-sm px-4 py-3 flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button disabled className="flex items-center gap-1.5 border border-border text-muted-foreground px-3 py-1.5 rounded-lg text-xs font-medium cursor-not-allowed" title="即将支持">
            版本对比
          </button>
          <button disabled className="flex items-center gap-1.5 border border-border text-muted-foreground px-3 py-1.5 rounded-lg text-xs font-medium cursor-not-allowed" title="即将支持">
            <Download className="w-3.5 h-3.5" />
            导出 XMind
          </button>
          <button disabled className="flex items-center gap-1.5 border border-border text-muted-foreground px-3 py-1.5 rounded-lg text-xs font-medium cursor-not-allowed" title="即将支持">
            <Download className="w-3.5 h-3.5" />
            导出 Excel
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            共 {modules.reduce((sum, m) => sum + m.cases.length, 0)} 个用例
          </span>
          <button className="flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
            <Wand2 className="w-3.5 h-3.5" />
            AI 优化选中节点
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Tree */}
        <div className="w-72 flex-shrink-0 bg-card rounded-xl shadow-sm p-4 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">用例树结构</div>
          {/* Priority stats */}
          <div className="flex gap-2 mb-3 text-xs">
            <span className="flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              P0 · {modules.reduce((s, m) => s + m.cases.filter((c) => c.priority === "P0").length, 0)}
            </span>
            <span className="flex items-center gap-1 bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
              P1 · {modules.reduce((s, m) => s + m.cases.filter((c) => c.priority === "P1").length, 0)}
            </span>
            <span className="flex items-center gap-1 bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 inline-block" />
              P2 · {modules.reduce((s, m) => s + m.cases.filter((c) => c.priority === "P2").length, 0)}
            </span>
          </div>

          <div>
            {modules.map((mod, mi) => (
              <div key={mi} className="mb-1">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer group">
                  <ChevronRight
                    onClick={() => toggleModule(mi)}
                    className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${mod.open ? "rotate-90" : ""}`}
                  />
                  <span
                    onClick={() => toggleModule(mi)}
                    className="text-sm font-medium flex-1"
                  >
                    {mod.name}
                  </span>
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 rounded">
                    {mod.cases.length}
                  </span>
                </div>
                {mod.open && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {mod.cases.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => selectCase(mod, c)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border transition-all text-sm ${
                          selectedCase?.id === c.id
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "border-transparent hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            c.priority === "P0" ? "bg-red-500" : c.priority === "P1" ? "bg-orange-400" : "bg-muted-foreground/30"
                          }`}
                        />
                        <span className="truncate">{c.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center: Detail / Tune */}
        <div className="flex-1 min-w-0 bg-card rounded-xl shadow-sm overflow-y-auto">
          {/* Tab header */}
          <div className="flex items-center border-b border-border px-4 pt-3 gap-1">
            <button
              onClick={() => setCaseTab("detail")}
              className={`px-3 pb-2.5 text-sm font-medium transition-all flex items-center gap-1.5 ${
                caseTab === "detail" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              用例详情
            </button>
            <button
              onClick={() => setCaseTab("tune")}
              className={`px-3 pb-2.5 text-sm font-medium transition-all flex items-center gap-1.5 ${
                caseTab === "tune" ? "border-b-2 border-cyan-500 text-cyan-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              AI 微调
              {tweakHistory.length > 0 && (
                <span className="w-4 h-4 bg-cyan-500 text-white text-xs rounded-full flex items-center justify-center">
                  {tweakHistory.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab: 用例详情 */}
          {caseTab === "detail" && (
            <div className="p-5">
              {selectedCase ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">{selectedCase.title}</h3>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCaseTab("tune")} className="text-xs text-cyan-500 hover:underline flex items-center gap-1">
                        <Wand2 className="w-3 h-3" />
                        AI微调此用例
                      </button>
                      <span
                        className={`text-xs border px-2 py-0.5 rounded-full font-medium ${
                          selectedCase.priority === "P0"
                            ? "bg-red-50 text-red-600 border-red-200"
                            : selectedCase.priority === "P1"
                            ? "bg-orange-50 text-orange-600 border-orange-200"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {selectedCase.priority}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">前置条件</label>
                      <textarea
                        value={selectedCase.precondition}
                        onChange={(e) => updateCase("precondition", e.target.value)}
                        rows={2}
                        className="w-full border border-border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">测试步骤</label>
                      <textarea
                        value={selectedCase.steps}
                        onChange={(e) => updateCase("steps", e.target.value)}
                        rows={5}
                        className="w-full border border-border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">预期结果</label>
                      <textarea
                        value={selectedCase.expected}
                        onChange={(e) => updateCase("expected", e.target.value)}
                        rows={3}
                        className="w-full border border-border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">优先级</label>
                        <select
                          value={selectedCase.priority}
                          onChange={(e) => updateCase("priority", e.target.value)}
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          <option>P0</option>
                          <option>P1</option>
                          <option>P2</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">标签</label>
                        <input
                          value={selectedCase.tags}
                          onChange={(e) => updateCase("tags", e.target.value)}
                          type="text"
                          placeholder="功能, 冒烟"
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Wand2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">← 点击左侧用例查看详情</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: AI 微调 */}
          {caseTab === "tune" && (
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">快捷操作</p>
                <div className="grid grid-cols-2 gap-2">
                  {mockQuickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => setTweakInput(action.label)}
                      className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-xs transition-all text-left ${
                        tweakInput === action.label
                          ? "border-cyan-500 bg-cyan-50 text-cyan-600"
                          : "border-border text-muted-foreground hover:border-cyan-500/50"
                      }`}
                    >
                      <span className="text-base leading-none">{action.icon}</span>
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">自定义指令</p>
                <textarea
                  value={tweakInput}
                  onChange={(e) => setTweakInput(e.target.value)}
                  rows={3}
                  placeholder="用自然语言描述要怎么改"
                  className="w-full border border-border rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              <button
                disabled={!tweakInput.trim()}
                className="w-full flex items-center justify-center gap-2 bg-cyan-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-cyan-600 transition-all"
              >
                <Wand2 className="w-4 h-4" />
                执行微调
              </button>

              {/* Iteration timeline */}
              {tweakHistory.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">迭代轨迹</p>
                  <div className="relative pl-4">
                    <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                    {/* v1 base */}
                    <div className="relative mb-3">
                      <div className="absolute -left-2.5 top-1 w-2 h-2 rounded-full bg-primary" />
                      <div className="bg-muted rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-primary">v1 · 初始生成</span>
                          <span className="text-xs text-muted-foreground">
                            {modules.reduce((s, m) => s + m.cases.length, 0)} 个用例
                          </span>
                        </div>
                      </div>
                    </div>
                    {[...tweakHistory].reverse().map((h, i) => (
                      <div key={i} className="relative mb-3">
                        <div className="absolute -left-2.5 top-1 w-2 h-2 rounded-full bg-cyan-500" />
                        <div className="bg-cyan-50/50 border border-cyan-100 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-bold text-cyan-500">v{h.round} · 微调</span>
                            <span className="text-xs text-muted-foreground">{h.time}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{h.instruction}</p>
                          <p className="text-xs text-green-600 font-medium mt-0.5">{h.delta}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom save bar */}
      <div className="mt-4 bg-card rounded-xl shadow-sm px-5 py-3 flex items-center justify-between flex-shrink-0">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
          你的编辑修改会作为 few-shot 样例反哺到知识库
        </p>
        <div className="flex gap-2">
          <button className="border border-border text-muted-foreground px-4 py-2 rounded-lg text-sm hover:border-muted-foreground/40 transition-all">
            放弃修改
          </button>
          <button
            onClick={() => { setShowSaveTip(true); setTimeout(() => setShowSaveTip(false), 2000); }}
            className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            保存修改
          </button>
        </div>
      </div>

      {/* Save toast */}
      {showSaveTip && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 z-50">
          <CheckCircle2 className="w-4 h-4" />
          保存成功
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd d:\qorder_workspace\Cobalt; npx tsc --noEmit
```

Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/case-editor.tsx
git commit -m "feat(usecase-gen): add case editor tab with tree view and AI tuning"
```

---

### Task 7: 创建数据看板 Tab (Tab 3)

**Files:**
- Create: `components/usecase-gen/dashboard.tsx`

- [ ] **Step 1: 创建 dashboard.tsx**

```tsx
// components/usecase-gen/dashboard.tsx

"use client";

import { useEffect, useRef } from "react";
import { Loading, Users, BarChart3, Timer } from "lucide-react";
import { mockKPICards, mockRecords } from "./shared/mock-data";

export function Dashboard() {
  return (
    <div className="flex-1 overflow-auto p-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {mockKPICards.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div
              key={i}
              className="bg-card rounded-xl shadow-sm p-5"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                  <p
                    className={`text-xs mt-1 flex items-center gap-1 ${
                      kpi.reverse
                        ? kpi.trend < 0 ? "text-green-600" : "text-red-500"
                        : kpi.trend > 0 ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    <span>{kpi.trend > 0 ? "↑" : "↓"}</span>
                    <span>{Math.abs(kpi.trend)}% 较上月</span>
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.bg}`}>
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="col-span-2 bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">每日生成量 & 质量分趋势</h4>
          <div className="h-44 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">recharts 图表（折线图，后续 Task 实现）</p>
          </div>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">需求类型分布</h4>
          <div className="h-44 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">recharts 图表（饼图，后续 Task 实现）</p>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">覆盖维度分布</h4>
          <div className="h-44 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">recharts 图表（饼图，后续 Task 实现）</p>
          </div>
        </div>
        <div className="col-span-2 bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">人员使用 Top 10</h4>
          <div className="h-44 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">recharts 图表（柱状图，后续 Task 实现）</p>
          </div>
        </div>
      </div>

      {/* Efficiency stats */}
      <div className="bg-card rounded-xl shadow-sm p-5 mb-4 border-l-4 border-cyan-400">
        <h4 className="font-semibold text-sm mb-3">生成效率统计</h4>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xl font-bold text-cyan-600">91.7</p>
            <p className="text-xs text-muted-foreground mt-0.5">平均质量分</p>
          </div>
          <div>
            <p className="text-xl font-bold text-cyan-600">4.8s</p>
            <p className="text-xs text-muted-foreground mt-0.5">平均耗时</p>
          </div>
          <div>
            <p className="text-xl font-bold text-cyan-600">3.8K</p>
            <p className="text-xs text-muted-foreground mt-0.5">平均 Token</p>
          </div>
          <div>
            <p className="text-xl font-bold text-cyan-600">28%</p>
            <p className="text-xs text-muted-foreground mt-0.5">用例编辑率</p>
          </div>
        </div>
      </div>

      {/* Records table */}
      <div className="bg-card rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-sm">最近生成记录</h4>
          <input
            type="text"
            placeholder="搜索..."
            className="border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 w-40"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 pr-3 text-muted-foreground font-medium">时间</th>
                <th className="pb-2 pr-3 text-muted-foreground font-medium">用户</th>
                <th className="pb-2 pr-3 text-muted-foreground font-medium">需求名</th>
                <th className="pb-2 pr-3 text-muted-foreground font-medium">用例数</th>
                <th className="pb-2 pr-3 text-muted-foreground font-medium">质量分</th>
                <th className="pb-2 pr-3 text-muted-foreground font-medium">Token</th>
                <th className="pb-2 pr-3 text-muted-foreground font-medium">方案</th>
                <th className="pb-2 text-muted-foreground font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {mockRecords.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted transition-colors">
                  <td className="py-2.5 pr-3 text-muted-foreground">{row.time}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                        {row.user[0]}
                      </div>
                      <span>{row.user}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 max-w-32 truncate">{row.req}</td>
                  <td className="py-2.5 pr-3 font-medium">{row.count}</td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`px-1.5 py-0.5 rounded font-medium ${
                        row.score >= 90
                          ? "text-green-600 bg-green-50"
                          : row.score >= 75
                          ? "text-amber-600 bg-amber-50"
                          : "text-red-600 bg-red-50"
                      }`}
                    >
                      {row.score}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{row.tokens.toLocaleString()}</td>
                  <td className="py-2.5 pr-3">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-100 text-cyan-700">
                      方案{row.scheme}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <button className="text-primary hover:underline text-xs">查看</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd d:\qorder_workspace\Cobalt; npx tsc --noEmit
```

Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/dashboard.tsx
git commit -m "feat(usecase-gen): add dashboard tab with KPIs, charts placeholder, and records"
```

---

### Task 8: 实现 recharts 图表

**Files:**
- Modify: `components/usecase-gen/dashboard.tsx`

- [ ] **Step 1: 替换图表占位为真实 recharts 图表**

将 dashboard.tsx 中的图表占位替换为 recharts 组件。替换「每日生成量 & 质量分趋势」区域为：

```tsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

// Data constants (add before component)
const LINE_DATA = [
  { date: "5/19", gen: 42, score: 82 },
  { date: "5/20", gen: 58, score: 85 },
  { date: "5/21", gen: 35, score: 79 },
  { date: "5/22", gen: 71, score: 88 },
  { date: "5/23", gen: 88, score: 91 },
  { date: "5/24", gen: 65, score: 87 },
  { date: "5/25", gen: 92, score: 93 },
];

const PIE_TYPE_DATA = [
  { name: "功能需求", value: 48, color: "#7C3AED" },
  { name: "接口需求", value: 28, color: "#06B6D4" },
  { name: "性能需求", value: 14, color: "#F59E0B" },
  { name: "安全需求", value: 10, color: "#10B981" },
];

const PIE_DIM_DATA = [
  { name: "功能", value: 38, color: "#7C3AED" },
  { name: "异常", value: 25, color: "#2563EB" },
  { name: "边界", value: 20, color: "#06B6D4" },
  { name: "兼容", value: 8, color: "#67E8F9" },
  { name: "性能", value: 6, color: "#F59E0B" },
  { name: "安全", value: 3, color: "#10B981" },
];

const BAR_DATA = [
  { name: "张小明", count: 47 }, { name: "李雅婷", count: 38 },
  { name: "王建国", count: 31 }, { name: "刘晓红", count: 28 },
  { name: "陈志远", count: 25 }, { name: "赵慧敏", count: 22 },
  { name: "孙明阳", count: 19 }, { name: "吴桂花", count: 17 },
  { name: "周大力", count: 14 }, { name: "郑思远", count: 11 },
];
```

替换「每日生成量」占位：

```tsx
<div className="chart-box" style={{ height: 180 }}>
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={LINE_DATA}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
      <YAxis yAxisId="right" orientation="right" domain={[60, 100]} tick={{ fontSize: 11 }} />
      <Tooltip />
      <Line yAxisId="left" type="monotone" dataKey="gen" stroke="#7C3AED" strokeWidth={2} dot={false} />
      <Line yAxisId="right" type="monotone" dataKey="score" stroke="#06B6D4" strokeWidth={2} dot={false} />
    </LineChart>
  </ResponsiveContainer>
</div>
```

替换「需求类型分布」饼图：

```tsx
<ResponsiveContainer width="100%" height={170}>
  <PieChart>
    <Pie data={PIE_TYPE_DATA} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
      {PIE_TYPE_DATA.map((entry, i) => (
        <Cell key={i} fill={entry.color} />
      ))}
    </Pie>
    <Tooltip />
    <Legend
      layout="horizontal"
      wrapperStyle={{ fontSize: 10 }}
    />
  </PieChart>
</ResponsiveContainer>
```

替换「覆盖维度分布」饼图：

```tsx
<ResponsiveContainer width="100%" height={170}>
  <PieChart>
    <Pie data={PIE_DIM_DATA} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" paddingAngle={1}>
      {PIE_DIM_DATA.map((entry, i) => (
        <Cell key={i} fill={entry.color} />
      ))}
    </Pie>
    <Tooltip />
    <Legend layout="horizontal" wrapperStyle={{ fontSize: 10 }} />
  </PieChart>
</ResponsiveContainer>
```

替换「人员使用 Top 10」柱状图：

```tsx
<ResponsiveContainer width="100%" height={170}>
  <BarChart data={BAR_DATA} layout="vertical" margin={{ left: 10 }}>
    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
    <XAxis type="number" tick={{ fontSize: 11 }} />
    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={60} />
    <Tooltip />
    <Bar dataKey="count" fill="#7C3AED" radius={[0, 6, 6, 0]} />
  </BarChart>
</ResponsiveContainer>
```

- [ ] **Step 2: 验证编译**

```bash
cd d:\qorder_workspace\Cobalt; npx tsc --noEmit
```

Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/dashboard.tsx
git commit -m "feat(usecase-gen): implement recharts charts in dashboard"
```

---

### Task 9: 创建知识库管理 Tab (Tab 4)

**Files:**
- Create: `components/usecase-gen/knowledge-base.tsx`

- [ ] **Step 1: 创建 knowledge-base.tsx**

```tsx
// components/usecase-gen/knowledge-base.tsx

"use client";

import { useState } from "react";
import { mockKBTabs, mockKBTags, mockKBItems, mockPromptTemplates } from "./shared/mock-data";
import { FileText, Plus } from "lucide-react";

export function KnowledgeBase() {
  const [kbTab, setKbTab] = useState(0);

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Sub-tab bar */}
      <div className="bg-card rounded-xl shadow-sm p-1 flex gap-1 mb-4 w-fit">
        {mockKBTabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setKbTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              kbTab === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Filters */}
        <div className="w-48 flex-shrink-0 space-y-3">
          <div className="bg-card rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">搜索</p>
            <input
              type="text"
              placeholder="关键词..."
              className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="bg-card rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">标签筛选</p>
            <div className="space-y-1">
              {mockKBTags.map((tag, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-cyan-500 w-3 h-3" />
                  <span className="text-xs">{tag}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Tabs 0-2: Knowledge items */}
          {kbTab < 3 && (
            <div>
              <div className="space-y-2">
                {(mockKBItems[kbTab] || []).map((item, i) => (
                  <div key={i} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">{item.date}</span>
                        <div className="flex gap-1">
                          {item.tags.map((tag, ti) => (
                            <span key={ti} className="text-xs bg-muted text-muted-foreground px-1.5 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-center flex-shrink-0">
                      <p className="text-lg font-bold text-cyan-500">{item.refs}</p>
                      <p className="text-xs text-muted-foreground">引用次数</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="text-xs border border-border px-2.5 py-1 rounded-lg hover:border-muted-foreground/40 text-muted-foreground transition-all">
                        预览
                      </button>
                      <button className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-all">
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:border-cyan-500 hover:text-cyan-500 transition-all flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                添加新条目
              </button>
            </div>
          )}

          {/* Tab 3: Prompt templates */}
          {kbTab === 3 && (
            <div className="space-y-3">
              {mockPromptTemplates.map((pt, i) => (
                <div key={i} className="bg-card rounded-xl shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{pt.name}</span>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{pt.version}</span>
                      {pt.active ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">线上</span>
                      ) : (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">草稿</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!pt.active && (
                        <button className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded-lg hover:bg-primary/90 transition-all">
                          上线
                        </button>
                      )}
                      {pt.active && (
                        <button className="text-xs border border-amber-300 text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-50 transition-all">
                          回滚至上版本
                        </button>
                      )}
                      <button className="text-xs border border-border text-muted-foreground px-3 py-1 rounded-lg hover:border-muted-foreground/40 transition-all">
                        编辑
                      </button>
                      <button className="text-xs border border-border text-muted-foreground px-3 py-1 rounded-lg hover:border-muted-foreground/40 transition-all">
                        复制
                      </button>
                    </div>
                  </div>
                  <div className="bg-muted rounded-lg p-3 font-mono text-xs text-muted-foreground leading-relaxed max-h-24 overflow-hidden relative">
                    {pt.content}
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted to-transparent" />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>被使用 {pt.usage} 次</span>
                      <span>平均质量分 {pt.avgScore}</span>
                      <span>更新于 {pt.date}</span>
                    </div>
                    <span className={`text-xs ${pt.active ? "text-green-600" : "text-muted-foreground"}`}>
                      {pt.active ? "✓ 当前线上版本" : "历史版本"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd d:\qorder_workspace\Cobalt; npx tsc --noEmit
```

Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/knowledge-base.tsx
git commit -m "feat(usecase-gen): add knowledge base management tab"
```

---

### Task 10: 创建页面容器 + Sidebar 改动

**Files:**
- Create: `app/usecase-gen/page.tsx`
- Modify: `components/sidebar.tsx`

- [ ] **Step 1: 创建 page.tsx**

```tsx
// app/usecase-gen/page.tsx

"use client";

import { useState } from "react";
import { GenerateWizard } from "@/components/usecase-gen/generate-wizard";
import { CaseEditor } from "@/components/usecase-gen/case-editor";
import { Dashboard } from "@/components/usecase-gen/dashboard";
import { KnowledgeBase } from "@/components/usecase-gen/knowledge-base";
import type { UsecaseModule, TweakEntry } from "@/components/usecase-gen/shared/types";

const TABS = ["生成向导", "用例预览编辑", "数据看板", "知识库管理"];

export default function UsecaseGenPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [usecaseTree, setUsecaseTree] = useState<UsecaseModule[] | null>(null);
  const [tweakHistory, setTweakHistory] = useState<TweakEntry[]>([]);

  // Skill ID from env
  const skillId = process.env.NEXT_PUBLIC_USECASE_SKILL_ID;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with Tab bar */}
      <div className="border-b px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">用例生成</h1>
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            {TABS.map((tab, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === i
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden p-6">
        {activeTab === 0 && (
          <GenerateWizard
            onComplete={(tree, summary) => setUsecaseTree(tree)}
            tweakHistory={tweakHistory}
            onTweakHistoryUpdate={setTweakHistory}
            usecaseTree={usecaseTree}
            skillId={skillId}
          />
        )}
        {activeTab === 1 && (
          <CaseEditor usecaseTree={usecaseTree} tweakHistory={tweakHistory} />
        )}
        {activeTab === 2 && <Dashboard />}
        {activeTab === 3 && <KnowledgeBase />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 修改 sidebar.tsx**

在 `sidebar.tsx` 的 import 行追加 `FileText`：

```
import { LayoutDashboard, PlusCircle, Wand2, LogOut, Cpu, FileText } from "lucide-react";
```

在 navItems 数组中追加：

```ts
{ href: "/usecase-gen", label: "用例生成", icon: FileText },
```

- [ ] **Step 3: 验证编译**

```bash
cd d:\qorder_workspace\Cobalt; npx tsc --noEmit
```

Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
git add app/usecase-gen/page.tsx components/sidebar.tsx
git commit -m "feat(usecase-gen): add page container with 4 tabs and sidebar entry"
```

---

