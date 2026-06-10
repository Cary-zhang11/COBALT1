# Usecase-Gen V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Step 3 layout, add AI tweak (inject during generation + conversational tweak after completion), star rating, collapsible module table, and slim progress sidebar.

**Architecture:** Extract 4 new components from generate-wizard.tsx (OutputFiles, AITweakPanel, RatingPanel, ModuleOverviewTable). Refactor ExecutionPanel into 3 rendering modes (config preview / progress dots / quick actions). Add 2 new API routes (inject, tweak). generate-wizard.tsx orchestrates the new layout and state transitions.

**Tech Stack:** React 18, Next.js 14 App Router, TypeScript, Tailwind CSS, Lucide icons, SSE via useTaskEvents, polling via useOutputScanner

---

## File Structure

| File | Role |
|------|------|
| `components/usecase-gen/shared/output-files.tsx` | **New** — Output file list with download buttons |
| `components/usecase-gen/shared/ai-tweak-panel.tsx` | **New** — Quick chips + scope + chat + inject/tweak |
| `components/usecase-gen/shared/rating-panel.tsx` | **New** — 5-star rating, calls existing feedback API |
| `components/usecase-gen/shared/module-overview-table.tsx` | **New** — Extracted table with collapse toggle |
| `components/usecase-gen/shared/execution-panel.tsx` | **Modify** — 3 modes: config preview / progress dots / quick actions |
| `components/usecase-gen/generate-wizard.tsx` | **Modify** — Reorder Step 3 layout, integrate new components, add tweak callbacks |
| `app/api/tasks/[id]/inject/route.ts` | **New** — POST inject instruction into running CLI session |
| `app/api/tasks/[id]/tweak/route.ts` | **New** — POST tweak instruction for conversational modification |
| `components/usecase-gen/shared/__tests__/execution-panel.test.tsx` | **Modify** — Update for new props and modes |

### Interface Contracts

```ts
// OutputFiles
interface OutputFilesProps { taskId: string | null; files: string[]; }

// AITweakPanel
interface AITweakPanelProps {
  taskId: string | null;
  generating: boolean;
  modules: string[];
  onTweakStarted: () => void;
}

// RatingPanel
interface RatingPanelProps { taskId: string | null; }

// ModuleOverviewTable
interface ModuleOverviewTableProps { modules: UsecaseModule[]; totalCases: number; }

// ExecutionPanel (updated)
interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  wizStep: number;
  hasResult: boolean;
  configSummary: { source: string; capabilities: string; dimensions: string; fewShot: string; };
  foundFiles: string[];
  onDownloadFile: (fileName: string) => void;
  onScrollToAITweak: () => void;
  onScrollToRating: () => void;
  onNavigateToEditor: () => void;
  onReconfigure: () => void;
}
```

---

### Task 1: Extract ModuleOverviewTable with collapse toggle

**Files:**
- Create: `components/usecase-gen/shared/module-overview-table.tsx`
- Modify: `components/usecase-gen/generate-wizard.tsx` (extract table code)

- [ ] **Step 1: Create module-overview-table.tsx**

```tsx
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { UsecaseModule } from "./types";

interface ModuleOverviewTableProps {
  modules: UsecaseModule[];
  totalCases: number;
}

export function ModuleOverviewTable({ modules, totalCases }: ModuleOverviewTableProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card rounded-xl shadow-sm overflow-hidden">
      <div
        className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="font-semibold text-sm">
          模块用例概览{" "}
          <span className="text-muted-foreground font-normal">
            ({modules.length} 模块 · {totalCases} 用例)
          </span>
        </h3>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>
      {expanded && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-t bg-muted/30">
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">模块</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">用例数</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">P0 / P1 / P2</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">覆盖率</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((mod, mi) => {
              const p0 = mod.cases.filter((c) => c.priority === "P0").length;
              const p1 = mod.cases.filter((c) => c.priority === "P1").length;
              const p2 = mod.cases.filter((c) => c.priority === "P2").length;
              const cov = Math.min(100, Math.round(mod.cases.length / Math.max(1, totalCases / modules.length) * 40 + 60));
              return (
                <tr key={mi} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium">{mod.name}</td>
                  <td className="text-center px-4 py-3">{mod.cases.length}</td>
                  <td className="text-center px-4 py-3">
                    <span className="inline-flex gap-1">
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{p0}</span>
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">{p1}</span>
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">{p2}</span>
                    </span>
                  </td>
                  <td className="text-right px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${cov >= 80 ? "bg-emerald-500" : cov >= 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${cov}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{cov}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/module-overview-table.tsx
git commit -m "feat(usecase-gen): extract ModuleOverviewTable with collapse toggle"
```

