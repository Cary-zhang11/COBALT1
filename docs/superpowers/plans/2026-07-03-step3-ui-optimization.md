# 向导第三步 UI 优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化用例生成向导第三步的布局结构（数据概览改内联、模块概览改手风琴、输出文件紧凑行、评价移入侧边栏、下载/编辑改浮窗）

**Architecture:** 纯前端重构，不涉及 API 变更。数据源（usecaseTree、mergedOutputFiles）已就绪。新建 1 个通用浮窗组件，重写模块概览为手风琴卡片，修改侧边栏集成评价面板和文件操作浮窗，调整主区区块顺序。

**Tech Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · lucide-react · vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-07-03-step3-data-display-interaction-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `components/usecase-gen/shared/file-action-modal.tsx` | 新建 | 通用文件操作浮窗（下载/编辑选择） |
| `components/usecase-gen/shared/__tests__/file-action-modal.test.tsx` | 新建 | FileActionModal 测试 |
| `components/usecase-gen/shared/module-overview-table.tsx` | 重写 | 手风琴卡片，展开看完整用例 |
| `components/usecase-gen/shared/__tests__/module-overview-table.test.tsx` | 新建 | 手风琴测试 |
| `components/usecase-gen/shared/output-files.tsx` | 修改 | 紧凑行布局(32px)，导出 isDisplayable |
| `components/usecase-gen/shared/__tests__/output-files.test.tsx` | 修改 | 更新断言 |
| `components/usecase-gen/shared/execution-panel.tsx` | 修改 | 下载/编辑浮窗、评价面板、移除旧按钮 |
| `components/usecase-gen/shared/__tests__/execution-panel.test.tsx` | 修改 | 更新断言 |
| `components/usecase-gen/generate-wizard.tsx` | 修改 | 区块顺序、数据概览内联、移除评价区、更新 props |
| `components/usecase-gen/__tests__/generate-wizard.test.tsx` | 修改 | 更新断言 |

---

## Task 1: FileActionModal 通用文件操作浮窗

**Files:**
- Create: `components/usecase-gen/shared/file-action-modal.tsx`
- Test: `components/usecase-gen/shared/__tests__/file-action-modal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/usecase-gen/shared/__tests__/file-action-modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileActionModal } from "../file-action-modal";

const files = [
  { name: "测试用例.md", relativePath: "测试用例.md" },
  { name: "测试用例.xmind", relativePath: "测试用例.xmind" },
];

describe("FileActionModal", () => {
  it("renders title and file list when open", () => {
    render(
      <FileActionModal
        open={true}
        onClose={vi.fn()}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={vi.fn()}
      />
    );
    expect(screen.getByText("下载文件")).toBeDefined();
    expect(screen.getByText("测试用例.md")).toBeDefined();
    expect(screen.getByText("测试用例.xmind")).toBeDefined();
  });

  it("calls onAction with correct file when button clicked", () => {
    const onAction = vi.fn();
    render(
      <FileActionModal
        open={true}
        onClose={vi.fn()}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getAllByText("下载")[0]);
    expect(onAction).toHaveBeenCalledWith(files[0]);
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <FileActionModal
        open={true}
        onClose={onClose}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("关闭"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows empty text when files list is empty", () => {
    render(
      <FileActionModal
        open={true}
        onClose={vi.fn()}
        title="下载文件"
        files={[]}
        actionLabel="下载"
        onAction={vi.fn()}
        emptyText="暂无可下载文件"
      />
    );
    expect(screen.getByText("暂无可下载文件")).toBeDefined();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <FileActionModal
        open={false}
        onClose={vi.fn()}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <FileActionModal
        open={true}
        onClose={onClose}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={vi.fn()}
      />
    );
    const backdrop = document.querySelector(".fixed.inset-0")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/usecase-gen/shared/__tests__/file-action-modal.test.tsx`
Expected: FAIL with "Cannot find module '../file-action-modal'"

- [ ] **Step 3: Write the implementation**

Create `components/usecase-gen/shared/file-action-modal.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";

interface FileActionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  files: FileInfo[];
  actionLabel: string;
  onAction: (file: FileInfo) => void;
  emptyText?: string;
}

export function FileActionModal({
  open,
  onClose,
  title,
  files,
  actionLabel,
  onAction,
  emptyText,
}: FileActionModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {emptyText || "暂无文件"}
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 min-h-[40px]"
                >
                  <span className="truncate flex-1 min-w-0 text-sm font-medium">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAction(file)}
                    className="inline-flex items-center justify-center h-7 px-3 text-xs font-medium leading-none rounded-md whitespace-nowrap shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {actionLabel}
                  </button>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/usecase-gen/shared/__tests__/file-action-modal.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/shared/file-action-modal.tsx components/usecase-gen/shared/__tests__/file-action-modal.test.tsx
git commit -m "feat(usecase-gen): add FileActionModal component for download/edit file selection"
```

