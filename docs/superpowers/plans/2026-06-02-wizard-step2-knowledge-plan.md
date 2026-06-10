# 用例向导 Step 2 — 关联知识库 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 Step 2 的 mock 数据，从知识库获取真实业务知识和历史用例，用户勾选后以子目录方式复制到沙箱供 AI 参考。

**Architecture:** 前端调用 knowledge/history API 获取列表 → 用户勾选 → `executeTask({ referenceFiles })` → execute route 解析路径 → `startTaskExecution` → `copyFilesToWorkspace` 按 subdir 复制 → AI 读目录。

**Tech Stack:** Next.js 14, Prisma, React 18, TypeScript, TanStack React Query

**Spec:** `docs/superpowers/specs/2026-06-02-wizard-step2-knowledge-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `hooks/use-tasks.ts` | 修改 | `useExecuteTask` 参数从 `string` 改为 `{ taskId, referenceFiles }` |
| `app/api/tasks/[id]/execute/route.ts` | 修改 | 接收 referenceFiles，解析绝对路径，传给 `startTaskExecution` |
| `lib/task-engine.ts` | 修改 | `startTaskExecution` 接收 referenceFiles，传给 `copyFilesToWorkspace` |
| `lib/sandbox.ts` | 修改 | `copyFilesToWorkspace` 新增 referenceFiles 参数，按子目录复制 |
| `components/usecase-gen/generate-wizard.tsx` | 修改 | Step 2 替换 mock 为真实 API；`startGenerate` 收集 referenceFiles |
| `components/usecase-gen/shared/mock-data.ts` | 修改 | 删除 `mockRecentReqs`、`mockFewShotExamples` |

---

### Task 1: 更新 copyFilesToWorkspace — 支持 referenceFiles 子目录

**Files:**
- Modify: `lib/sandbox.ts`

- [ ] **Step 1: 新增 referenceFiles 参数和子目录复制逻辑**

当前函数签名和实现：

```typescript
export async function copyFilesToWorkspace(
  taskId: string,
  filePaths: string[]
): Promise<string[]> {
  const workspaceDir = getWorkspacePath(taskId);
  await fs.mkdir(workspaceDir, { recursive: true });

  const copiedPaths: string[] = [];
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const destPath = path.join(workspaceDir, fileName);
    await fs.copyFile(filePath, destPath);
    copiedPaths.push(destPath);
  }
  return copiedPaths;
}
```

替换为：

```typescript
export async function copyFilesToWorkspace(
  taskId: string,
  filePaths: string[],
  referenceFiles?: { sourcePath: string; subdir: string; destName: string }[]
): Promise<string[]> {
  const workspaceDir = getWorkspacePath(taskId);
  await fs.mkdir(workspaceDir, { recursive: true });

  const copiedPaths: string[] = [];

  // 现有逻辑：需求文档平铺到根目录
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const destPath = path.join(workspaceDir, fileName);
    await fs.copyFile(filePath, destPath);
    copiedPaths.push(destPath);
  }

  // 新增：reference 文件按子目录复制
  if (referenceFiles && referenceFiles.length > 0) {
    for (const ref of referenceFiles) {
      try {
        const subDir = path.join(workspaceDir, ref.subdir);
        await fs.mkdir(subDir, { recursive: true });
        const dest = path.join(subDir, ref.destName);
        await fs.copyFile(ref.sourcePath, dest);
        copiedPaths.push(dest);
      } catch (err) {
        console.warn(`Failed to copy reference file "${ref.sourcePath}":`, err);
        // 跳过不阻塞
      }
    }
  }

  return copiedPaths;
}
```

- [ ] **Step 2: 构建验证 TypeScript 无错误**

```bash
npx tsc --noEmit lib/sandbox.ts 2>&1
```

Expected: 无错误输出（或仅有项目级别的预存错误）。

- [ ] **Step 3: 提交**

```bash
git add lib/sandbox.ts
git commit -m "feat: copyFilesToWorkspace supports referenceFiles with subdirectory

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 更新 startTaskExecution — 接收 referenceFiles

**Files:**
- Modify: `lib/task-engine.ts`

- [ ] **Step 1: 修改函数签名和调用**

读取当前 `startTaskExecution` 函数。找到 `copyFilesToWorkspace` 的调用行：