The component accepts `modules` and `totalCases` as props. When collapsed (default), only the header bar shows with a summary like "模块用例概览 (8 模块 · 42 用例) ▲". Clicking toggles the expanded table.

At this point, generate-wizard.tsx still renders the old inline table. We'll replace it in Task 6.

---

### Task 2: Create OutputFiles component

**Files:**
- Create: `components/usecase-gen/shared/output-files.tsx`

- [ ] **Step 1: Create output-files.tsx**

```tsx
"use client";

import { FileText, Download, Loader2 } from "lucide-react";

interface OutputFilesProps {
  taskId: string | null;
  files: string[];
}

function isDisplayable(name: string): boolean {
  if (name.includes("_source")) return false;
  return name.includes("测试用例") && (name.endsWith(".md") || name.endsWith(".xmind"));
}

export function OutputFiles({ taskId, files }: OutputFilesProps) {
  const displayable = files.filter(isDisplayable);

  return (
    <div className="bg-card rounded-xl shadow-sm p-5">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        输出文件
      </h3>
      {displayable.length === 0 ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          生成中...
        </p>
      ) : (
        <div className="space-y-1.5">
          {displayable.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{f}</span>
              </div>
              <button
                onClick={() => {
                  if (!taskId) return;
                  window.open(
                    `/api/tasks/${taskId}/download?file=${encodeURIComponent(f)}`
                  );
                }}
                disabled={!taskId}
                className="text-primary hover:text-primary/70 disabled:opacity-40 flex-shrink-0 ml-2"
                title="下载"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/output-files.tsx
git commit -m "feat(usecase-gen): add OutputFiles component with download buttons"
```

Only shows files matching `测试用例` with `.md` or `.xmind` extensions. `_source.md` is filtered out. Each file has a download button that calls `GET /api/tasks/:id/download?file=...`. When `taskId` is null, download buttons are disabled.

---

### Task 3: Create RatingPanel component

**Files:**
- Create: `components/usecase-gen/shared/rating-panel.tsx`

- [ ] **Step 1: Create rating-panel.tsx**