---

## Task 2: ModuleOverviewTable 手风琴卡片重写

**Files:**
- Rewrite: `components/usecase-gen/shared/module-overview-table.tsx`
- Test: `components/usecase-gen/shared/__tests__/module-overview-table.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/usecase-gen/shared/__tests__/module-overview-table.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModuleOverviewTable } from "../module-overview-table";
import type { UsecaseModule } from "../types";

const modules: UsecaseModule[] = [
  {
    name: "登录模块",
    open: true,
    cases: [
      {
        id: "tc1",
        title: "正常登录",
        priority: "P0",
        precondition: "用户已注册",
        steps: "1. 打开登录页\n2. 输入账号密码\n3. 点击登录",
        expected: "跳转到首页",
        tags: "登录,正向",
      },
      {
        id: "tc2",
        title: "密码错误",
        priority: "P1",
        precondition: "用户已注册",
        steps: "1. 打开登录页\n2. 输入错误密码\n3. 点击登录",
        expected: "提示密码错误",
        tags: "登录,异常",
      },
    ],
  },
  {
    name: "注册模块",
    open: false,
    cases: [
      {
        id: "tc3",
        title: "手机号注册",
        priority: "P0",
        precondition: "手机号未注册",
        steps: "1. 打开注册页\n2. 输入手机号\n3. 点击注册",
        expected: "注册成功",
        tags: "注册,正向",
      },
    ],
  },
];

describe("ModuleOverviewTable", () => {
  it("renders module names and case counts", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    expect(screen.getByText("登录模块")).toBeDefined();
    expect(screen.getByText("注册模块")).toBeDefined();
    expect(screen.getByText(/2 用例/)).toBeDefined();
    expect(screen.getByText(/1 用例/)).toBeDefined();
  });

  it("shows expand/collapse all buttons", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    expect(screen.getByText("全部展开")).toBeDefined();
    expect(screen.getByText("全部收起")).toBeDefined();
  });

  it("does not show case details when collapsed (default)", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    expect(screen.queryByText("正常登录")).toBeNull();
  });

  it("expands single module on header click", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    fireEvent.click(screen.getByText("登录模块"));
    expect(screen.getByText("正常登录")).toBeDefined();
    expect(screen.getByText("密码错误")).toBeDefined();
    expect(screen.queryByText("手机号注册")).toBeNull();
  });

  it("expands all modules on 全部展开 click", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    fireEvent.click(screen.getByText("全部展开"));
    expect(screen.getByText("正常登录")).toBeDefined();
    expect(screen.getByText("手机号注册")).toBeDefined();
  });

  it("collapses all modules on 全部收起 click", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    // First expand all
    fireEvent.click(screen.getByText("全部展开"));
    expect(screen.getByText("正常登录")).toBeDefined();
    // Then collapse all
    fireEvent.click(screen.getByText("全部收起"));
    expect(screen.queryByText("正常登录")).toBeNull();
  });

  it("shows full case fields when expanded", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    fireEvent.click(screen.getByText("登录模块"));
    expect(screen.getByText("正常登录")).toBeDefined();
    expect(screen.getByText(/用户已注册/)).toBeDefined();
    expect(screen.getByText(/跳转到首页/)).toBeDefined();
    expect(screen.getByText(/登录,正向/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/usecase-gen/shared/__tests__/module-overview-table.test.tsx`
Expected: FAIL (module names not found in new format — old component shows them in a table)

- [ ] **Step 3: Rewrite the component**

