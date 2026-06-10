# Tweak History 状态收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `tweakHistory.status` 的写入权威从前端 PATCH 迁移到服务端 `resumeTask`，解决关页后状态永久 `running` 的问题。

**Architecture:** 服务端 `resumeTask` 在 `output_complete` / `error` / `catch` 各退出路径直接更新 tweakHistory。前端 scanner / 历史 reconcile 仅做兜底刷新，PATCH 端点加乐观锁仅允许补充 summary。

**Tech Stack:** Next.js 14 App Router, Prisma, React 18, TypeScript

---

## Files

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/tweak-history.ts` | **Create** | `findRunningTweakEntry`, `markTweakEntryDone`, `markTweakEntryFailed` |
| `lib/task-engine.ts` | Modify | `resumeTask` 各退出路径调 tweakHistory 更新；`cancelTask` 调 `markTweakEntryFailed` |
| `app/api/tasks/[id]/tweak/route.ts` | Modify | PATCH 端点加 `expectedStatus` 乐观锁 |
| `hooks/use-output-scanner.ts` | Modify | 新增 `maxMdVersion`；新增 `mdBaselineVersion` prop；tweak 模式跳过 duration 检查 |
| `components/usecase-gen/generate-wizard.tsx` | Modify | `mdBaseline` state；`onResult`/`onError` 改 round 取法；`onTweakStarted` 设 MD 基线；历史 reconcile |
| `components/usecase-gen/shared/output-files.tsx` | Modify | 新增 `isGenerating` prop，控制空状态展示 |
| `components/usecase-gen/shared/ai-tweak-panel.tsx` | Modify | 发送按钮在 tweakHistory 有 `running` 时禁用 |

---

### Task 1: Create `lib/tweak-history.ts`

**Files:**
- Create: `lib/tweak-history.ts`

- [ ] **Step 1: Create the module**

```typescript
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export interface TweakEntry {
  round: number;
  instruction: string;
  time: string;
  delta: string;
  status: "running" | "done" | "failed";
  summary?: string;
}

/**
 * 返回 tweakHistory 中最后一个 status === "running" 的条目。
 * 纯函数，前后端共享逻辑。
 */
export function findRunningTweakEntry(
  history: TweakEntry[]
): TweakEntry | undefined {
  const running = history.filter((e) => e.status === "running");
  if (running.length === 0) return undefined;
  running.sort((a, b) => b.round - a.round);
  return running[0];
}

/**
 * 将指定 round 的 tweakHistory 条目标为 "done"。
 * 使用 spread 保留已有字段（如前端已写入的 summary）。
 */
export async function markTweakEntryDone(
  taskId: string,
  round: number,
  summary?: string
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { tweakHistory: true },
  });
  if (!task?.tweakHistory) return;

  const history = (task.tweakHistory as TweakEntry[]).map((e) =>
    e.round === round
      ? { ...e, status: "done" as const, ...(summary !== undefined ? { summary } : {}) }
      : e
  );

  await prisma.task.update({
    where: { id: taskId },
    data: { tweakHistory: history as Prisma.InputJsonValue },
  });
}

/**
 * 将指定 round 的 tweakHistory 条目标为 "failed"。
 * 可选的 error 信息写入 summary 字段。
 */