```tsx
"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface RatingPanelProps {
  taskId: string | null;
}

export function RatingPanel({ taskId }: RatingPanelProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!taskId) return null;

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || "提交失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card rounded-xl shadow-sm p-5">
      <h3 className="font-semibold text-sm mb-3">评价</h3>
      {submitted ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <Star className="w-4 h-4 fill-emerald-500 text-emerald-500" />
          已提交 · {rating} 分
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">整体质量</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(0)}
                className="transition-colors"
              >
                <Star
                  className={`w-5 h-5 ${
                    n <= (hovered || rating)
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              </button>
            ))}
          </div>
          <button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-40 transition-opacity"
          >
            {submitting ? "提交中..." : "提交评价"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/rating-panel.tsx
git commit -m "feat(usecase-gen): add RatingPanel for 5-star feedback"
```

Calls existing `POST /api/tasks/:id/feedback` API. Shows "已提交" state after successful submission. Null taskId hides the component entirely.

---

### Task 4: Create AITweakPanel component

**Files:**
- Create: `components/usecase-gen/shared/ai-tweak-panel.tsx`

- [ ] **Step 1: Create ai-tweak-panel.tsx with quick chips, scope, chat history, and inject/tweak logic**

```tsx
"use client";

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatLine {
  role: "user" | "ai";
  text: string;
}

interface AITweakPanelProps {
  taskId: string | null;
  generating: boolean;
  modules: string[];
  onTweakStarted: () => void;
}

const QUICK_CHIPS = [
  "补充边界场景",
  "增加异常覆盖",
  "精简步骤描述",
  "提升P0覆盖率",
  "增加安全场景",
  "补充兼容测试",
];

export function AITweakPanel({
  taskId,
  generating,
  modules,
  onTweakStarted,
}: AITweakPanelProps) {
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("all");
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !taskId || sending) return;

    const instruction =
      scope !== "all" && scope ? `${text}（仅针对"${scope}"模块）` : text;

    setChatLines((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setSending(true);

    try {
      if (generating) {
        // Inject into running session
        await fetch(`/api/tasks/${taskId}/inject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, scope: scope !== "all" ? scope : undefined }),
        });
        setChatLines((prev) => [
          ...prev,
          { role: "ai", text: "指令已注入，AI 正在调整生成方向..." },
        ]);
      } else {
        // Conversational tweak on existing result
        await fetch(`/api/tasks/${taskId}/tweak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, scope: scope !== "all" ? scope : undefined }),
        });
        setChatLines((prev) => [
          ...prev,
          { role: "ai", text: "正在基于已有用例进行修改..." },
        ]);
        onTweakStarted();
      }
    } catch {
      setChatLines((prev) => [
        ...prev,
        { role: "ai", text: "发送失败，请重试" },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-card rounded-xl shadow-sm p-5">
      <h3 className="font-semibold text-sm mb-3">AI 微调</h3>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => setInput(chip)}
            className={`px-2.5 py-1 rounded-lg text-xs border font-medium transition-all ${
              input === chip
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Scope + input */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground flex-shrink-0">范围:</span>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          disabled={modules.length === 0 || generating}
          className="border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-40"
        >
          <option value="all">全部模块</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={
            generating
              ? "注入追加指令，如「补充短信登录场景」"
              : "描述想要的修改，如「给登录模块补充异常场景」"
          }
          className="flex-1 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending || !taskId}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40 transition-opacity flex items-center gap-1.5"
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          发送
        </button>
      </div>

      {/* Chat history */}
      {chatLines.length > 0 && (
        <div className="mt-3 bg-muted/40 rounded-lg p-3 max-h-32 overflow-y-auto space-y-2">
          {chatLines.map((line, i) => (
            <div key={i} className="text-xs">
              <span
                className={`font-medium ${
                  line.role === "user" ? "text-primary" : "text-emerald-600"
                }`}
              >
                {line.role === "user" ? "You: " : "AI: "}
              </span>
              <span className="text-muted-foreground">{line.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/ai-tweak-panel.tsx
git commit -m "feat(usecase-gen): add AITweakPanel with quick chips and inject/tweak"
```

During generation (`generating=true`), sends to `POST /api/tasks/:id/inject`. After completion, sends to `POST /api/tasks/:id/tweak` and calls `onTweakStarted()` to trigger the parent's `setGenerating(true)`.

---

### Task 5: Refactor ExecutionPanel — 3 rendering modes

**Files:**
- Modify: `components/usecase-gen/shared/execution-panel.tsx` (full rewrite)

- [ ] **Step 1: Rewrite execution-panel.tsx with config preview / progress dots / quick actions**

```tsx
"use client";

import { useMemo } from "react";
import { CheckCircle2, Circle, Loader2, Download, MessageSquare, Star, Edit3, RefreshCw } from "lucide-react";

interface WorkflowNode {
  name: string;
  state: "wait" | "running" | "done";
}

const WORKFLOW_NODES: { name: string; key: string }[] = [
  { name: "文档解析", key: "source" },
  { name: "知识检索", key: "rag" },
  { name: "LLM 生成", key: "llm" },
  { name: "质量校验", key: "quality" },
  { name: "导出格式化", key: "export" },
];

interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  wizStep: number;
  hasResult: boolean;
  configSummary: {
    source: string;
    capabilities: string;
    dimensions: string;
    fewShot: string;
  };
  foundFiles: string[];
  onDownloadFile: (fileName: string) => void;
  onScrollToAITweak: () => void;
  onScrollToRating: () => void;
  onNavigateToEditor: () => void;
  onReconfigure: () => void;
}

function deriveNodeStates(foundFiles: string[], generating: boolean): { name: string; state: "wait" | "running" | "done" }[] {
  const hasSourceMd = foundFiles.some((f) => f.includes("_source"));
  const hasTestcaseMd = foundFiles.some((f) => f.includes("测试用例") && f.endsWith(".md"));
  const hasXmind = foundFiles.some((f) => f.endsWith(".xmind"));

  return WORKFLOW_NODES.map((node, i) => {
    let state: "wait" | "running" | "done";
    switch (i) {
      case 0: state = hasSourceMd ? "done" : generating ? "running" : "wait"; break;
      case 1: state = hasTestcaseMd ? "done" : hasSourceMd ? "running" : "wait"; break;
      case 2: state = hasTestcaseMd ? "done" : hasSourceMd ? "running" : "wait"; break;
      case 3: state = hasTestcaseMd ? "done" : "wait"; break;
      case 4: state = hasXmind ? "done" : hasTestcaseMd ? "running" : "wait"; break;
      default: state = "wait";
    }
    return { name: node.name, state };
  });
}

export function ExecutionPanel({
  taskId,
  generating,
  wizStep,
  hasResult,
  configSummary,
  foundFiles,
  onDownloadFile,
  onScrollToAITweak,
  onScrollToRating,
  onNavigateToEditor,
  onReconfigure,
}: ExecutionPanelProps) {
  const nodes = useMemo(
    () => deriveNodeStates(foundFiles, generating),
    [foundFiles, generating]
  );

  const mdFile = foundFiles.find((f) => f.includes("测试用例") && f.endsWith(".md"));
  const xmindFile = foundFiles.find((f) => f.endsWith(".xmind"));

  // Mode 1: Config Preview (wizStep < 2)
  if (wizStep < 2) {
    return (
      <div className="w-48 flex-shrink-0">
        <div className="bg-card rounded-xl shadow-sm p-4 sticky top-20">
          <h4 className="font-semibold text-sm text-foreground mb-3">当前配置预览</h4>
          <div className="bg-muted rounded-lg p-3 space-y-2">
            {[
              ["物料来源", configSummary.source],
              ["已选能力", configSummary.capabilities],
              ["覆盖维度", configSummary.dimensions],
              ["few-shot", configSummary.fewShot],
              ["输出格式", "XMind + Markdown"],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium max-w-[100px] truncate">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Mode 2: Progress Dots (wizStep === 2 && generating)
  if (wizStep === 2 && generating) {
    return (
      <div className="w-48 flex-shrink-0">
        <div className="bg-card rounded-xl shadow-sm p-4 sticky top-20">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
            <span className="text-xs font-semibold text-foreground">生成中</span>
          </div>
          <div className="flex flex-col">
            {nodes.map((node, i) => (
              <div key={i} className="flex items-stretch">
                {/* Dot + vertical line column */}
                <div className="flex flex-col items-center mr-2.5">
                  {node.state === "done" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : node.state === "running" ? (
                    <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0 shadow-[0_0_0_3px_rgba(99,102,241,0.3)]" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-border flex-shrink-0" />
                  )}
                  {i < nodes.length - 1 && (
                    <div className={`w-px flex-1 my-1 ${node.state === "done" ? "bg-green-200" : "bg-border"}`} />
                  )}
                </div>
                {/* Label */}
                <div className={`pb-2 text-xs font-medium transition-opacity ${
                  node.state === "done"
                    ? "text-green-700"
                    : node.state === "running"
                    ? "text-primary"
                    : "text-muted-foreground opacity-40"
                }`}>
                  {node.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Mode 3: Quick Actions (wizStep === 2 && !generating)
  if (wizStep === 2 && !generating && (foundFiles.length > 0 || hasResult)) {
    return (
      <div className="w-48 flex-shrink-0">
        <div className="bg-card rounded-xl shadow-sm p-4 sticky top-20">
          <h4 className="font-semibold text-sm text-foreground mb-3">快捷操作</h4>
          <div className="space-y-2">
            {mdFile && (
              <button onClick={() => onDownloadFile(mdFile)} className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors">
                <Download className="w-3.5 h-3.5 text-primary" />
                下载 Markdown
              </button>
            )}
            {xmindFile && (
              <button onClick={() => onDownloadFile(xmindFile)} className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors">
                <Download className="w-3.5 h-3.5 text-primary" />
                下载 XMind
              </button>
            )}
            <button onClick={onScrollToAITweak} className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              AI 微调
            </button>
            <button onClick={onScrollToRating} className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors">
              <Star className="w-3.5 h-3.5 text-primary" />
              评价
            </button>
            <button onClick={onNavigateToEditor} className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors">
              <Edit3 className="w-3.5 h-3.5 text-primary" />
              去编辑用例
            </button>
            <button onClick={onReconfigure} className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors">
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              重新配置
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: nothing to show yet
  return <div className="w-48 flex-shrink-0" />;
}
```

Key changes:
- Sidebar width changed from `w-80` (320px) to `w-48` (192px)
- Removed `useTaskEvents` import (no more SSE log stream)
- Removed `isScanning` prop and `hasResult` for completion (now handled by quick actions)
- 3 modes: config preview (wizStep < 2), progress dots (generating), quick actions (!generating && has result)
- Progress dots: 5 vertical dots with connecting lines, no descriptions, no log stream
- Quick actions: 6 buttons that trigger callbacks, download buttons shown only when corresponding files exist
- Downloaded files use actual filenames from `foundFiles`

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/execution-panel.tsx
git commit -m "refactor(usecase-gen): ExecutionPanel 3 modes — config preview / progress dots / quick actions"
```

---

### Task 6: Refactor generate-wizard.tsx — integrate all components and fix layout

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx` (major changes to Step 3)

This task has multiple sub-steps due to the scope of changes. We'll work sequentially.

- [ ] **Step 1: Add imports for new components**

Replace the import section near the top. Find:

```tsx
import { ExecutionPanel } from "./shared/execution-panel";
```

Add after it:

```tsx
import { OutputFiles } from "./shared/output-files";
import { AITweakPanel } from "./shared/ai-tweak-panel";
import { RatingPanel } from "./shared/rating-panel";
import { ModuleOverviewTable } from "./shared/module-overview-table";
```

Also remove unused imports: `Send, Download, RefreshCw, Edit3, ArrowRight` from `lucide-react` (they move to child components or remain for bottom buttons). Keep: `Upload, Loader2, FileText, CheckCircle2, ArrowLeft, ChevronRight, Wand2, AlertTriangle, BarChart3, Clock, Target, FileCheck, ArrowRight, RefreshCw, Edit3`.

Actually, keep all imports for now — unused imports can be cleaned in a later pass. The important ones to keep for Step 3 bottom buttons: `ArrowLeft, Edit3, ArrowRight`.

- [ ] **Step 2: Replace Step 3 generating state — add usecaseTree guard**

Find the block starting at `{generating && (` (around line 403). Replace the condition to differentiate initial generation vs tweak:

```tsx
{/* Initial generating state — no tree yet (first generation) */}
{generating && !usecaseTree && (
  <div className="bg-card rounded-xl shadow-sm p-10 text-center">
    <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-primary/10 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
    <h3 className="font-semibold text-lg mb-2">AI 正在生成测试用例</h3>
    <p className="text-sm text-muted-foreground">{genStatus || "正在解析需求文档..."}</p>
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
  </div>
)}

{/* Generating state — tree already exists (tweak in progress) */}
{generating && usecaseTree && usecaseTree.length > 0 && (
  <div className="bg-card rounded-xl shadow-sm p-4 mb-4 flex items-center gap-3 border border-primary/20">
    <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
    <div>
      <p className="text-sm font-medium text-foreground">微调中...</p>
      <p className="text-xs text-muted-foreground">{genStatus || "AI 正在基于已有用例进行修改"}</p>
    </div>
    <button
      onClick={() => {
        cancelTask.mutate(taskId!);
        scanner.stop();
        setGenerating(false);
        setGenStatus("");
      }}
      disabled={cancelTask.isPending}
      className="ml-auto border border-red-200 text-red-500 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-40"
    >
      取消微调
    </button>
  </div>
)}
```

- [ ] **Step 3: Replace the completed result section with reordered layout**

The completed results section starts at `{!generating && genStatus !== "生成失败" && usecaseTree && usecaseTree.length > 0 && (`. Keep the KPI cards as-is. Then replace everything after the KPI cards (from line 490 onwards within that block) with:

```tsx
{/* Output files — between KPI and AI tweak */}
<OutputFiles
  taskId={taskId}
  files={Array.from(new Set([...scanner.foundFiles, ...loadedFiles]))}
/>

{/* AI Tweak */}
<AITweakPanel
  taskId={taskId}
  generating={generating}
  modules={usecaseTree.map((m) => m.name)}
  onTweakStarted={() => {
    setGenerating(true);
    setGenStatus("正在微调用例...");
  }}
/>

{/* Rating */}
<RatingPanel taskId={taskId} />

{/* Module table — collapsed by default */}
<ModuleOverviewTable
  modules={usecaseTree}
  totalCases={usecaseTree.reduce((s, m) => s + m.cases.length, 0)}
/>

{/* Bottom action buttons */}
<div className="flex justify-between">
  <button
    onClick={() => {
      setWizStep(0);
      setGenerating(false);
      setGenStatus("");
    }}
    className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 flex items-center gap-2 transition-colors"
  >
    <ArrowLeft className="w-4 h-4" />
    重新配置
  </button>
  <button
    onClick={() => onNavigateToTab?.(2)}
    className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm flex items-center gap-2 transition-all hover:bg-primary/90"
  >
    <Edit3 className="w-4 h-4" />
    去编辑用例
    <ArrowRight className="w-4 h-4" />
  </button>
</div>
```

Remove the old inline module table (lines 490-537), old output files section (lines 539-560), and old action buttons (lines 562-572).

- [ ] **Step 4: Replace the ExecutionPanel prop block**

Find the `{/* Right: Execution Panel */}` section (lines 594-610). Replace with:

```tsx
{/* Right: Execution Panel */}
<ExecutionPanel
  taskId={taskId}
  generating={generating}
  wizStep={wizStep}
  hasResult={!generating && !!usecaseTree && usecaseTree.length > 0}
  configSummary={{
    source: uploadedFiles.length > 0
      ? uploadedFiles.map((f) => f.name).join(", ")
      : selectedReq
      ? "最近需求"
      : requirementText
      ? "文本输入"
      : "未选择",
    capabilities: `${capabilities.filter((c) => c.selected).length} / ${capabilities.length}`,
    dimensions: `${dimensions.filter((d) => d.active).length} 个`,
    fewShot: `${fewShot.filter((f) => f.selected).length} 份`,
  }}
  foundFiles={Array.from(new Set([...scanner.foundFiles, ...loadedFiles]))}
  onDownloadFile={(fileName) => {
    if (!taskId) return;
    window.open(`/api/tasks/${taskId}/download?file=${encodeURIComponent(fileName)}`);
  }}
  onScrollToAITweak={() => {
    document.querySelector("[data-ai-tweak]")?.scrollIntoView({ behavior: "smooth" });
  }}
  onScrollToRating={() => {
    document.querySelector("[data-rating]")?.scrollIntoView({ behavior: "smooth" });
  }}
  onNavigateToEditor={() => onNavigateToTab?.(2)}
  onReconfigure={() => {
    setWizStep(0);
    setGenerating(false);
    setGenStatus("");
  }}
/>
```

- [ ] **Step 5: Add data attributes to AI Tweak and Rating panels for scroll targets**

In the AITweakPanel div, add `data-ai-tweak`:

```tsx
<div className="bg-card rounded-xl shadow-sm p-5" data-ai-tweak>
```

In the RatingPanel div, add `data-rating`:

```tsx
<div className="bg-card rounded-xl shadow-sm p-5" data-rating>
```

- [ ] **Step 6: Remove unused state variables**

Remove `injectInput` and `tweakInput` state lines (lines 69-71) since AITweakPanel manages its own input state now. Keep `injectSent` for now (may be unused, can be cleaned). Keep `iterationCount` — it's unused now but removed in cleanup.

- [ ] **Step 7: Verify the file compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

Expected: no new TypeScript errors in generate-wizard.tsx.

- [ ] **Step 8: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx
git add components/usecase-gen/shared/ai-tweak-panel.tsx
git add components/usecase-gen/shared/rating-panel.tsx
git commit -m "refactor(usecase-gen): integrate new components, reorder Step 3 layout"
```

---

### Task 7: Create inject API route

**Files:**
- Create: `app/api/tasks/[id]/inject/route.ts`

- [ ] **Step 1: Create inject route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSandboxPath, validatePath } from "@/lib/sandbox";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs/promises";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const taskId = params.id;
    const { instruction, scope } = await req.json();

    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json(
        { error: "instruction is required" },
        { status: 400 }
      );
    }

    // Verify task exists
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Build inject message
    const fullInstruction = scope
      ? `${instruction}\n\n[Scope: 仅针对"${scope}"模块]`
      : instruction;

    // Write inject instruction to a control file in the sandbox
    // The CLI process monitors this file for inject commands
    const sandboxDir = getSandboxPath(taskId);
    const injectFile = path.join(sandboxDir, ".inject");
    await fs.appendFile(injectFile, `${fullInstruction}\n`, "utf-8");

    return NextResponse.json({ accepted: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Inject failed";
    console.error("Inject error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

The inject mechanism writes user instruction to a `.inject` control file in the task sandbox. The CLI session polls/monitors this file and picks up new instructions.

- [ ] **Step 2: Commit**

```bash
git add app/api/tasks/\[id\]/inject/route.ts
git commit -m "feat(api): add POST /api/tasks/:id/inject for runtime instruction injection"
```

---

### Task 8: Create tweak API route

**Files:**
- Create: `app/api/tasks/[id]/tweak/route.ts`

- [ ] **Step 1: Create tweak route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOutputPath } from "@/lib/sandbox";
import { executeTask } from "@/lib/task-executor";
import path from "path";
import fs from "fs/promises";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const taskId = params.id;
    const { instruction, scope } = await req.json();

    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json(
        { error: "instruction is required" },
        { status: 400 }
      );
    }

    // Verify task exists and is completed
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Build tweak prompt: existing output as context + new instruction
    const outputDir = getOutputPath(taskId);

    // Read existing test case markdown output
    let existingOutput = "";
    try {
      const files = await fs.readdir(outputDir);
      const mdFile = files.find(
        (f) => f.includes("测试用例") && f.endsWith(".md")
      );
      if (mdFile) {
        existingOutput = await fs.readFile(
          path.join(outputDir, mdFile),
          "utf-8"
        );
      }
    } catch {
      // output dir may not exist yet
    }

    const scopeDirective = scope
      ? `\n\n修改范围：仅针对"${scope}"模块`
      : "";

    const tweakInput =
      `以下是已生成的测试用例：\n\n${existingOutput}\n\n---\n\n用户微调指令：${instruction}${scopeDirective}\n\n请在已有测试用例基础上进行修改，保持格式一致，只修改涉及的部分，不要重新生成全部内容。`;

    // Update task input with tweak instruction and re-execute
    await prisma.task.update({
      where: { id: taskId },
      data: { input: task.input || tweakInput },
    });

    // Re-execute the task with the tweak context
    await executeTask(taskId);

    return NextResponse.json({ accepted: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tweak failed";
    console.error("Tweak error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Check if `executeTask` is exported from lib/task-executor**

```bash
grep -n "export.*executeTask" lib/task-executor.ts || echo "NOT FOUND"
```

If not found, check the actual export name:

```bash
grep -n "export" lib/task-executor.ts | head -10
```

If the function is named differently (e.g., `runTask`), adjust the import in the route accordingly.

- [ ] **Step 3: Commit**

```bash
git add app/api/tasks/\[id\]/tweak/route.ts
git commit -m "feat(api): add POST /api/tasks/:id/tweak for conversational modification"
```

---

### Task 9: Update ExecutionPanel tests

**Files:**
- Modify: `components/usecase-gen/shared/__tests__/execution-panel.test.tsx`

- [ ] **Step 1: Rewrite test file for new props and 3 modes**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionPanel } from "../execution-panel";

const defaultConfig = {
  source: "文本输入",
  capabilities: "3/4",
  dimensions: "3 个",
  fewShot: "1 份",
};

const noop = () => {};

describe("ExecutionPanel", () => {
  describe("Mode 1: Config Preview (wizStep < 2)", () => {
    it("renders config summary on Step 0", () => {
      render(
        <ExecutionPanel
          taskId={null} generating={false} wizStep={0} hasResult={false}
          configSummary={defaultConfig} foundFiles={[]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onScrollToRating={noop} onNavigateToEditor={noop}
          onReconfigure={noop}
        />
      );
      expect(screen.getByText("当前配置预览")).toBeDefined();
      expect(screen.getByText("文本输入")).toBeDefined();
      expect(screen.getByText("3/4")).toBeDefined();
    });

    it("renders config summary on Step 1", () => {
      render(
        <ExecutionPanel
          taskId={null} generating={false} wizStep={1} hasResult={false}
          configSummary={defaultConfig} foundFiles={[]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onScrollToRating={noop} onNavigateToEditor={noop}
          onReconfigure={noop}
        />
      );
      expect(screen.getByText("当前配置预览")).toBeDefined();
    });
  });

  describe("Mode 2: Progress Dots (wizStep 2 + generating)", () => {
    it("renders 5 workflow nodes as progress dots", () => {
      render(
        <ExecutionPanel
          taskId="test-id" generating={true} wizStep={2} hasResult={false}
          configSummary={defaultConfig} foundFiles={[]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onScrollToRating={noop} onNavigateToEditor={noop}
          onReconfigure={noop}
        />
      );
      expect(screen.getByText("生成中")).toBeDefined();
      expect(screen.getByText("文档解析")).toBeDefined();
      expect(screen.getByText("LLM 生成")).toBeDefined();
      expect(screen.getByText("导出格式化")).toBeDefined();
    });

    it("marks nodes as done based on foundFiles", () => {
      render(
        <ExecutionPanel
          taskId="test-id" generating={true} wizStep={2} hasResult={false}
          configSummary={defaultConfig} foundFiles={["_source.md"]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onScrollToRating={noop} onNavigateToEditor={noop}
          onReconfigure={noop}
        />
      );
      // "文档解析" should be done (source file found), others running/wait
      const docParse = screen.getByText("文档解析");
      expect(docParse.className).toContain("text-green-700");
    });
  });

  describe("Mode 3: Quick Actions (wizStep 2 + !generating + has result)", () => {
    const foundFiles = ["测试用例.md", "测试用例.xmind"];

    it("renders quick action buttons when files exist", () => {
      render(
        <ExecutionPanel
          taskId="test-id" generating={false} wizStep={2} hasResult={true}
          configSummary={defaultConfig} foundFiles={foundFiles}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onScrollToRating={noop} onNavigateToEditor={noop}
          onReconfigure={noop}
        />
      );
      expect(screen.getByText("快捷操作")).toBeDefined();
      expect(screen.getByText("下载 Markdown")).toBeDefined();
      expect(screen.getByText("下载 XMind")).toBeDefined();
      expect(screen.getByText("AI 微调")).toBeDefined();
      expect(screen.getByText("评价")).toBeDefined();
      expect(screen.getByText("去编辑用例")).toBeDefined();
      expect(screen.getByText("重新配置")).toBeDefined();
    });

    it("calls onDownloadFile when download button clicked", () => {
      const onDownload = vi.fn();
      render(
        <ExecutionPanel
          taskId="test-id" generating={false} wizStep={2} hasResult={true}
          configSummary={defaultConfig} foundFiles={foundFiles}
          onDownloadFile={onDownload} onScrollToAITweak={noop}
          onScrollToRating={noop} onNavigateToEditor={noop}
          onReconfigure={noop}
        />
      );
      fireEvent.click(screen.getByText("下载 Markdown"));
      expect(onDownload).toHaveBeenCalledWith("测试用例.md");
    });

    it("calls onReconfigure when clicked", () => {
      const onReconfig = vi.fn();
      render(
        <ExecutionPanel
          taskId="test-id" generating={false} wizStep={2} hasResult={true}
          configSummary={defaultConfig} foundFiles={foundFiles}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onScrollToRating={noop} onNavigateToEditor={noop}
          onReconfigure={onReconfig}
        />
      );
      fireEvent.click(screen.getByText("重新配置"));
      expect(onReconfig).toHaveBeenCalled();
    });

    it("emits nothing when no files and no result", () => {
      const { container } = render(
        <ExecutionPanel
          taskId="test-id" generating={false} wizStep={2} hasResult={false}
          configSummary={defaultConfig} foundFiles={[]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onScrollToRating={noop} onNavigateToEditor={noop}
          onReconfigure={noop}
        />
      );
      // Only the empty w-48 wrapper
      expect(screen.queryByText("快捷操作")).toBeNull();
      expect(screen.queryByText("当前配置预览")).toBeNull();
      expect(screen.queryByText("生成中")).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run components/usecase-gen/shared/__tests__/execution-panel.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/usecase-gen/shared/__tests__/execution-panel.test.tsx
git commit -m "test(usecase-gen): update ExecutionPanel tests for 3 modes"
```

---

### Task 10: Integration — run full test suite and type-check

**Files:**
- No new files

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Fix any type errors. Common issues:
- `executeTask` import path in tweak route — verify with `grep -r "export.*function.*execute" lib/`
- Missing props in generate-wizard.tsx for new components
- Unused imports (clean them up)

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all existing tests pass + new execution-panel tests pass.

- [ ] **Step 3: Start dev server and verify visually**

```bash
npm run dev
```

Manual verification checklist:
1. Open `/usecase-gen`, go through wizard Step 0 → Step 1 → Step 2 (generate)
2. Verify sidebar shows config preview on Steps 0/1
3. Verify sidebar shows progress dots during generation
4. After completion, verify: KPI cards → Output files (with download) → AI Tweak → Rating → Module table (collapsed) → Bottom buttons
5. Verify sidebar shows quick actions panel (6 buttons)
6. Click "下载 Markdown" — verify download starts
7. Click "AI 微调" in sidebar — verify it scrolls to AITweakPanel
8. Send a tweak instruction — verify tweak starts and result updates
9. Click stars in RatingPanel — verify submission works
10. Expand module table — verify full table renders
11. Navigate from history — verify sidebar shows quick actions (no progress)

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(usecase-gen): integration fixes for V3 layout"
```