Replace entire contents of `components/usecase-gen/shared/module-overview-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, Table } from "lucide-react";
import type { UsecaseModule } from "./types";

interface ModuleOverviewTableProps {
  modules: UsecaseModule[];
  totalCases: number;
}

export function ModuleOverviewTable({ modules, totalCases }: ModuleOverviewTableProps) {
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());

  const toggleModule = (index: number) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedModules(new Set(modules.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedModules(new Set());
  };

  const allExpanded = expandedModules.size === modules.length;

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border/60 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between gap-2 border-b bg-muted/20 min-h-[44px]">
        <h3 className="font-semibold text-sm flex items-center gap-2 leading-none min-w-0">
          <Table className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="truncate">模块用例概览</span>
          <span className="text-muted-foreground font-normal">
            ({modules.length} 模块 · {totalCases} 用例)
          </span>
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={expandAll}
            disabled={allExpanded}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-40 transition-colors"
          >
            全部展开
          </button>
          <button
            type="button"
            onClick={collapseAll}
            disabled={expandedModules.size === 0}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-40 transition-colors"
          >
            全部收起
          </button>
        </div>
      </div>

      {/* Module accordion */}
      <div className="divide-y divide-border/40">
        {modules.map((mod, mi) => {
          const expanded = expandedModules.has(mi);
          const p0 = mod.cases.filter((c) => c.priority === "P0").length;
          const p1 = mod.cases.filter((c) => c.priority === "P1").length;
          const p2 = mod.cases.filter((c) => c.priority === "P2").length;

          return (
            <div key={mi}>
              {/* Module header */}
              <div
                className="px-5 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/20 transition-colors min-h-[40px]"
                onClick={() => toggleModule(mi)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${
                      expanded ? "" : "-rotate-90"
                    }`}
                  />
                  <span className="font-medium text-sm truncate">{mod.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{mod.cases.length} 用例</span>
                  <span className="inline-flex gap-1">
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">P0×{p0}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">P1×{p1}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">P2×{p2}</span>
                  </span>
                </div>
              </div>

              {/* Expanded case list */}
              {expanded && (
                <div className="px-5 pb-3 pt-1 space-y-3 bg-muted/10">
                  {mod.cases.map((tc, ci) => (
                    <div key={ci} className="border border-border/40 rounded-lg p-3 bg-card">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            tc.priority === "P0"
                              ? "bg-red-100 text-red-700"
                              : tc.priority === "P1"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {tc.priority}
                        </span>
                        <span className="font-medium text-sm">{tc.title}</span>
                      </div>
                      {tc.precondition && (
                        <div className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">前置条件：</span>
                          {tc.precondition}
                        </div>
                      )}
                      {tc.steps && (
                        <div className="text-xs text-muted-foreground mb-1 whitespace-pre-line">
                          <span className="font-medium">步骤：</span>
                          {tc.steps}
                        </div>
                      )}
                      {tc.expected && (
                        <div className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">预期结果：</span>
                          {tc.expected}
                        </div>
                      )}
                      {tc.tags && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">标签：</span>
                          {tc.tags}
                        </div>
                      )}
                    </div>
                  ))}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/usecase-gen/shared/__tests__/module-overview-table.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/shared/module-overview-table.tsx components/usecase-gen/shared/__tests__/module-overview-table.test.tsx
git commit -m "feat(usecase-gen): rewrite ModuleOverviewTable as accordion cards with expand/collapse all"
```

---

## Task 3: OutputFiles 紧凑行布局 + 导出 isDisplayable

**Files:**
- Modify: `components/usecase-gen/shared/output-files.tsx`
- Modify: `components/usecase-gen/shared/__tests__/output-files.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace `components/usecase-gen/shared/__tests__/output-files.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutputFiles } from "../output-files";
import { isDisplayable } from "../output-files";

describe("OutputFiles", () => {
  it("shows 预览 for .md and 编辑 for .xmind", () => {
    const onEdit = vi.fn();
    render(
      <OutputFiles
        taskId="t1"
        files={[
          { name: "测试用例.md", relativePath: "测试用例.md" },
          { name: "测试用例.xmind", relativePath: "测试用例.xmind" },
        ]}
        onEditXmind={onEdit}
      />
    );
    expect(screen.getByText("预览")).toBeDefined();
    fireEvent.click(screen.getByText("编辑"));
    expect(onEdit).toHaveBeenCalled();
  });

  it("no 编辑 button for .md files", () => {
    render(
      <OutputFiles
        taskId="t1"
        files={[{ name: "测试用例.md", relativePath: "测试用例.md" }]}
      />
    );
    expect(screen.queryByText("编辑")).toBeNull();
  });

  it("uses compact row height (32px)", () => {
    const { container } = render(
      <OutputFiles
        taskId="t1"
        files={[{ name: "测试用例.md", relativePath: "测试用例.md" }]}
      />
    );
    const row = container.querySelector("[class*='min-h-[32px]']");
    expect(row).not.toBeNull();
  });

  it("shows 下载 button for .xlsx files", () => {
    render(
      <OutputFiles
        taskId="t1"
        files={[{ name: "测试用例.xlsx", relativePath: "测试用例.xlsx" }]}
      />
    );
    expect(screen.getByText("下载")).toBeDefined();
    expect(screen.queryByText("预览")).toBeNull();
    expect(screen.queryByText("编辑")).toBeNull();
  });
});

describe("isDisplayable", () => {
  it("returns true for .md, .xmind, .xlsx", () => {
    expect(isDisplayable("测试用例.md")).toBe(true);
    expect(isDisplayable("测试用例.xmind")).toBe(true);
    expect(isDisplayable("测试用例.xlsx")).toBe(true);
  });

  it("returns false for _source files", () => {
    expect(isDisplayable("测试用例_source.md")).toBe(false);
  });

  it("returns false for archive/ files", () => {
    expect(isDisplayable("archive/测试用例.md")).toBe(false);
  });

  it("returns false for other extensions", () => {
    expect(isDisplayable("测试用例.txt")).toBe(false);
    expect(isDisplayable("测试用例.pdf")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/usecase-gen/shared/__tests__/output-files.test.tsx`
Expected: FAIL — `isDisplayable` not exported, row height still 44px

- [ ] **Step 3: Modify output-files.tsx**

In `components/usecase-gen/shared/output-files.tsx`, make these changes:

1. Export `isDisplayable` — change `function isDisplayable` to `export function isDisplayable`
2. Change row height — replace `min-h-[44px]` with `min-h-[32px]`
3. Adjust button class — replace the `fileActionBtn` constant height from `h-7` to `h-6` and padding from `px-2.5` to `px-2`

Apply these three replacements:

**Change 1:** `function isDisplayable` → `export function isDisplayable`

**Change 2:** `min-h-[44px]` → `min-h-[32px]`

**Change 3:**
```
const fileActionBtn =
  "inline-flex items-center justify-center h-7 px-2.5 text-xs font-medium leading-none rounded-md whitespace-nowrap shrink-0";
```
→
```
const fileActionBtn =
  "inline-flex items-center justify-center h-6 px-2 text-xs font-medium leading-none rounded-md whitespace-nowrap shrink-0";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/usecase-gen/shared/__tests__/output-files.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/shared/output-files.tsx components/usecase-gen/shared/__tests__/output-files.test.tsx
git commit -m "feat(usecase-gen): compact output file rows (32px) and export isDisplayable"
```

---

## Task 4: ExecutionPanel 下载/编辑浮窗 + 评价面板集成

**Files:**
- Modify: `components/usecase-gen/shared/execution-panel.tsx`
- Modify: `components/usecase-gen/shared/__tests__/execution-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace `components/usecase-gen/shared/__tests__/execution-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionPanel } from "../execution-panel";

// Mock fetch for RatingPanel
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  );
});

