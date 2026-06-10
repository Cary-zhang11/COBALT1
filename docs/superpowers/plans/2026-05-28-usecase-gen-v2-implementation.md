# 用例生成模块 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 Output Scanner 解耦结果检测 + 历史记录 Tab，复用已有 `/api/tasks/:id/report` 端点

**Architecture:** useOutputScanner 轮询已有 report 端点检测文件就绪；历史记录作为独立 Tab 插入第 2 位；page.tsx 通过 preloadedResult / resumeTaskId props 让 GenerateWizard 支持历史回放和任务恢复

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, @tanstack/react-query

---

### Task 1: API + Hook — 支持 skillId 过滤

**Files:**
- Modify: `app/api/tasks/route.ts`
- Modify: `hooks/use-tasks.ts`

- [ ] **Step 1: 修改 GET /api/tasks 支持 skillId 参数**

在 `app/api/tasks/route.ts` 的 GET 函数中加 skillId 过滤：

```ts
// 将第 10-13 行:
const { searchParams } = new URL(req.url);
const status = searchParams.get("status");
const where = { userId, ...(status ? { status } : {}) };

// 改为:
const { searchParams } = new URL(req.url);
const status = searchParams.get("status");
const skillId = searchParams.get("skillId");
const where: Record<string, unknown> = { userId };
if (status) where.status = status;
if (skillId) where.skillId = skillId;
```

- [ ] **Step 2: 修改 useTasks hook 支持 skillId 参数**

在 `hooks/use-tasks.ts` 中扩展 `useTasks` 函数签名：

```ts
// 将第 15 行:
export function useTasks(status?: string) {
  return useQuery<{ tasks: Task[] }>({
    queryKey: ["tasks", status],
    queryFn: async () => {
      const params = status ? `?status=${status}` : "";
      const res = await fetch(`/api/tasks${params}`);

// 改为:
export function useTasks(status?: string, skillId?: string) {
  return useQuery<{ tasks: Task[] }>({
    queryKey: ["tasks", status, skillId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (skillId) params.set("skillId", skillId);
      const qs = params.toString();
      const res = await fetch(`/api/tasks${qs ? `?${qs}` : ""}`);
```

- [ ] **Step 3: 验证编译**

```bash
cd d:/qorder_workspace/Cobalt && npx tsc --noEmit
```
Expected: 编译通过，无新增类型错误。

- [ ] **Step 4: Commit**