export async function markTweakEntryFailed(
  taskId: string,
  round: number,
  error?: string
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { tweakHistory: true },
  });
  if (!task?.tweakHistory) return;

  const history = (task.tweakHistory as TweakEntry[]).map((e) =>
    e.round === round
      ? { ...e, status: "failed" as const, ...(error ? { summary: error } : {}) }
      : e
  );

  await prisma.task.update({
    where: { id: taskId },
    data: { tweakHistory: history as Prisma.InputJsonValue },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty lib/tweak-history.ts
```

Expected: No errors (module may show unused-var warnings which are fine at this stage).

- [ ] **Step 3: Commit**

```bash
git add lib/tweak-history.ts
git commit -m "feat: add lib/tweak-history.ts with findRunningTweakEntry, markTweakEntryDone, markTweakEntryFailed"
```

---

### Task 2: PATCH endpoint optimistic locking

**Files:**
- Modify: `app/api/tasks/[id]/tweak/route.ts:88-129`

- [ ] **Step 1: Update PATCH handler to accept expectedStatus**

Replace the existing PATCH handler (lines 88-129) with:

```typescript
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    const taskId = params.id;
    const { round, updates, expectedStatus } = await req.json();

    if (!round || !updates) {
      return NextResponse.json(
        { error: "round and updates required" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const history = (task.tweakHistory as Array<Record<string, unknown>>) || [];
    const idx = history.findIndex((e) => e.round === round);

    if (idx < 0) {
      return NextResponse.json(
        { error: "Tweak entry not found" },
        { status: 404 }
      );
    }

    // Optimistic lock: if expectedStatus provided, check it matches current
    if (expectedStatus !== undefined) {
      if (history[idx].status !== expectedStatus) {
        return NextResponse.json(
          { conflict: true, current: history[idx] },
          { status: 409 }
        );
      }
    }

    history[idx] = { ...history[idx], ...updates };
    await prisma.task.update({
      where: { id: taskId },
      data: { tweakHistory: history as Prisma.InputJsonValue },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Tweak PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update tweak entry" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify with curl-like test (manual)**

Start the dev server and test the three cases:

```bash
# Case 1: No expectedStatus (backward compat) — should succeed
curl -X PATCH http://localhost:3000/api/tasks/<taskId>/tweak \
  -H "Content-Type: application/json" \
  -d '{"round":1,"updates":{"summary":"+3"}}'

# Case 2: Matching expectedStatus — should succeed
curl -X PATCH http://localhost:3000/api/tasks/<taskId>/tweak \
  -H "Content-Type: application/json" \
  -d '{"round":1,"updates":{"status":"done"},"expectedStatus":"running"}'

# Case 3: Non-matching expectedStatus — should return 409
curl -X PATCH http://localhost:3000/api/tasks/<taskId>/tweak \
  -H "Content-Type: application/json" \
  -d '{"round":1,"updates":{"status":"done"},"expectedStatus":"done"}'
```

- [ ] **Step 3: Commit**

```bash
git add app/api/tasks/\[id\]/tweak/route.ts
git commit -m "feat: add optimistic locking (expectedStatus) to PATCH /tweak"
```

---

### Task 3: P0 — resumeTask + cancelTask tweakHistory updates

**Files:**
- Modify: `lib/task-engine.ts:1-8` (import), `lib/task-engine.ts:235-377` (resumeTask), `lib/task-engine.ts:379-404` (cancelTask)

- [ ] **Step 1: Add import for tweak-history module**

In `lib/task-engine.ts`, add after line 8:

```typescript
import { findRunningTweakEntry, markTweakEntryDone, markTweakEntryFailed, type TweakEntry } from "./tweak-history";
```

- [ ] **Step 2: Add tweakHistory resolution logic to resumeTask**

After line 278 (`const skipDurationUpdate = ...`), insert the tweak-history resolution block:

```typescript
  /** 微调后 tweakCount 已递增；仅首次生成流程写入 duration */
  const skipDurationUpdate = (task.tweakCount || 0) > 0;

  // Resolve tweakHistory: if a running entry exists for the current tweakCount,
  // this is a tweak resume — update it on completion/error.
  const tweakHistory = (task.tweakHistory as TweakEntry[]) || [];
  const runningEntry = findRunningTweakEntry(tweakHistory);
  const isTweakResume = runningEntry !== undefined && runningEntry.round === tweakRound;
```

- [ ] **Step 3: Add markTweakEntryDone after saveOutputAndReport in pause/output_complete path**

After line 318 (`hasTestcaseMd = await saveOutputAndReport(taskId);`), insert:

```typescript
          hasTestcaseMd = await saveOutputAndReport(taskId);
          if (isTweakResume) {
            await markTweakEntryDone(taskId, runningEntry!.round).catch((err) =>
              console.error("[task-engine] markTweakEntryDone failed:", err)
            );
          }
        }
```

- [ ] **Step 4: Add markTweakEntryFailed in pause/non-output_complete path**

After line 319 (`}` closing the `if (event.pauseReason === "output_complete")` block), before line 321 (`const terminal = ...`), insert:

```typescript

        // Non-output_complete pause during tweak → mark failed
        if (event.pauseReason !== "output_complete" && isTweakResume) {
          await markTweakEntryFailed(taskId, runningEntry!.round, `pause: ${event.pauseReason}`).catch((err) =>
            console.error("[task-engine] markTweakEntryFailed (non-output_complete) failed:", err)
          );
        }
```

- [ ] **Step 5: Add markTweakEntryFailed in error path**

Before line 335 (`await prisma.task.update` in error block), insert:

```typescript
      if (event.type === "error") {
        if (isTweakResume) {
          await markTweakEntryFailed(taskId, runningEntry!.round, "stream error").catch((err) =>
            console.error("[task-engine] markTweakEntryFailed (error) failed:", err)
          );
        }
        await prisma.task.update({
```

- [ ] **Step 6: Add markTweakEntryDone in stream-end path**

After line 355 (`const hasTestcaseMd = await saveOutputAndReport(taskId);`), insert:

```typescript
    const hasTestcaseMd = await saveOutputAndReport(taskId);
    if (isTweakResume) {
      await markTweakEntryDone(taskId, runningEntry!.round).catch((err) =>
        console.error("[task-engine] markTweakEntryDone (stream-end) failed:", err)
      );
    }
```

- [ ] **Step 7: Add markTweakEntryFailed in catch (non-cancelled) path**

Before line 372 (`const message = error instanceof Error ...`), insert:

```typescript
    // Don't overwrite if user already cancelled
    const current = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
    if (current?.status === "cancelled") {
      console.log(`[task-engine] resume error but task already cancelled, taskId="${taskId}"`);
      return;
    }
    if (isTweakResume) {
      await markTweakEntryFailed(taskId, runningEntry!.round, error instanceof Error ? error.message : "Unknown error").catch((err) =>
        console.error("[task-engine] markTweakEntryFailed (catch) failed:", err)
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
```

- [ ] **Step 8: Add markTweakEntryFailed in cancelTask**

In `cancelTask`, after line 399-402 (after setting status "cancelled"), insert:

```typescript
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "cancelled" },
  });

  // If cancelling during a tweak, mark the running entry as failed
  if ((task.tweakCount || 0) > 0) {
    const history = (task.tweakHistory as TweakEntry[]) || [];
    const running = findRunningTweakEntry(history);
    if (running) {
      await markTweakEntryFailed(taskId, running.round, "cancelled").catch((err) =>
        console.error("[cancelTask] markTweakEntryFailed failed:", err)
      );
    }
  }

  console.log(`[cancelTask] done, taskId="${taskId}"`);
```

Note: `TweakEntry` type is already imported from step 1.

- [ ] **Step 9: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty
```

Expected: No errors in `lib/task-engine.ts` or `lib/tweak-history.ts`.

- [ ] **Step 10: Commit**

```bash
git add lib/task-engine.ts
git commit -m "feat(P0): resumeTask and cancelTask update tweakHistory status"
```

---

### Task 4: P1a — maxMdVersion + scanner mdBaselineVersion

**Files:**
- Modify: `hooks/use-output-scanner.ts`

- [ ] **Step 1: Add maxMdVersion export**

After `maxXmindVersion` (line 53), add:

```typescript
/**
 * Extract version number from testcase MD filenames in a file list.
 * Only counts files whose name contains "测试用例" and ends with ".md".
 *   "测试用例.md"       → 0  (no version suffix)
 *   "测试用例_v3.md"    → 3
 * Returns -1 if no matching MD files present.
 */
export function maxMdVersion(files: FileInfo[]): number {
  const mdFiles = files.filter(
    (f) => f.name.includes("测试用例") && f.name.endsWith(".md")
  );
  if (mdFiles.length === 0) return -1;

  let maxV = -1;
  for (const f of mdFiles) {
    const m = f.name.match(/_v(\d+)\.md$/);
    if (m) {
      maxV = Math.max(maxV, parseInt(m[1], 10));
    } else {
      maxV = Math.max(maxV, 0);
    }
  }
  return maxV;
}
```

- [ ] **Step 2: Add mdBaselineVersion to UseOutputScannerOptions**

In `UseOutputScannerOptions` interface, add after `xmindBaselineVersion?: number` (line 30):

```typescript
  /**
   * Baseline MD version for tweak completion detection.
   * When set (>= 0), scanner uses MD-based completion (tweak mode):
   *   - Checks maxMdVersion > mdBaselineVersion instead of xmind
   *   - Does NOT check duration (not written during tweaks)
   * When undefined, scanner uses existing xmind-based logic (initial mode).
   */
  mdBaselineVersion?: number;
```

- [ ] **Step 3: Add mdBaselineRef in useOutputScanner**

After line 72-73 (`const baselineRef = useRef(xmindBaselineVersion); baselineRef.current = xmindBaselineVersion;`), add:

```typescript
  const mdBaselineRef = useRef(mdBaselineVersion);
  mdBaselineRef.current = mdBaselineVersion;
```

- [ ] **Step 4: Destructure mdBaselineVersion from options**

In the destructuring parameter (line 55-62), add `mdBaselineVersion`:

```typescript
export function useOutputScanner({
  taskId,
  interval = 3000,
  onResult,
  onError,
  enabled = true,
  xmindBaselineVersion = -1,
  mdBaselineVersion,
}: UseOutputScannerOptions) {
```

- [ ] **Step 5: Add tweak-mode completion gate**

Replace lines 149-174 (the completion gate block) with:

```typescript
        // 4. Completion gate
        const isTweakMode = mdBaselineVersion !== undefined && mdBaselineVersion >= 0;

        if (isTweakMode) {
          // Tweak mode: wait for higher MD version + tree (no duration check)
          const currentMdVersion = maxMdVersion(newFoundFiles);

          if (currentMdVersion <= mdBaselineRef.current!) {
            if (!stopRef.current) {
              timerRef.current = setTimeout(poll, interval);
            }
            return;
          }

          if (!report.tree) {
            if (!stopRef.current) {
              timerRef.current = setTimeout(poll, interval);
            }
            return;
          }

          // Tweak mode: no duration gate (duration not written during tweaks)
        } else {
          // Initial mode: existing logic — wait for xmind + tree + duration
          const currentXmindVersion = maxXmindVersion(newFoundFiles);

          if (currentXmindVersion <= baselineRef.current) {
            if (!stopRef.current) {
              timerRef.current = setTimeout(poll, interval);
            }
            return;
          }

          if (!report.tree) {
            if (!stopRef.current) {
              timerRef.current = setTimeout(poll, interval);
            }
            return;
          }

          if (report.duration == null) {
            if (!stopRef.current) {
              timerRef.current = setTimeout(poll, interval);
            }
            return;
          }
        }
```

- [ ] **Step 6: Add mdBaselineVersion to the useEffect dependency array**

On line 196, change:
```typescript
  }, [taskId, enabled, interval, stop, xmindBaselineVersion]);
```
to:
```typescript
  }, [taskId, enabled, interval, stop, xmindBaselineVersion, mdBaselineVersion]);
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty
```

- [ ] **Step 8: Commit**

```bash
git add hooks/use-output-scanner.ts
git commit -m "feat(P1a): add maxMdVersion and mdBaselineVersion for tweak scanner"
```

---

### Task 5: P1c — OutputFiles isGenerating + onTweakStarted no clear

**Files:**
- Modify: `components/usecase-gen/shared/output-files.tsx:8-14` (props), `output-files.tsx:40-49` (render logic)
- Modify: `components/usecase-gen/generate-wizard.tsx:249-250` (remove setLoadedFiles), `generate-wizard.tsx:1023-1028` (pass isGenerating)

- [ ] **Step 1: Add isGenerating to OutputFilesProps**

In `output-files.tsx`, update the interface (lines 8-14):

```typescript
interface OutputFilesProps {
  taskId: string | null;
  files: FileInfo[];
  onEditMarkdown?: (file: FileInfo) => void;
  /** 由外层 WizardSection 提供标题与边框 */
  sectioned?: boolean;
  /** 是否正在生成中。有文件时不转圈，无文件且有此标记时展示"生成中..." */
  isGenerating?: boolean;
}
```

- [ ] **Step 2: Update destructure and render logic**

Change line 40 from:
```typescript
export function OutputFiles({ taskId, files, onEditMarkdown, sectioned }: OutputFilesProps) {
```
to:
```typescript
export function OutputFiles({ taskId, files, onEditMarkdown, sectioned, isGenerating }: OutputFilesProps) {
```

Change the empty-state render (lines 44-49) from:
```typescript
  const listBody =
    displayable.length === 0 ? (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        生成中...
      </p>
    ) : (
```
to:
```typescript
  const listBody =
    displayable.length === 0 ? (
      isGenerating ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          生成中...
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">暂无输出文件</p>
      )
    ) : (
```

- [ ] **Step 3: Pass isGenerating from generate-wizard**

In `generate-wizard.tsx`, change the OutputFiles usage (line 1023-1028):

```tsx
                  <OutputFiles
                    sectioned
                    taskId={taskId}
                    files={mergedOutputFiles}
                    onEditMarkdown={() => onNavigateToTab?.(2)}
                    isGenerating={generating}
                  />
```

- [ ] **Step 4: Remove setLoadedFiles([]) from onTweakStarted**

In `generate-wizard.tsx`, change the `onTweakStarted` callback (lines 1042-1048):

```tsx
                    onTweakStarted={() => {
                      const baseline = maxXmindVersion([...scanner.foundFiles, ...loadedFiles]);
                      setXmindBaseline(baseline);
                      preTweakTreeRef.current = usecaseTree;
                      // P1c: no longer clear loadedFiles — keep previous files visible
                      setGenerating(true);
                      setGenStatus("正在微调用例...");
                    }}
```

Remove the line `setLoadedFiles([]);`.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty
```

- [ ] **Step 6: Commit**

```bash
git add components/usecase-gen/shared/output-files.tsx components/usecase-gen/generate-wizard.tsx
git commit -m "feat(P1c): OutputFiles isGenerating prop, onTweakStarted no longer clears loadedFiles"
```

---

### Task 6: P1a frontend — generate-wizard scanner integration

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`

- [ ] **Step 1: Import maxMdVersion**

Update the import on line 6 from:
```typescript
import { useOutputScanner, maxXmindVersion, type FileInfo } from "@/hooks/use-output-scanner";
```
to:
```typescript
import { useOutputScanner, maxXmindVersion, maxMdVersion, type FileInfo } from "@/hooks/use-output-scanner";
```

- [ ] **Step 2: Add mdBaseline state**

After line 250 (`const [xmindBaseline, setXmindBaseline] = useState(-1);`), add:

```typescript
  const [mdBaseline, setMdBaseline] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Pass mdBaselineVersion to useOutputScanner**

In the scanner options (around line 270-273), add `mdBaselineVersion`:

```typescript
  const scanner = useOutputScanner({
    taskId: taskId || "",
    enabled: generating && !!taskId,
    xmindBaselineVersion: xmindBaseline,
    mdBaselineVersion: mdBaseline,
```

- [ ] **Step 4: Update onTweakStarted to set MD baseline**

Change the `onTweakStarted` callback (lines 1042-1048) to also set `mdBaseline`:

```tsx
                    onTweakStarted={() => {
                      const currentFiles = [...scanner.foundFiles, ...loadedFiles];
                      setXmindBaseline(maxXmindVersion(currentFiles));
                      setMdBaseline(maxMdVersion(currentFiles));
                      preTweakTreeRef.current = usecaseTree;
                      setGenerating(true);
                      setGenStatus("正在微调用例...");
                    }}
```

- [ ] **Step 5: Update onResult to use findRunningTweakEntry for round, PATCH summary only**

Replace the delta computation in `onResult` (lines 293-313) with:

```typescript
      // Compute tweak delta
      if (preTweakTreeRef.current && taskId) {
        const oldCases = preTweakTreeRef.current.flatMap((m) => m.cases.map((c) => c.id));
        const newCases = tree.flatMap((m) => m.cases.map((c) => c.id));
        const oldSet = new Set(oldCases);
        const newSet = new Set(newCases);
        const added = newCases.filter((id) => !oldSet.has(id)).length;
        const removed = oldCases.filter((id) => !newSet.has(id)).length;
        const modified = oldCases.filter((id) => newSet.has(id)).length;
        const summaryText = `+${added} · 修改 ${modified} · -${removed}`;

        const serverHistory = (data.tweakHistory as TweakEntry[]) || [];
        // Find round: prefer running entry, fallback to max round
        const runningEntry = serverHistory
          .filter((e: TweakEntry) => e.status === "running")
          .sort((a: TweakEntry, b: TweakEntry) => b.round - a.round)[0];
        const round = runningEntry?.round
          ?? (serverHistory.length > 0 ? Math.max(...serverHistory.map((e: TweakEntry) => e.round)) : serverHistory.length);

        setTweakHistory((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((e) => e.round === round);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], status: "done" as const, summary: summaryText };
          }
          return updated;
        });
        // PATCH summary only — no expectedStatus (server may already have marked done)
        persistTweakEntry(taskId, round, { summary: summaryText });
        preTweakTreeRef.current = null;
      }
```

- [ ] **Step 6: Update onError — only update local UI, no PATCH status**

Replace the `onError` callback (lines 316-331) with:

```typescript
    onError: (msg) => {
      setGenStatus(msg);
      setGenerating(false);
      if (taskId) {
        // Only update local UI — server (P0) already wrote failed to tweakHistory
        setTweakHistory((prev) => {
          const history = [...prev];
          const runningEntry = history
            .filter((e) => e.status === "running")
            .sort((a, b) => b.round - a.round)[0];
          if (runningEntry) {
            const idx = history.findIndex((e) => e.round === runningEntry.round);
            if (idx >= 0) {
              history[idx] = { ...history[idx], status: "failed" as const };
            }
          }
          return history;
        });
      }
    },
```

- [ ] **Step 7: Reset mdBaseline in startGenerate**

Find the `startGenerate` function (around line 470-520) and ensure the reset block includes:

```typescript
      setXmindBaseline(-1);
      setMdBaseline(undefined);
      setLoadedFiles([]);
```

If `setXmindBaseline(-1)` already exists nearby, add `setMdBaseline(undefined);` after it.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty
```

- [ ] **Step 9: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat(P1a): integrate mdBaseline scanner, fix onResult/onError round logic"
```

---

### Task 7: P1b — History reconcile effect

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx:350-416` (initialTaskId effect)

- [ ] **Step 1: Add reconciledRef**

Find the ref declarations near line 256-258 and add:

```typescript
  const preTweakTreeRef = useRef<UsecaseModule[] | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const reconciledRef = useRef(false);
```

- [ ] **Step 2: Reset reconciledRef when initialTaskId changes**

In the `initialTaskId` effect (line 350), add reset at the top:

```typescript
  useEffect(() => {
    if (!initialTaskId) return;

    let cancelled = false;
    reconciledRef.current = false;
```

- [ ] **Step 3: Add reconcile logic after the first report fetch**

After the existing first report handling block (after line 411, before the catch), add the reconcile logic. Insert before `} catch { /* fall through */ }`:

```typescript
        // P1b: If tweakHistory has a running entry, fire one reconcile fetch
        const reportTweakHistory = (report.tweakHistory as TweakEntry[]) || [];
        const hasRunning = reportTweakHistory.some((e: TweakEntry) => e.status === "running");
        if (hasRunning && !cancelled && !reconciledRef.current) {
          reconciledRef.current = true;
          try {
            const reconRes = await fetch(`/api/tasks/${initialTaskId}/report`);
            if (!reconRes.ok || cancelled) return;
            const reconReport = await reconRes.json();
            if (cancelled) return;

            // Update state from reconcile report
            const reconTree = reconReport.tree as UsecaseModule[] | null;
            const reconSummary = reconReport.summary;
            const reconFiles: FileInfo[] = (reconReport.outputFiles || []).map(
              (f: { name: string; path: string }) => {
                let relativePath = f.name;
                try {
                  const url = new URL(f.path, "http://x");
                  const fileParam = url.searchParams.get("file");
                  if (fileParam) relativePath = decodeURIComponent(fileParam);
                } catch { /* fallback */ }
                return { name: f.name, relativePath };
              }
            );
            const reconTweakHistory = (reconReport.tweakHistory as TweakEntry[]) || [];

            if (reconTree) {
              setUsecaseTree(reconTree);
              setGenStats({
                totalCases: reconSummary?.totalCases || 0,
                qualityScore: reconSummary?.qualityScore || 0,
                modules: reconSummary?.modules || 0,
                duration: (reconReport as Record<string, unknown>).duration as number || 0,
              });
              setLoadedFiles(reconFiles);
              onCompleteRef.current(reconTree, reconSummary);
            }
            if (reconTweakHistory.length > 0) {
              setTweakHistory(reconTweakHistory);
            }

            // Fallback: if still running but MD file exists, mark done locally + PATCH
            const stillRunning = reconTweakHistory
              .filter((e: TweakEntry) => e.status === "running")
              .sort((a: TweakEntry, b: TweakEntry) => b.round - a.round)[0];
            if (stillRunning && reconTree) {
              const currentMdVersion = maxMdVersion(reconFiles);
              if (currentMdVersion >= stillRunning.round || (currentMdVersion >= 0 && reconTree)) {
                // Local update
                setTweakHistory((prev) =>
                  prev.map((e) =>
                    e.round === stillRunning.round ? { ...e, status: "done" as const } : e
                  )
                );
                // PATCH with optimistic lock
                fetch(`/api/tasks/${initialTaskId}/tweak`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    round: stillRunning.round,
                    updates: { status: "done" },
                    expectedStatus: "running",
                  }),
                }).catch((err) => console.error("Reconcile PATCH failed:", err));
              }
            }
          } catch { /* reconcile failed silently */ }
        }
      } catch { /* fall through */ }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty
```

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat(P1b): add history reconcile for running tweak entries"
```

---

### Task 8: AITweakPanel — disable send when tweak running

**Files:**
- Modify: `components/usecase-gen/shared/ai-tweak-panel.tsx`

- [ ] **Step 1: Compute hasRunningTweak and use it for button disabled**

In `AITweakPanel`, add a derived value and update the send button's disabled condition.

After line 41 (`const [sending, setSending] = useState(false);`), add:

```typescript
  const hasRunningTweak = tweakHistory.some((e) => e.status === "running");
```

Change the send button's `disabled` prop (line 149) from:
```typescript
          disabled={!input.trim() || sending || !taskId}
```
to:
```typescript
          disabled={!input.trim() || sending || !taskId || hasRunningTweak}
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/ai-tweak-panel.tsx
git commit -m "feat: disable tweak send button when a running tweak exists"
```

---

### Task 9: Build check + manual verification

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit --pretty
```

Expected: No errors. Fix any type mismatches before proceeding.

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: Successful production build.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore: build fixes for tweak-history-status"
```

- [ ] **Step 4: Manual verification — P0 (server-side status)**

1. 发起一次微调 → 检查 DB 中 `tweakHistory` 最后一条 `status === "running"`
2. 等待 CLI 跑完 → 检查同一条 `status === "done"`
3. 关掉页面，再发起一次微调，**立即关页** → 等几分钟 → 重新打开历史页 → 确认 `status === "done"` 且不转圈

- [ ] **Step 5: Manual verification — PATCH optimistic lock**

1. 用一个已完成微调的任务 → curl PATCH `{status:"done", expectedStatus:"running"}` → 应返回 409
2. curl PATCH `{summary:"test"}` 不传 expectedStatus → 应返回 200（向后兼容）

- [ ] **Step 6: Manual verification — cancelTask**

1. 发起微调 → 立即取消 → 检查 DB 中 tweakHistory 条目 `status === "failed"`, `summary === "cancelled"`

- [ ] **Step 7: Manual verification — AITweakPanel guard**

1. 发起微调 → 关页 → 重新打开历史页进入该任务 → 确认「发送」按钮处于禁用状态（tweakHistory 有 running 条目）

- [ ] **Step 8: Manual verification — OutputFiles**

1. 微调进行中（已有上一轮文件），检查 OutputFiles 组件 → 旧文件正常展示，不闪烁空白