```typescript
workspaceFiles = await copyFilesToWorkspace(taskId, task.inputFiles);
```

改为：

```typescript
workspaceFiles = await copyFilesToWorkspace(
  taskId,
  task.inputFiles,
  referenceFiles
);
```

同时修改函数签名的参数列表。当前：

```typescript
export async function startTaskExecution(taskId: string): Promise<void> {
```

改为：

```typescript
export async function startTaskExecution(
  taskId: string,
  referenceFiles?: { sourcePath: string; subdir: string; destName: string }[]
): Promise<void> {
```

- [ ] **Step 2: 构建验证**

```bash
npx tsc --noEmit lib/task-engine.ts 2>&1
```

Expected: 无新错误。

- [ ] **Step 3: 提交**

```bash
git add lib/task-engine.ts
git commit -m "feat: startTaskExecution accepts and forwards referenceFiles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 更新 execute route — 解析路径并传入 referenceFiles

**Files:**
- Modify: `app/api/tasks/[id]/execute/route.ts`

- [ ] **Step 1: 读取请求体中的 referenceFiles，解析绝对路径**

替换整个 POST 函数：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { startTaskExecution } from "@/lib/task-engine";
import { getOutputPath } from "@/lib/sandbox";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    const result = await prisma.task.updateMany({
      where: { id: params.id, userId, status: "pending" },
      data: { status: "running" },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Task not found or not in pending state" },
        { status: 409 }
      );
    }

    // 读取 referenceFiles 并解析为绝对路径
    let referenceFiles:
      | { sourcePath: string; subdir: string; destName: string }[]
      | undefined;

    try {
      const body = await req.json();
      if (body.referenceFiles && Array.isArray(body.referenceFiles)) {
        const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
        const SANDBOX_ROOT = path.resolve(process.cwd(), "sandbox");

        referenceFiles = body.referenceFiles.map(
          (ref: {
            sourcePath?: string;
            sourceTaskId?: string;
            mdFileName?: string;
            subdir: string;
            destName: string;
          }) => {
            let sourcePath: string;

            if (ref.sourceTaskId) {
              // 平台生成历史：从 sandbox/{taskId}/output/ 读取
              sourcePath = path.join(
                getOutputPath(ref.sourceTaskId),
                ref.mdFileName || ""
              );
            } else if (ref.sourcePath) {
              // 业务知识/手动上传历史：content 存相对路径，resolve 到绝对
              sourcePath = path.resolve(process.cwd(), ref.sourcePath);
            } else {
              throw new Error("Invalid reference file: no sourcePath or sourceTaskId");
            }

            // 路径安全校验
            if (
              !sourcePath.startsWith(UPLOADS_ROOT) &&
              !sourcePath.startsWith(SANDBOX_ROOT)
            ) {
              throw new Error(`Path traversal detected: ${sourcePath}`);
            }

            return { sourcePath, subdir: ref.subdir, destName: ref.destName };
          }
        );
      }
    } catch {
      // body 可能为空（向后兼容），忽略解析错误
    }

    startTaskExecution(params.id, referenceFiles).catch((err) => {
      console.error("Task execution error:", err);
    });

    return NextResponse.json({ success: true, status: "running" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 构建验证**

```bash
npx next build 2>&1 | tail -5
```

Expected: 无新错误（预存的 stats/route.ts 错误除外）。

- [ ] **Step 3: 提交**

```bash
git add app/api/tasks/\[id\]/execute/route.ts
git commit -m "feat: execute route resolves referenceFiles paths and passes to task engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 更新 useExecuteTask hook — 支持 referenceFiles

**Files:**
- Modify: `hooks/use-tasks.ts`

- [ ] **Step 1: 修改 useExecuteTask 的参数和请求体**

当前：

```typescript
export function useExecuteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/tasks/${taskId}/execute`, {
        method: "POST",
      });