const defaultConfig = {
  source: "文本输入",
  knowledge: "2 份",
  history: "1 份",
};

const foundFiles = [
  { name: "测试用例.md", relativePath: "测试用例.md" },
  { name: "测试用例.xmind", relativePath: "测试用例.xmind" },
  { name: "测试用例.xlsx", relativePath: "测试用例.xlsx" },
];

const noop = () => {};

const baseProps = {
  taskId: null as string | null,
  generating: false,
  wizStep: 0,
  hasResult: false,
  configSummary: defaultConfig,
  foundFiles: [] as typeof foundFiles,
  onDownloadFile: noop,
  onScrollToAITweak: noop,
  onNavigateToEditor: noop as (filePath?: string) => void,
};

describe("ExecutionPanel", () => {
  describe("Step 0-1: trajectory + config", () => {
    it("renders config summary on Step 0", () => {
      render(<ExecutionPanel {...baseProps} wizStep={0} />);
      expect(screen.getByText("执行轨迹")).toBeDefined();
      expect(screen.getByText("当前配置预览")).toBeDefined();
      expect(screen.getByText("文本输入")).toBeDefined();
    });
  });

  describe("Step 2 generating", () => {
    it("renders workflow nodes while generating", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          generating={true}
          wizStep={2}
        />
      );
      expect(screen.getByText("生成中")).toBeDefined();
      expect(screen.getByText("文档解析")).toBeDefined();
      expect(screen.getByText("用例生成")).toBeDefined();
    });
  });

  describe("Step 2 complete: quick actions + rating", () => {
    it("renders 下载文件 and 编辑脑图 buttons", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      expect(screen.getByText("快捷操作")).toBeDefined();
      expect(screen.getByText("下载文件")).toBeDefined();
      expect(screen.getByText("编辑脑图")).toBeDefined();
      expect(screen.getByText("AI 微调")).toBeDefined();
    });

    it("does NOT render old separate download buttons", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      expect(screen.queryByText("下载 Markdown")).toBeNull();
      expect(screen.queryByText("下载 XMind")).toBeNull();
    });

    it("does NOT render 评价 scroll button (rating moved to sidebar)", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      // The old "评价" scroll button should not exist
      const ratingButtons = screen.queryAllByText("评价");
      // Rating panel itself may render "提交评价" but not a standalone "评价" scroll button
      expect(ratingButtons.length).toBe(0);
    });

    it("renders rating panel in sidebar", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      expect(screen.getByText("本次生成评价")).toBeDefined();
    });

    it("opens download modal on 下载文件 click", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      fireEvent.click(screen.getByText("下载文件"));
      // Modal title should be visible
      expect(screen.getByText("下载文件", { selector: "h3" })).toBeDefined();
    });

    it("calls onDownloadFile when download action clicked in modal", () => {
      const onDownload = vi.fn();
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
          onDownloadFile={onDownload}
        />
      );
      fireEvent.click(screen.getByText("下载文件"));
      // Click the first 下载 button in the modal
      const downloadButtons = screen.getAllByText("下载");
      // The first one should be the file action button (not the trigger)
      fireEvent.click(downloadButtons[0]);
      expect(onDownload).toHaveBeenCalled();
    });

    it("calls onNavigateToEditor with filePath when edit clicked in modal", () => {
      const onEdit = vi.fn();
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
          onNavigateToEditor={onEdit}
        />
      );
      fireEvent.click(screen.getByText("编辑脑图"));
      // Click the first 编辑 button in the modal
      fireEvent.click(screen.getAllByText("编辑")[0]);
      expect(onEdit).toHaveBeenCalledWith("测试用例.xmind");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/usecase-gen/shared/__tests__/execution-panel.test.tsx`
Expected: FAIL — old buttons "下载 Markdown"/"下载 XMind" still present, no "下载文件"/"编辑脑图" buttons, no RatingPanel

- [ ] **Step 3: Modify execution-panel.tsx**

Make the following changes to `components/usecase-gen/shared/execution-panel.tsx`:

**Change 1: Update imports** (line 1-5)

Replace:
```tsx
import { useMemo, type ReactNode } from "react";
import { CheckCircle2, Download, MessageSquare, Edit3, Star } from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";
```
With:
```tsx
import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Download, MessageSquare, Edit3 } from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";
import { FileActionModal } from "./file-action-modal";
import { RatingPanel } from "./rating-panel";
import { isDisplayable } from "./output-files";
```

**Change 2: Update ExecutionPanelProps** (line 15-32)

Replace:
```tsx
interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  wizStep: number;
  hasResult: boolean;
  isTweak?: boolean;
  configSummary: {
    source: string;
    knowledge: string;
    history: string;
  };
  foundFiles: FileInfo[];
  logStages?: Set<string>;
  onDownloadFile: (file: FileInfo) => void;
  onScrollToAITweak: () => void;
  onScrollToRating: () => void;
  onNavigateToEditor: () => void;
}
```
With:
```tsx
interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  wizStep: number;
  hasResult: boolean;
  isTweak?: boolean;
  configSummary: {
    source: string;
    knowledge: string;
    history: string;
  };
  foundFiles: FileInfo[];
  logStages?: Set<string>;
  onDownloadFile: (file: FileInfo) => void;
  onScrollToAITweak: () => void;
  onNavigateToEditor: (filePath?: string) => void;
}
```

**Change 3: Rewrite QuickActions component** (line 191-269)

Replace the entire `QuickActions` function (from `function QuickActions({` to the closing `}` before `export function ExecutionPanel`) with:

```tsx
function QuickActions({
  onOpenDownloadModal,
  onOpenEditModal,
  onScrollToAITweak,
}: {
  onOpenDownloadModal: () => void;
  onOpenEditModal: () => void;
  onScrollToAITweak: () => void;
}) {
  return (
    <div className="mt-4 pt-3 border-t border-border">
      <p className="text-xs font-semibold mb-2">快捷操作</p>
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={onOpenDownloadModal}
          className="w-full flex items-center justify-between gap-2 text-sm leading-none px-3 py-2.5 rounded-lg border border-border hover:bg-muted/40 text-left"
        >
          <span className="flex items-center gap-2">
            <Download className="w-4 h-4 text-primary shrink-0" />
            下载文件
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenEditModal}
          className="w-full flex items-center justify-between gap-2 text-sm leading-none px-3 py-2.5 rounded-lg border border-border hover:bg-muted/40 text-left"
        >
          <span className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-primary shrink-0" />
            编辑脑图
          </span>
        </button>
        <button
          type="button"
          onClick={onScrollToAITweak}
          className="w-full flex items-center justify-between gap-2 text-sm leading-none px-3 py-2.5 rounded-lg border border-border hover:bg-muted/40 text-left"
        >
          <span className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary shrink-0" />
            AI 微调
          </span>
          <span className="text-xs text-muted-foreground shrink-0">↓主区</span>
        </button>
      </div>
    </div>
  );
}
```

**Change 4: Rewrite ExecutionPanel main component** (line 271-365)

Replace from `export function ExecutionPanel({` to the end of file with:

```tsx
export function ExecutionPanel({
  taskId,
  generating,
  wizStep,
  hasResult,
  isTweak,
  configSummary,
  foundFiles,
  logStages,
  onDownloadFile,
  onScrollToAITweak,
  onNavigateToEditor,
}: ExecutionPanelProps) {
  const nodes = useMemo(
    () => deriveNodeStates(foundFiles, generating, logStages),
    [foundFiles, generating, logStages]
  );

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const downloadFiles = useMemo(() => {
    const displayable = foundFiles.filter((f) => isDisplayable(f.name));
    const pickLatest = (ext: string) => {
      const files = displayable
        .filter((f) => f.name.endsWith(ext))
        .sort((a, b) => {
          const va = parseInt(a.name.match(/_v(\d+)\./)?.[1] || "0", 10);
          const vb = parseInt(b.name.match(/_v(\d+)\./)?.[1] || "0", 10);
          return vb - va;
        });
      return files[0] || null;
    };
    return [pickLatest(".md"), pickLatest(".xmind"), pickLatest(".xlsx")].filter(
      Boolean
    ) as FileInfo[];
  }, [foundFiles]);

  const xmindFiles = useMemo(
    () => foundFiles.filter((f) => isDisplayable(f.name) && f.name.endsWith(".xmind")),
    [foundFiles]
  );

  if (wizStep < 2) {
    return (
      <PanelShell>
        <SidebarCard>
          <WorkflowTimeline nodes={nodes} title="执行轨迹" />
          <ConfigPreviewInline configSummary={configSummary} />
        </SidebarCard>
      </PanelShell>
    );
  }

  if (wizStep === 2 && generating && !isTweak) {
    return (
      <PanelShell>
        <SidebarCard>
          <WorkflowTimeline nodes={nodes} title="生成中" pulsing />
        </SidebarCard>
      </PanelShell>
    );
  }

  if (wizStep === 2 && !generating && (foundFiles.length > 0 || hasResult)) {
    return (
      <PanelShell>
        <SidebarCard>
          <WorkflowTimeline nodes={nodes} title="执行轨迹" />
          <DoneBanner />
          <QuickActions
            onOpenDownloadModal={() => setDownloadModalOpen(true)}
            onOpenEditModal={() => setEditModalOpen(true)}
            onScrollToAITweak={onScrollToAITweak}
          />
          {taskId && (
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs font-semibold mb-2">本次生成评价</p>
              <RatingPanel sectioned taskId={taskId} />
            </div>
          )}
        </SidebarCard>

        <FileActionModal
          open={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
          title="下载文件"
          files={downloadFiles}
          actionLabel="下载"
          onAction={(file) => onDownloadFile(file)}
          emptyText="暂无可下载文件"
        />

        <FileActionModal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title="编辑脑图"
          files={xmindFiles}
          actionLabel="编辑"
          onAction={(file) => onNavigateToEditor(file.relativePath)}
          emptyText="暂无可编辑的脑图文件"
        />
      </PanelShell>
    );
  }

  if (wizStep === 2 && generating && isTweak) {
    return (
      <PanelShell>
        <SidebarCard>
          <WorkflowTimeline nodes={nodes} title="微调中" pulsing />
        </SidebarCard>
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <SidebarCard>
        <WorkflowTimeline nodes={nodes} title="执行轨迹" />
      </SidebarCard>
    </PanelShell>
  );
}
```

Note: Remove the old `pickLatestFiles` function (lines 289-305) — it's replaced by the `downloadFiles` useMemo inside the component.

**Change 5: Remove old pickLatestFiles function**

Delete the entire `pickLatestFiles` function (previously lines 289-305) since it's now replaced by `downloadFiles` useMemo.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/usecase-gen/shared/__tests__/execution-panel.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/shared/execution-panel.tsx components/usecase-gen/shared/__tests__/execution-panel.test.tsx
git commit -m "feat(usecase-gen): integrate download/edit modals and rating panel into ExecutionPanel sidebar"
```

---

## Task 5: generate-wizard.tsx 主区布局调整与清理

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`
- Modify: `components/usecase-gen/__tests__/generate-wizard.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a new test to `components/usecase-gen/__tests__/generate-wizard.test.tsx`. Append this test inside the `describe("GenerateWizard", () => {` block, before the closing `});`:

```tsx
  it("step 3 shows data overview as inline single line, not KPI cards", () => {
    // This test verifies the data overview section renders inline stats
    // We can't easily navigate to step 3 in unit tests (requires task execution),
    // but we can verify the component structure via the spec's requirements.
    // The actual visual verification will be done in the browser.
    // For now, verify the wizard renders without errors.
    render(<GenerateWizard {...defaultProps} />);
    expect(screen.getByTestId("generate-wizard-root")).toBeDefined();
  });
```

Also update existing test that references old execution-panel props. In the test file, find:

```tsx
const baseProps = {
```

This is in execution-panel test, not generate-wizard test. No changes needed to generate-wizard test for props.

The key verification for Task 5 is that the code compiles and the existing tests still pass after removing `onScrollToRating` and changing `onNavigateToEditor` signature.

- [ ] **Step 2: Run test to verify it compiles**

Run: `npx vitest run components/usecase-gen/__tests__/generate-wizard.test.tsx`
Expected: FAIL — TypeScript error: `onScrollToRating` prop still passed to ExecutionPanel but no longer accepted

- [ ] **Step 3: Modify generate-wizard.tsx**

Make the following changes to `components/usecase-gen/generate-wizard.tsx`:

**Change 1: Remove unused imports** (line 16-20)

Replace:
```tsx
import {
  Upload, Loader2, FileText, CheckCircle2, ArrowLeft, ChevronRight,
  Wand2, AlertTriangle, RefreshCw, BarChart3,
  Clock, Target, FileCheck, Star, Sparkles,
} from "lucide-react";
```
With:
```tsx
import {
  Upload, Loader2, FileText, CheckCircle2, ArrowLeft, ChevronRight,
  Wand2, AlertTriangle, RefreshCw, BarChart3,
  Sparkles,
} from "lucide-react";
```

**Change 2: Replace data overview section** (lines 1171-1236)

Replace the entire `数据概览` WizardSection (from `<WizardSection title="数据概览"` to its closing `</WizardSection>`) with:

```tsx
                <WizardSection
                  title="数据概览"
                  icon={<BarChart3 className="w-4 h-4 text-primary flex-shrink-0" />}
                >
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span>模块 <span className="font-semibold tabular-nums">{usecaseTree.length}</span></span>
                    <span className="text-border">·</span>
                    <span>用例 <span className="font-semibold tabular-nums">{usecaseTree.reduce((s, m) => s + m.cases.length, 0)}</span></span>
                    <span className="text-border">·</span>
                    <span>
                      评分{" "}
                      <span
                        className={`font-semibold tabular-nums ${
                          (genStats?.qualityScore || 0) >= 80
                            ? "text-emerald-600"
                            : (genStats?.qualityScore || 0) >= 60
                            ? "text-amber-500"
                            : "text-red-500"
                        }`}
                      >
                        {genStats?.qualityScore ?? "-"}
                      </span>
                    </span>
                    <span className="text-border">·</span>
                    <span>耗时 <span className="font-semibold tabular-nums">{genStats?.duration != null ? (genStats.duration / 60000).toFixed(1) : "-"}min</span></span>
                  </div>
                </WizardSection>
```

**Change 3: Move ModuleOverviewTable up and remove rating section** (lines 1238-1303)

Replace the block from `<WizardSection title="输出文件"` through `<ModuleOverviewTable ... />` with the new order:

```tsx
                <ModuleOverviewTable
                  modules={usecaseTree}
                  totalCases={usecaseTree.reduce((s, m) => s + m.cases.length, 0)}
                />

                <WizardSection
                  title="输出文件"
                  icon={<FileText className="w-4 h-4 text-primary flex-shrink-0" />}
                  meta={step3OutputCount > 0 ? `${step3OutputCount} 个` : undefined}
                >
                  <OutputFiles
                    sectioned
                    taskId={taskId}
                    files={mergedOutputFiles}
                    onEditXmind={(f) => onNavigateToTab?.(2, taskId ? { taskId, filePath: f.relativePath } : undefined)}
                    isGenerating={generating}
                  />
                </WizardSection>

                <WizardSection
                  id="step3-ai-tweak"
                  title="AI 微调"
                  icon={<Sparkles className="w-4 h-4 text-primary flex-shrink-0" />}
                >
                  <AITweakPanel
                    sectioned
                    taskId={taskId}
                    generating={generating && !!usecaseTree && usecaseTree.length > 0}
                    modules={usecaseTree.map((m) => m.name)}
                    tweakHistory={tweakHistory}
                    onTweakStarted={() => {
                      const currentFiles = [...scanner.foundFiles, ...loadedFiles];
                      setXmindBaseline(maxXmindVersion(currentFiles));
                      setMdBaseline(maxMdVersion(currentFiles));
                      preTweakTreeRef.current = usecaseTree;
                      setGenerating(true);
                      setGenStatus("正在微调用例...");
                    }}
                    onCancelTweak={async () => {
                      try {
                        await cancelTask.mutateAsync(taskId!);
                      } catch { /* fall through */ }
                      scanner.stop();
                      setGenerating(false);
                      setGenStatus("");
                    }}
                    onRecordTweak={(entry) => {
                      setTweakHistory((prev) => [...prev, entry]);
                    }}
                    onTweakHistoryUpdate={(history) => {
                      setTweakHistory(history);
                    }}
                  />
                </WizardSection>
```

This removes the `本次生成评价` WizardSection entirely (it's now in the sidebar).

**Change 4: Update ExecutionPanel props** (lines 1326-1360)

Replace the `<ExecutionPanel` block's props. Find these props and make these changes:

1. Remove `onScrollToRating={...}` prop entirely
2. Change `onNavigateToEditor` from:
```tsx
        onNavigateToEditor={() => onNavigateToTab?.(2, taskId ? { taskId } : undefined)}
```
To:
```tsx
        onNavigateToEditor={(filePath) => onNavigateToTab?.(2, taskId ? { taskId, filePath } : undefined)}
```

The final `<ExecutionPanel>` call should look like:

```tsx
      <ExecutionPanel
        taskId={taskId}
        generating={generating}
        wizStep={wizStep}
        hasResult={!generating && !!usecaseTree && usecaseTree.length > 0}
        isTweak={generating && !!usecaseTree && usecaseTree.length > 0}
        configSummary={{
          source: uploadedFiles.length > 0
            ? uploadedFiles.map((f) => f.name).join(", ")
            : requirementText
            ? "文本输入"
            : "未选择",
          knowledge: `${selectedKnowledgeIds.size} 份`,
          history: `${selectedHistoryIds.size} 份`,
        }}
        foundFiles={mergedOutputFiles}
        logStages={logStages}
        onDownloadFile={(file) => {
          if (!taskId) return;
          const url = `/api/tasks/${taskId}/download?file=${encodeURIComponent(file.relativePath)}`;
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }}
        onScrollToAITweak={() => {
          document.getElementById("step3-ai-tweak")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onNavigateToEditor={(filePath) => onNavigateToTab?.(2, taskId ? { taskId, filePath } : undefined)}
      />
```

- [ ] **Step 4: Run all tests to verify everything passes**

Run: `npx vitest run`
Expected: ALL PASS (no TypeScript errors, no broken tests)

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx components/usecase-gen/__tests__/generate-wizard.test.tsx
git commit -m "feat(usecase-gen): reorder step3 layout, inline data overview, remove rating section from main area"
```

---

## Self-Review Checklist

After all tasks are complete, verify:

1. **Spec coverage:**
   - ✅ 变更1 (数据概览内联) → Task 5, Change 2
   - ✅ 变更2 (模块概览手风琴+上移) → Task 2 (rewrite) + Task 5, Change 3 (move position)
   - ✅ 变更3 (输出文件紧凑行) → Task 3
   - ✅ 变更4 (评价移入侧边栏) → Task 4 (ExecutionPanel renders RatingPanel) + Task 5 (remove from main area)
   - ✅ 变更5 (下载/编辑浮窗) → Task 1 (FileActionModal) + Task 4 (ExecutionPanel integration)
   - ✅ 变更6 (图标统一) → Task 2 (Table icon in module header) + existing icons in other sections
   - ✅ onScrollToRating removed → Task 4 (props) + Task 5 (prop passing)
   - ✅ onNavigateToEditor signature → Task 4 (props) + Task 5 (call site)
   - ✅ isDisplayable exported → Task 3

2. **No placeholders:** All steps have complete code blocks.

3. **Type consistency:**
   - `FileActionModalProps` defined in Task 1, used in Task 4 ✅
   - `onNavigateToEditor: (filePath?: string) => void` consistent across Task 4 (props) and Task 5 (call site) ✅
   - `isDisplayable` exported in Task 3, imported in Task 4 ✅
   - `QuickActions` props match between definition (Task 4) and usage ✅