```bash
git add app/api/tasks/route.ts hooks/use-tasks.ts
git commit -m "feat(tasks): add skillId filter to GET /api/tasks and useTasks hook

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 创建 useOutputScanner hook

**Files:**
- Create: `hooks/use-output-scanner.ts`

- [ ] **Step 1: 创建 use-output-scanner.ts**

```ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseOutputScannerOptions {
  taskId: string;
  interval?: number;
  onResult?: (data: {
    tree: unknown;
    summary?: { totalCases: number; qualityScore: number; modules: number };
    outputFiles?: { name: string; path: string }[];
  }) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

interface FileSizeMap {
  [filename: string]: { size: number; stableCount: number };
}

export function useOutputScanner({
  taskId,
  interval = 3000,
  onResult,
  onError,
  enabled = true,
}: UseOutputScannerOptions) {
  const [isScanning, setIsScanning] = useState(false);
  const [foundFiles, setFoundFiles] = useState<string[]>([]);
  const [, setPollCount] = useState(0);
  const fileSizesRef = useRef<FileSizeMap>({});
  const stopRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ onResult, onError });
  callbacksRef.current = { onResult, onError };

  const stop = useCallback(() => {
    stopRef.current = true;
    setIsScanning(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!taskId || !enabled) return;

    stopRef.current = false;
    setIsScanning(true);

    const poll = async () => {
      if (stopRef.current) return;

      try {
        // 1. Check task status first
        const taskRes = await fetch(`/api/tasks/${taskId}`);
        if (!taskRes.ok) {
          callbacksRef.current.onError?.("无法获取任务状态");
          stop();
          return;
        }
        const taskData = await taskRes.json();
        const status = taskData.task?.status;

        if (status === "failed") {
          callbacksRef.current.onError?.("任务执行失败");
          stop();
          return;
        }
        if (status === "cancelled") {
          stop();
          return;
        }

        // 2. Call report endpoint to check for output files
        const reportRes = await fetch(`/api/tasks/${taskId}/report`);
        if (!reportRes.ok) {
          // Retry next poll
          if (!stopRef.current) {
            timerRef.current = setTimeout(poll, interval);
          }
          return;
        }
        const report = await reportRes.json();

        // 3. Check if output files exist
        const files = report.outputFiles || [];
        const newFoundFiles: string[] = files.map(
          (f: { name: string }) => f.name
        );
        if (newFoundFiles.length > 0) {
          setFoundFiles(newFoundFiles);
        }

        // 4. Stability check on md file
        if (report.tree && newFoundFiles.length > 0) {
          // Build current size map
          const currentSizes: FileSizeMap = {};
          for (const f of files) {
            // We can't get file size directly from report,
            // so we use the summary.totalCases as a proxy for completeness
            currentSizes[f.name] = {
              size: report.summary?.totalCases || 0,
              stableCount:
                (fileSizesRef.current[f.name]?.stableCount || 0) + 1,
            };
          }

          // Check if any md file has been stable for 2 consecutive polls
          const mdFiles = Object.entries(currentSizes).filter(([name]) =>
            name.includes("测试用例")
          );

          if (mdFiles.length > 0) {
            const allStable = mdFiles.every(
              ([name, info]) =>
                info.size > 0 &&
                (fileSizesRef.current[name]?.size === info.size ||
                  info.stableCount >= 2)
            );

            if (allStable) {
              // Update fileSizesRef
              for (const [name, info] of mdFiles) {
                fileSizesRef.current[name] = {
                  size: info.size,
                  stableCount: Math.min(info.stableCount, 2),
                };
              }

              // Check if stable enough (2 consecutive stable polls)
              const trulyStable = mdFiles.every(
                ([, info]) => (info.stableCount as number) >= 2
              );

              if (trulyStable) {
                callbacksRef.current.onResult?.(report);
                stop();
                return;
              }
            }
          }

          fileSizesRef.current = currentSizes;
        }
      } catch {
        // Network error — retry next poll
      }

      if (!stopRef.current) {
        setPollCount((c) => c + 1);
        timerRef.current = setTimeout(poll, interval);
      }
    };

    // Start polling
    poll();

    return () => {
      stopRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [taskId, enabled, interval, stop]);

  return { isScanning, foundFiles, stop };
}
```

- [ ] **Step 2: 验证编译**

```bash
cd d:/qorder_workspace/Cobalt && npx tsc --noEmit
```
Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add hooks/use-output-scanner.ts
git commit -m "feat(usecase-gen): add useOutputScanner hook for polling task report

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 创建 history-list 组件

**Files:**
- Create: `components/usecase-gen/history-list.tsx`

- [ ] **Step 1: 创建 history-list.tsx**

```tsx
"use client";

import { useState } from "react";
import { useTasks } from "@/hooks/use-tasks";
import {
  Loader2, Clock, FileText, AlertCircle, ExternalLink, Play,
} from "lucide-react";
import type { UsecaseModule } from "./shared/types";

interface HistoryListProps {
  skillId: string | undefined;
  onLoadResult: (result: {
    tree: UsecaseModule[];
    stats: { totalCases: number; qualityScore: number; modules: number };
  }) => void;
  onResumeTask: (taskId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  completed: { label: "已完成", className: "bg-emerald-100 text-emerald-700" },
  running: { label: "进行中", className: "bg-blue-100 text-blue-700" },
  pending: { label: "排队中", className: "bg-slate-100 text-slate-600" },
  paused: { label: "已暂停", className: "bg-amber-100 text-amber-700" },
  failed: { label: "失败", className: "bg-red-100 text-red-600" },
  cancelled: { label: "已取消", className: "bg-slate-100 text-slate-500" },
};

function extractReqName(input: string): string {
  const firstLine = input.split("\n")[0] || input;
  return firstLine.length > 30 ? firstLine.slice(0, 30) + "..." : firstLine;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }) + " " + d.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryList({ skillId, onLoadResult, onResumeTask }: HistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useTasks(undefined, skillId);
  const tasks = data?.tasks || [];

  const handleClickCompleted = async (task: { id: string; output: string | null }) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/report`);
      if (!res.ok) throw new Error("Failed to load report");
      const report = await res.json();
      if (report.tree) {
        onLoadResult({
          tree: report.tree,
          stats: report.summary || {
            totalCases: report.tree.reduce(
              (s: number, m: { cases: unknown[] }) => s + m.cases.length, 0
            ),
            qualityScore: 0,
            modules: report.tree.length,
          },
        });
      }
    } catch {
      // Fallback: parse from task.output directly
      try {
        if (task.output) {
          const { parseUsecaseOutput } = await import(
            "./shared/parse-usecase-output"
          );
          const parsed = parseUsecaseOutput(task.output);
          if (parsed.tree) {
            onLoadResult({
              tree: parsed.tree,
              stats: parsed.summary || {
                totalCases: parsed.tree.reduce(
                  (s, m) => s + m.cases.length, 0
                ),
                qualityScore: 0,
                modules: parsed.tree.length,
              },
            });
          }
        }
      } catch {
        // silently fail
      }
    }
  };

  if (!skillId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">Skill 未配置</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">加载失败</p>
          <button
            onClick={() => refetch()}
            className="text-sm text-primary hover:underline"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-xs">
          <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium text-muted-foreground mb-1">
            暂无历史记录
          </p>
          <p className="text-xs text-muted-foreground">
            使用「生成向导」创建第一个用例生成任务
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">
          历史记录
          <span className="ml-1.5 text-xs text-muted-foreground font-normal">
            ({tasks.length})
          </span>
        </h3>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => {
          const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
          const reqName = extractReqName(task.input || "未命名需求");
          const isExpanded = expandedId === task.id;
          const isRunning = task.status === "running" || task.status === "pending" || task.status === "paused";
          const isCompleted = task.status === "completed";

          return (
            <div
              key={task.id}
              className={`bg-card rounded-lg border transition-all ${
                isExpanded ? "border-primary/30 shadow-sm" : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div
                onClick={() => {
                  setExpandedId(isExpanded ? null : task.id);
                  if (isCompleted) {
                    handleClickCompleted(task as { id: string; output: string | null });
                  } else if (isRunning) {
                    onResumeTask(task.id);
                  }
                }}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{reqName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(task.createdAt)}
                    {task.duration != null && (
                      <span className="ml-2">
                        {(task.duration / 1000).toFixed(1)}s
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusConf.className}`}
                >
                  {statusConf.label}
                </span>
                {isRunning && (
                  <Play className="w-4 h-4 text-blue-500 flex-shrink-0" />
                )}
                {isCompleted && (
                  <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>

              {isExpanded && task.status === "failed" && (
                <div className="border-t px-3 py-2 text-xs text-red-600 bg-red-50/50 rounded-b-lg">
                  任务执行失败，请检查需求内容后重试
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd d:/qorder_workspace/Cobalt && npx tsc --noEmit
```
Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/history-list.tsx
git commit -m "feat(usecase-gen): add history-list tab component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 更新 page.tsx — Tab 布局 + 状态

**Files:**
- Modify: `app/usecase-gen/page.tsx`

- [ ] **Step 1: 更新 page.tsx**

```tsx
"use client";

import { useState } from "react";
import { GenerateWizard } from "@/components/usecase-gen/generate-wizard";
import { CaseEditor } from "@/components/usecase-gen/case-editor";
import { Dashboard } from "@/components/usecase-gen/dashboard";
import { KnowledgeBase } from "@/components/usecase-gen/knowledge-base";
import { HistoryList } from "@/components/usecase-gen/history-list";
import type { UsecaseModule, TweakEntry } from "@/components/usecase-gen/shared/types";

const TABS = ["生成向导", "历史记录", "用例预览编辑", "数据看板", "知识库管理"];

export default function UsecaseGenPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [usecaseTree, setUsecaseTree] = useState<UsecaseModule[] | null>(null);
  const [tweakHistory, setTweakHistory] = useState<TweakEntry[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [preloadedResult, setPreloadedResult] = useState<{
    tree: UsecaseModule[];
    stats: { totalCases: number; qualityScore: number; modules: number };
  } | null>(null);

  const skillId = process.env.NEXT_PUBLIC_USECASE_SKILL_ID;

  const handleLoadResult = (result: {
    tree: UsecaseModule[];
    stats: { totalCases: number; qualityScore: number; modules: number };
  }) => {
    setUsecaseTree(result.tree);
    setPreloadedResult(result);
    setActiveTab(0);
  };

  const handleResumeTask = (taskId: string) => {
    setCurrentTaskId(taskId);
    setActiveTab(0);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 0 && (
          <GenerateWizard
            onComplete={(tree) => setUsecaseTree(tree)}
            tweakHistory={tweakHistory}
            onTweakHistoryUpdate={setTweakHistory}
            usecaseTree={usecaseTree}
            skillId={skillId}
            onNavigateToTab={setActiveTab}
            preloadedResult={preloadedResult}
            onClearPreloaded={() => setPreloadedResult(null)}
            resumeTaskId={currentTaskId}
            onClearResume={() => setCurrentTaskId(null)}
          />
        )}
        {activeTab === 1 && (
          <HistoryList
            skillId={skillId}
            onLoadResult={handleLoadResult}
            onResumeTask={handleResumeTask}
          />
        )}
        {activeTab === 2 && (
          <CaseEditor usecaseTree={usecaseTree} tweakHistory={tweakHistory} />
        )}
        {activeTab === 3 && <Dashboard />}
        {activeTab === 4 && <KnowledgeBase />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 暂不验证/提交**

page.tsx 的新 props 依赖 Task 5 对 GenerateWizard 的更新。TS 编译和 commit 将在 Task 5 一并完成。

---

### Task 5: 更新 generate-wizard — Scanner 集成 + 取消 + preloadedResult

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`

- [ ] **Step 1: 更新 GenerateWizardProps 接口和组件 props 解构**

将第 17-24 行的接口定义：

```ts
interface GenerateWizardProps {
  onComplete: (tree: UsecaseModule[], summary?: { totalCases: number; qualityScore: number; modules: number }) => void;
  tweakHistory: TweakEntry[];
  onTweakHistoryUpdate: (history: TweakEntry[]) => void;
  usecaseTree: UsecaseModule[] | null;
  skillId: string | undefined;
  onNavigateToTab?: (tabIndex: number) => void;
}
```

改为：

```ts
interface GenerateWizardProps {
  onComplete: (tree: UsecaseModule[], summary?: { totalCases: number; qualityScore: number; modules: number }) => void;
  tweakHistory: TweakEntry[];
  onTweakHistoryUpdate: (history: TweakEntry[]) => void;
  usecaseTree: UsecaseModule[] | null;
  skillId: string | undefined;
  onNavigateToTab?: (tabIndex: number) => void;
  preloadedResult?: {
    tree: UsecaseModule[];
    stats: { totalCases: number; qualityScore: number; modules: number };
  } | null;
  onClearPreloaded?: () => void;
  resumeTaskId?: string | null;
  onClearResume?: () => void;
}
```

将第 33-36 行的解构：

```ts
export function GenerateWizard({
  onComplete, tweakHistory, onTweakHistoryUpdate, usecaseTree, skillId,
  onNavigateToTab,
}: GenerateWizardProps) {
```

改为：

```ts
export function GenerateWizard({
  onComplete, tweakHistory, onTweakHistoryUpdate, usecaseTree, skillId,
  onNavigateToTab, preloadedResult, onClearPreloaded, resumeTaskId, onClearResume,
}: GenerateWizardProps) {
```

- [ ] **Step 2: 在 import 中追加 useOutputScanner 和 useCancelTask**

将第 3 行：

```ts
import { useCreateTask, useExecuteTask, useResumeTask } from "@/hooks/use-tasks";
```

改为：

```ts
import { useCreateTask, useExecuteTask, useResumeTask, useCancelTask } from "@/hooks/use-tasks";
import { useOutputScanner } from "@/hooks/use-output-scanner";
```

- [ ] **Step 3: 在 hooks 声明区域（第 37-39 行之后）添加 cancelTask 和 scanner hooks**

```ts
const cancelTask = useCancelTask();

// Output scanner — replaces SSE onComplete callback
const scanner = useOutputScanner({
  taskId: taskId || "",
  enabled: generating && !!taskId,
  onResult: (data) => {
    const tree = data.tree as UsecaseModule[];
    const summary = data.summary;
    onComplete(tree, summary);
    setGenStats({
      totalCases: summary?.totalCases || 0,
      qualityScore: summary?.qualityScore || 0,
      modules: summary?.modules || 0,
      duration: 0,
    });
    setGenerating(false);
  },
  onError: (msg) => {
    setGenStatus(msg);
    setGenerating(false);
  },
});
```

- [ ] **Step 4: 添加 preloadedResult 检测 useEffect**

在 scanner 声明之后、`handleFileUpload` 之前加入：

```ts
// Handle preloaded result from history
useEffect(() => {
  if (preloadedResult) {
    setWizStep(2);
    setGenStats({
      totalCases: preloadedResult.stats.totalCases,
      qualityScore: preloadedResult.stats.qualityScore,
      modules: preloadedResult.stats.modules,
      duration: 0,
    });
    setGenerating(false);
    setGenStatus("");
    onComplete(preloadedResult.tree, preloadedResult.stats);
    onClearPreloaded?.();
  }
}, [preloadedResult, onComplete, onClearPreloaded]);

// Handle resume task from history
useEffect(() => {
  if (resumeTaskId) {
    setTaskId(resumeTaskId);
    setGenerating(true);
    setGenStatus("正在恢复执行进度...");
    setWizStep(2);
    onClearResume?.();
  }
}, [resumeTaskId, onClearResume]);
```

- [ ] **Step 5: 将 useEffect import 加入文件头部**

将第 3 行：

```ts
import { useState, useRef, useCallback } from "react";
```

改为：

```ts
import { useState, useRef, useCallback, useEffect } from "react";
```

- [ ] **Step 6: 移除旧的 onExecutionComplete 回调**

删除第 113-132 行的 `onExecutionComplete` 函数定义：

```ts
  const onExecutionComplete = useCallback(async (status: string) => {
    // ... 整个函数删除
  }, [taskId, onComplete]);
```

- [ ] **Step 7: 在 Step 3 生成中状态添加取消按钮**

将第 322-331 行的 generating 状态 block 中的 `<p className="text-xs text-muted-foreground mt-3">请稍候，您可在右侧面板查看执行进度</p>` 替换为取消按钮：

```tsx
<p className="text-xs text-muted-foreground mt-3">正在扫描输出文件，请稍候...</p>
<button
  onClick={() => {
    cancelTask.mutate(taskId!);
    scanner.stop();
    setGenerating(false);
    setGenStatus("");
  }}
  disabled={cancelTask.isPending}
  className="mt-4 border border-red-200 text-red-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-40"
>
  {cancelTask.isPending ? (
    <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />取消中...</>
  ) : (
    "取消生成"
  )}
</button>
```

- [ ] **Step 8: 修复 "去编辑用例" 按钮的 Tab 索引**

将第 448 行：

```ts
<button onClick={() => onNavigateToTab?.(1)}
```

改为：

```ts
<button onClick={() => onNavigateToTab?.(2)}
```

- [ ] **Step 9: 验证编译**

```bash
cd d:/qorder_workspace/Cobalt && npx tsc --noEmit
```
Expected: 编译通过，无类型错误。

- [ ] **Step 10: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx app/usecase-gen/page.tsx
git commit -m "feat(usecase-gen): integrate output scanner, cancel button, preloadedResult, history tab

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