```

改为：

```typescript
export function useExecuteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      taskId: string;
      referenceFiles?: { sourcePath?: string; sourceTaskId?: string; mdFileName?: string; subdir: string; destName: string }[];
    }) => {
      const res = await fetch(`/api/tasks/${input.taskId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceFiles: input.referenceFiles,
        }),
      });
```

同时检查 `useResumeTask` 是否需要改——不需要，resume 不涉及 reference 文件。

- [ ] **Step 2: 构建验证**

```bash
npx tsc --noEmit hooks/use-tasks.ts 2>&1
```

Expected: 无新错误。

- [ ] **Step 3: 提交**

```bash
git add hooks/use-tasks.ts
git commit -m "feat: useExecuteTask supports referenceFiles parameter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 删除 mock 数据

**Files:**
- Modify: `components/usecase-gen/shared/mock-data.ts`
- Modify: `components/usecase-gen/generate-wizard.tsx`

- [ ] **Step 1: 从 mock-data.ts 删除不需要的导出**

删除以下内容：

```typescript
// 删除这整个接口
export interface MockRecentReq {
  id: number;
  name: string;
  date: string;
  count: number;
}

// 删除这整个常量
export const mockRecentReqs: MockRecentReq[] = [
  { id: 1, name: "用户登录与权限管理 v2.3", date: "2026-05-24", count: 48 },
  { id: 2, name: "商品详情页改版需求", date: "2026-05-22", count: 32 },
];

// 删除这整个接口
export interface MockFewShot {
  name: string;
  count: number;
  selected: boolean;
}

// 删除这整个常量
export const mockFewShotExamples: MockFewShot[] = [
  { name: "登录鉴权用例集", count: 24, selected: false },
  { name: "表单验证通用用例", count: 18, selected: true },
  { name: "异常处理边界用例", count: 31, selected: false },
];
```

保留其他接口和常量（`mockDefaultTree`, `mockKPICards`, `mockCapabilities`, `mockDimensions`, `mockQuickActions`, `mockRecords`, `mockKBTabs`, `mockKBTags`, `mockKBItems`, `mockPromptTemplates`）。

- [ ] **Step 2: 从 generate-wizard.tsx 删除 mock 引用**

修改 import 行：

```typescript
// 旧
import {
  mockRecentReqs, mockFewShotExamples,
} from "./shared/mock-data";

// 新：删除这行 import
```

删除 `fewShotRef` 和 `fewShot` 相关状态：

```typescript
// 删除这两行
const fewShotRef = useRef(mockFewShotExamples.map((f) => ({ ...f })));
const [fewShot, setFewShot] = useState(fewShotRef.current);
```

删除 `selectedReq` 状态：

```typescript
// 删除这行
const [selectedReq, setSelectedReq] = useState<number | null>(null);
```

- [ ] **Step 3: 构建验证（会有未使用变量警告，Step 2 UI 替换后会消除）**

```bash
npx next build 2>&1 | tail -5
```

Expected: 可能有 `fewShot`/`selectedReq`/`mockRecentReqs` 的未使用警告（下一个 Task 会解决）。

- [ ] **Step 4: 提交**

```bash
git add components/usecase-gen/shared/mock-data.ts components/usecase-gen/generate-wizard.tsx
git commit -m "feat: remove mock data — mockRecentReqs, mockFewShotExamples

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 重写 Step 2 UI — 真实 API + 勾选逻辑

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`

这是最大的改动。需要：
1. 添加真实数据查询（业务知识、手动上传历史、平台生成历史）
2. 替换 Step 2 JSX（两个卡片改为 API 数据）
3. 修改 `startGenerate` 收集 referenceFiles 并传给 `executeTask`

- [ ] **Step 1: 添加 Query hooks 和 TypeScript 类型**

在文件顶部 import 区域添加 `useQuery`（已通过 react-query 可用），并添加数据类型：

在组件函数体内（`const queryClient = ...` 之后），添加查询逻辑和勾选状态。

以下是完整的 Step 2 替换代码。在 `generate-wizard.tsx` 中：

**添加 import：**

```typescript
// 在现有 import 中添加 useQuery
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
// useQuery 已经通过 hooks/use-tasks 的模式可用，直接使用
```

**在组件内添加查询和勾选状态**（放在 `const queryClient = ...` 之后，`// Upload` 之前）：

```typescript
// ---- Step 2: 知识库关联 ----

// 勾选状态：用 Set 存 id
const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<Set<string>>(new Set());
const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());

// 历史用例统一数据结构（手动上传 + 平台生成合并）
interface HistoryOption {
  id: string;           // 唯一标识 "knowledge:{id}" 或 "task:{id}"
  displayName: string;  // 展示文件名
  sourcePath?: string;  // Knowledge 的 content 路径
  sourceTaskId?: string; // 平台生成的 task id
  mdFileName?: string;   // 平台生成的文件名
}

// 业务知识查询
const { data: knowledgeData } = useQuery({
  queryKey: ["knowledge", { type: "knowledge" }],
  queryFn: () => fetch("/api/knowledge?type=knowledge").then((r) => r.json()),
});

// 手动上传历史查询
const { data: uploadedHistoryData } = useQuery({
  queryKey: ["knowledge", { type: "history_uploaded" }],
  queryFn: () => fetch("/api/knowledge?type=history_uploaded").then((r) => r.json()),
});

// 平台生成历史查询
const { data: platformHistoryData } = useQuery({
  queryKey: ["knowledge-history"],
  queryFn: () => fetch("/api/knowledge/history").then((r) => r.json()),
});

// 合并历史用例列表
const historyOptions: HistoryOption[] = useMemo(() => {
  const result: HistoryOption[] = [];

  // 手动上传历史
  const uploaded: { items?: { id: string; title: string; content: string }[] } =
    (uploadedHistoryData as any) || {};
  for (const item of uploaded.items || []) {
    result.push({
      id: `knowledge:${item.id}`,
      displayName: (item.title || "untitled") + ".md",
      sourcePath: item.content,
    });
  }

  // 平台生成历史
  const platform: {
    items?: {
      id: string;
      mdFileName: string;
    }[];
  } = (platformHistoryData as any) || {};
  for (const item of platform.items || []) {
    if (!item.mdFileName) continue;
    result.push({
      id: `task:${item.id}`,
      displayName: item.mdFileName,
      sourceTaskId: item.id,
      mdFileName: item.mdFileName,
    });
  }

  return result;
}, [uploadedHistoryData, platformHistoryData]);

function toggleKnowledge(id: string) {
  setSelectedKnowledgeIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
}

function toggleHistory(id: string) {
  setSelectedHistoryIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
}
```

- [ ] **Step 2: 替换 Step 2 JSX**

找到 `{/* Step 1: 关联用例 */}` 区块（当前约 line 382-421），整块替换：

```typescript
{/* Step 2: 关联用例 */}
{wizStep === 1 && (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      {/* 左侧：业务知识 */}
      <div className="bg-card rounded-xl shadow-sm p-5">
        <h3 className="font-semibold mb-3 text-sm">业务知识</h3>
        <p className="text-xs text-muted-foreground mb-3">
          勾选本次生成需要参考的业务规范文档
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {!knowledgeData ? (
            <p className="text-xs text-muted-foreground py-4 text-center">加载中...</p>
          ) : (knowledgeData as any).items?.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">暂无业务知识，可前往知识库上传</p>
          ) : (
            (knowledgeData as any).items?.map((item: { id: string; title: string; businessType: string | null; updatedAt: string }) => (
              <label
                key={item.id}
                className={`flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 transition-colors ${
                  selectedKnowledgeIds.has(item.id)
                    ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedKnowledgeIds.has(item.id)}
                  onChange={() => toggleKnowledge(item.id)}
                  className="accent-cyan-500 w-3.5 h-3.5 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-sm truncate block">{item.title}.md</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                    {item.businessType ? ` · ${item.businessType}` : ""}
                  </span>
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {/* 右侧：历史用例范文 */}
      <div className="bg-card rounded-xl shadow-sm p-5">
        <h3 className="font-semibold mb-3 text-sm">历史用例范文</h3>
        <p className="text-xs text-muted-foreground mb-3">
          勾选优秀历史用例作为 few-shot 参考
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {(!uploadedHistoryData && !platformHistoryData) ? (
            <p className="text-xs text-muted-foreground py-4 text-center">加载中...</p>
          ) : historyOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              暂无历史用例
            </p>
          ) : (
            historyOptions.map((opt) => (
              <label
                key={opt.id}
                className={`flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 transition-colors ${
                  selectedHistoryIds.has(opt.id)
                    ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedHistoryIds.has(opt.id)}
                  onChange={() => toggleHistory(opt.id)}
                  className="accent-cyan-500 w-3.5 h-3.5 flex-shrink-0"
                />
                <span className="text-sm truncate">{opt.displayName}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
    <div className="flex justify-between">
      <button
        onClick={() => setWizStep(0)}
        className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />上一步
      </button>
      <button
        onClick={startGenerate}
        disabled={generating}
        className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2"
      >
        {generating ? (
          <><Loader2 className="w-4 h-4 animate-spin" />生成中...</>
        ) : (
          <><Wand2 className="w-4 h-4" />开始生成</>
        )}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: 修改 startGenerate — 收集 referenceFiles**

找到 `startGenerate` 函数，在 `executeTask.mutateAsync` 调用处修改。

当前：

```typescript
setTaskId(newTaskId);
await executeTask.mutateAsync(newTaskId);
```

改为：

```typescript
setTaskId(newTaskId);

// 收集 referenceFiles
const knowledgeItems =
  (knowledgeData as any)?.items as { id: string; title: string; content: string }[] | undefined;

const referenceFiles: {
  sourcePath?: string;
  sourceTaskId?: string;
  mdFileName?: string;
  subdir: string;
  destName: string;
}[] = [];

// 业务知识
for (const id of selectedKnowledgeIds) {
  const k = knowledgeItems?.find((item) => item.id === id);
  if (k?.content) {
    referenceFiles.push({
      sourcePath: k.content,
      subdir: "knowledge",
      destName: (k.title || "untitled") + ".md",
    });
  }
}

// 历史用例
for (const id of selectedHistoryIds) {
  const h = historyOptions.find((opt) => opt.id === id);
  if (h) {
    referenceFiles.push({
      sourcePath: h.sourcePath,
      sourceTaskId: h.sourceTaskId,
      mdFileName: h.mdFileName,
      subdir: "history",
      destName: h.displayName,
    });
  }
}

await executeTask.mutateAsync({ taskId: newTaskId, referenceFiles });
```

- [ ] **Step 4: 清除 ExecutionPanel 中的 fewShot 引用**

找到 `ExecutionPanel` 的 `configSummary` prop：

```typescript
configSummary={{
  source: ...,
  fewShot: `${fewShot.filter((f) => f.selected).length} 份`,  // 删除这行
}}
```

改为：

```typescript
configSummary={{
  source: uploadedFiles.length > 0
    ? uploadedFiles.map((f) => f.name).join(", ")
    : requirementText
    ? "文本输入"
    : "未选择",
  knowledge: `${selectedKnowledgeIds.size} 份`,             // 新增
  history: `${selectedHistoryIds.size} 份`,                 // 新增
}}
```

- [ ] **Step 5: 运行现有测试**

```bash
npx vitest run components/usecase-gen/__tests__/generate-wizard.test.tsx 2>&1 | tail -10
```

Expected: 测试通过；如果 wizard 测试引用了 mock 数据，需要更新。

- [ ] **Step 6: 构建验证**

```bash
npx next build 2>&1 | tail -10
```

Expected: 无新错误。

- [ ] **Step 7: 提交**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat: wizard step 2 — replace mock with real knowledge API, collect referenceFiles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 端到端验证

- [ ] **Step 1: 运行全部测试**

```bash
npx vitest run 2>&1 | tail -8
```

Expected: 所有测试 PASS。

- [ ] **Step 2: 构建检查**

```bash
npx next build 2>&1 | tail -10
```

Expected: 仅预存的 stats/route.ts 错误，无新错误。

- [ ] **Step 3: 手动验证清单**

启动 `npm run dev`：

| 操作 | 预期结果 |
|------|----------|
| 打开用例向导 → Step 1 正常 | 上传文件/输入文本 |
| 点击"下一步"→ Step 2 | 左侧显示业务知识列表（来自 API），右侧显示历史用例合并列表 |
| 勾选几个知识/历史 → 点击开始生成 | 正常进入 Step 3 |
| 生成完成 | workspace/knowledge/ 和 workspace/history/ 有勾选的文件副本 |
| 不勾选任何 → 开始生成 | 正常生成，无 reference 文件 |
| 知识库为空 | Step 2 显示"暂无"提示 |

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: final verification for wizard step 2 knowledge integration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

*计划版本 v1.0 · 2026-06-02*
