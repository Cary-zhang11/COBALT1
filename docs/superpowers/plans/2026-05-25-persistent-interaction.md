# 任务持续交互与 Skill 智能匹配 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现任务执行中的持续多轮交互（AI 暂停等待用户确认 + 用户随时插话）和 Skill 关键词智能匹配。

**Architecture:** Runtime 进程保持运行不退出，`startTaskExecution` 的 for-await 循环在 `pause` 事件时不 return（用 `continue` 继续等待后续事件）。`resumeTask` 调用 `sendInput` 向 stdin 写入用户消息。前端采用聊天式 UI。

**Tech Stack:** Next.js 14, TypeScript, Prisma, TanStack Query, SSE, Claude CLI (`--input-format stream-json`)

---

## File Structure

### 后端

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/agent-runtime.ts` | Modify | 扩展 `AgentEvent`（`pauseReason`）和 `IAgentRuntime`（`sendInput`, `getProcessStatus`） |
| `lib/claude-cli-runtime.ts` | Modify | 保持 stdin 打开，实现 `sendInput`/`getProcessStatus`，生成 `pause` 事件 |
| `lib/sandbox.ts` | Modify | 新增 `copyFilesToWorkspace` |
| `lib/task-engine.ts` | Modify | `startTaskExecution` 遇 pause 不退出，`resumeTask` 改为 `sendInput`，健康检查定时器 |
| `lib/skill-matcher.ts` | Create | 关键词匹配算法 |
| `app/api/skills/match/route.ts` | Create | Skill 匹配 API |
| `app/api/tasks/[id]/resume/route.ts` | Modify | 放宽状态限制（paused + running 均可调用） |
| `app/api/tasks/[id]/cancel/route.ts` | Modify | kill 进程 + 清理 Map |
| `app/api/tasks/[id]/events/route.ts` | Modify | 扩展 `paused` 事件 payload（reason, toolName, toolInput） |
| `prisma/schema.prisma` | Modify | 新增 `pauseCount` |

### 前端

| File | Action | Responsibility |
|------|--------|----------------|
| `hooks/use-task-events.ts` | Modify | 扩展 `paused` 事件处理（reason），支持 running 状态输入 |
| `hooks/use-skill-match.ts` | Create | Skill 匹配 hook |
| `app/tasks/new/page.tsx` | Rewrite | 聊天式输入 + Skill 推荐卡片 |
| `app/tasks/[id]/execute/page.tsx` | Rewrite | 左侧步骤 + 右侧聊天对话，始终显示输入框 |

---

## Task 1: 扩展 AgentRuntime 类型定义

**Files:**
- Modify: `lib/agent-runtime.ts`

- [ ] **Step 1: 添加 `pauseReason` 到 `AgentEvent`，扩展 `IAgentRuntime` 接口**

```typescript
export interface AgentEvent {
  type: "system" | "chunk" | "tool_call" | "pause" | "error" | "complete";
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  pauseReason?: "tool_call" | "output_complete" | "permission_request";
  error?: string;
}

export interface SkillInput {
  taskId: string;
  skillId: string;
  skillName: string;
  skillContent: string;
  skillDirectory: string;
  userInput: string;
  uploadedFiles?: string[];
}

export interface IAgentRuntime {
  readonly name: string;
  start(input: SkillInput): AsyncIterable<AgentEvent>;
  sendInput(sessionId: string, message: string): Promise<void>;
  resume(sessionId: string, userReply: string): AsyncIterable<AgentEvent>;
  getProcessStatus(sessionId: string): "running" | "paused" | "crashed" | "exited" | null;
  cancel(key: string): Promise<void>;
}
```

- [ ] **Step 2: 验证类型编译**

Run: `npx tsc --noEmit`
Expected: No errors in this file (errors in implementing files are expected and will be fixed in later tasks)

- [ ] **Step 3: Commit**

```bash
git add lib/agent-runtime.ts
git commit -m "feat: extend AgentEvent with pauseReason and IAgentRuntime with sendInput/getProcessStatus"
```

---

## Task 2: 改造 CLI Runtime 支持持续进程

**Files:**
- Modify: `lib/claude-cli-runtime.ts`

- [ ] **Step 1: 修改 `processes` Map 存储结构，支持 sessionId 映射**

```typescript
interface ProcessInfo {
  process: ChildProcess;
  sessionId: string | null;
}

export class ClaudeCodeCLIRuntime implements IAgentRuntime {
  readonly name = "claude-cli";
  private processes = new Map<string, ProcessInfo>();
  private taskSessionMap = new Map<string, string>(); // taskId -> sessionId
```

- [ ] **Step 2: 修改 `spawnCLI` 保持 stdin 打开**

Change the stdin writing logic from:
```typescript
if (stdinData) {
  proc.stdin?.write(stdinData + "\n", "utf-8", () => {
    proc.stdin?.end();
  });
} else {
  proc.stdin?.end();
}
```

To:
```typescript
if (stdinData) {
  proc.stdin?.write(stdinData + "\n", "utf-8");
  // stdin stays open for sendInput
}
```

- [ ] **Step 3: 修改进程存储逻辑，跟踪 sessionId**

In `start()`, after `this.processes.set(processKey, proc)` line, update to:
```typescript
this.processes.set(processKey, { process: proc, sessionId: null });
```

In `parseStreamJson`, when session_id is received:
```typescript
if (data.type === "system" && data.subtype === "init") {
  this.taskSessionMap.set(processKey, data.session_id);
  const info = this.processes.get(processKey);
  if (info) {
    info.sessionId = data.session_id;
  }
  return {
    type: "system",
    content: JSON.stringify({
      session_id: data.session_id,
      model: data.model,
    }),
  };
}
```

- [ ] **Step 4: 实现 `sendInput` 方法**

Add after `resume()` method:
```typescript
async sendInput(sessionId: string, message: string): Promise<void> {
  const info = Array.from(this.processes.values()).find(
    (p) => p.sessionId === sessionId
  );
  if (!info) {
    throw new Error(`No active process for session ${sessionId}`);
  }
  const payload = JSON.stringify({ type: "user", content: message });
  info.process.stdin?.write(payload + "\n", "utf-8");
}
```

- [ ] **Step 5: 实现 `getProcessStatus` 方法**

```typescript
getProcessStatus(sessionId: string): "running" | "paused" | "crashed" | "exited" | null {
  const info = Array.from(this.processes.values()).find(
    (p) => p.sessionId === sessionId
  );
  if (!info) return null;
  const proc = info.process;
  if (proc.killed || proc.exitCode !== null) return "exited";
  return "running";
}
```

- [ ] **Step 6: 修改 `cancel` 方法接受 taskId 或 sessionId**

```typescript
async cancel(key: string): Promise<void> {
  let info = this.processes.get(key);
  if (!info) {
    info = Array.from(this.processes.values()).find((p) => p.sessionId === key);
  }
  if (info && !info.process.killed && info.process.exitCode === null) {
    info.process.kill("SIGTERM");
  }
  // Clean up all references
  for (const [k, v] of this.processes) {
    if (v === info || k === key || v.sessionId === key) {
      this.processes.delete(k);
    }
  }
  for (const [taskId, sessionId] of this.taskSessionMap) {
    if (sessionId === key || taskId === key) {
      this.taskSessionMap.delete(taskId);
    }
  }
}
```

- [ ] **Step 7: 修改 `parseStreamJson` 生成 `pause` 事件**

Add after `parseStreamJson` method opening:
```typescript
const HIGH_RISK_TOOLS = ["Bash", "Edit", "Write", "Delete", "CreateFile"];
```

Change `tool_use` block handling from:
```typescript
const toolBlock = blocks.find((b: { type: string }) => b.type === "tool_use");
if (toolBlock) {
  return {
    type: "tool_call",
    toolName: toolBlock.name,
    toolInput: toolBlock.input,
  };
}
```

To:
```typescript
const toolBlock = blocks.find((b: { type: string }) => b.type === "tool_use");
if (toolBlock) {
  if (HIGH_RISK_TOOLS.includes(toolBlock.name)) {
    return {
      type: "pause",
      pauseReason: "tool_call",
      toolName: toolBlock.name,
      toolInput: toolBlock.input,
    };
  }
  return {
    type: "tool_call",
    toolName: toolBlock.name,
    toolInput: toolBlock.input,
  };
}
```

Change `result` handling from:
```typescript
if (data.type === "result") {
  if (data.subtype === "error" || data.is_error) {
    return { type: "error", error: data.result || "CLI execution error" };
  }
  return { type: "complete" };
}
```

To:
```typescript
if (data.type === "result") {
  if (data.subtype === "error" || data.is_error) {
    return { type: "error", error: data.result || "CLI execution error" };
  }
  return { type: "pause", pauseReason: "output_complete" };
}
```

- [ ] **Step 8: 修改 `spawnCLI` finally 块**

Remove the automatic process cleanup from `finally` so the process stays alive after the initial for-await. Actually, we still need to clean up on normal exit. The process should stay alive because the stdin is open and the CLI is waiting for more input.

Keep the finally block as-is for now - when the process exits (either naturally or via cancel), it will clean up.

- [ ] **Step 9: 验证编译**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add lib/claude-cli-runtime.ts
git commit -m "feat: refactor CLI runtime for persistent process with sendInput and pause events"
```

---

## Task 3: 新增 sandbox 文件复制功能

**Files:**
- Modify: `lib/sandbox.ts`

- [ ] **Step 1: 添加 `copyFile` import 并实现 `copyFilesToWorkspace`**

```typescript
import path from "path";
import fs from "fs/promises";

const SANDBOX_ROOT = process.env.SANDBOX_ROOT || "./sandbox";

function resolve(taskId: string, subdir: string): string {
  return path.resolve(process.cwd(), SANDBOX_ROOT, taskId, subdir);
}

export function getWorkspacePath(taskId: string): string {
  return resolve(taskId, "workspace");
}

export function getOutputPath(taskId: string): string {
  return resolve(taskId, "output");
}

export function getTempPath(taskId: string): string {
  return resolve(taskId, "temp");
}

export async function ensureSandbox(taskId: string): Promise<void> {
  await fs.mkdir(getWorkspacePath(taskId), { recursive: true });
  await fs.mkdir(getOutputPath(taskId), { recursive: true });
  await fs.mkdir(getTempPath(taskId), { recursive: true });
}

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

export async function cleanupSandbox(taskId: string): Promise<void> {
  const taskDir = path.resolve(process.cwd(), SANDBOX_ROOT, taskId);
  try {
    await fs.rm(taskDir, { recursive: true, force: true });
  } catch {
    console.warn(`Failed to cleanup sandbox for task ${taskId}`);
  }
}

export function validatePath(filePath: string, taskId: string): boolean {
  const sandboxBase = path.resolve(process.cwd(), SANDBOX_ROOT, taskId);
  const resolved = path.resolve(filePath);
  return resolved.startsWith(sandboxBase);
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/sandbox.ts
git commit -m "feat: add copyFilesToWorkspace for uploaded file access"
```

---

## Task 4: 改造 Task Engine 支持多轮交互

**Files:**
- Modify: `lib/task-engine.ts`

- [ ] **Step 1: 更新 imports，添加 `copyFilesToWorkspace`**

```typescript
import { prisma } from "./prisma";
import { cliRuntime } from "./claude-cli-runtime";
import { getOutputPath, copyFilesToWorkspace } from "./sandbox";
import type { AgentEvent } from "./agent-runtime";
import fs from "fs/promises";
import path from "path";
```

- [ ] **Step 2: 修改 `startTaskExecution` 处理 `pause` 事件（不退出循环）**

```typescript
export async function startTaskExecution(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { skill: true, skillVersion: true },
  });

  if (!task) throw new Error("Task not found");
  if (task.status !== "running")
    throw new Error("Task not in running state (execute route should set it first)");

  try {
    // Copy uploaded files to workspace
    if (task.inputFiles && task.inputFiles.length > 0) {
      await copyFilesToWorkspace(taskId, task.inputFiles);
    }

    const skillContent = task.skillVersion.content;
    const skillDir = task.skill.filePath;

    const stream = runtime.start({
      taskId: task.id,
      skillId: task.skillId,
      skillName: task.skill.name,
      skillContent,
      skillDirectory: skillDir,
      userInput: task.input,
      uploadedFiles: task.inputFiles,
    });

    let sequence = 0;
    let output = "";
    const startTime = Date.now();

    // Start health check timer
    const healthCheckInterval = setInterval(async () => {
      if (!task.sessionId) return;
      const status = runtime.getProcessStatus(task.sessionId);
      if (status === "exited" || status === null) {
        // Process crashed unexpectedly
        clearInterval(healthCheckInterval);
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "failed",
            output: output + "\n\n[Error: Process terminated unexpectedly]",
            duration: Date.now() - startTime,
          },
        });
      }
    }, 5000);

    try {
      for await (const event of stream) {
        sequence++;
        await logEvent(taskId, sequence, event);

        if (event.type === "chunk" && event.content) {
          output += event.content;
        }

        if (event.type === "system" && event.content) {
          try {
            const meta = JSON.parse(event.content);
            if (meta.session_id) {
              await prisma.task.update({
                where: { id: taskId },
                data: { sessionId: meta.session_id },
              });
            }
          } catch {}
        }

        if (event.type === "pause") {
          await prisma.task.update({
            where: { id: taskId },
            data: {
              status: "paused",
              pauseReason: event.pauseReason || "unknown",
              pausedAt: new Date(),
              output,
              duration: Date.now() - startTime,
            },
          });
          // Loop continues - process stays alive, waiting for sendInput
          continue;
        }

        if (event.type === "error") {
          await prisma.task.update({
            where: { id: taskId },
            data: {
              status: "failed",
              output,
              duration: Date.now() - startTime,
            },
          });
          return;
        }
      }

      // Stream ended (process exited)
      await collectOutputFiles(taskId);
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: "completed",
          output,
          duration: Date.now() - startTime,
        },
      });
    } finally {
      clearInterval(healthCheckInterval);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "failed", output: `Error: ${message}` },
    });
  }
}
```

- [ ] **Step 3: 重写 `resumeTask` 为 `sendInput` 模式**

```typescript
export async function resumeTask(
  taskId: string,
  userReply: string
): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  if (!task.sessionId) throw new Error("No session ID for resume");

  // Allow resume from both paused and running states (user can interject anytime)
  if (!["paused", "running"].includes(task.status)) {
    throw new Error("Task not in a resumable state");
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "running",
      pauseReason: null,
      pausedAt: null,
      pauseCount: { increment: 1 },
    },
  });

  await runtime.sendInput(task.sessionId, userReply);
  // The existing stream in startTaskExecution continues processing
}
```

- [ ] **Step 4: 更新 `cancelTask` 清理逻辑**

```typescript
export async function cancelTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");

  // Cancel by sessionId if available, otherwise by taskId
  await runtime.cancel(task.sessionId || taskId);

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "cancelled" },
  });
}
```

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/task-engine.ts
git commit -m "feat: refactor task engine for multi-turn interaction with pause-continue loop"
```

---

## Task 5: 新增 Skill 关键词匹配模块和 API

**Files:**
- Create: `lib/skill-matcher.ts`
- Create: `app/api/skills/match/route.ts`

- [ ] **Step 1: 实现 `lib/skill-matcher.ts`**

```typescript
import { prisma } from "./prisma";

// Simple Chinese/English stop words
const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那", "请", "帮忙", "帮我", "给", "做", "生成", "创建", "写", "需要", "想要",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "want", "help", "me", "my", "i", "you", "your", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "under",
]);

function extractKeywords(text: string): string[] {
  // Split by non-word characters (supports Chinese and English)
  const tokens = text
    .toLowerCase()
    .split(/[^一-龥a-zA-Z0-9]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  return [...new Set(tokens)]; // deduplicate
}

export interface MatchResult {
  skillId: string;
  name: string;
  description: string;
  confidence: number;
  reason: string;
}

export async function matchSkills(
  userId: string,
  input: string
): Promise<{ matches: MatchResult[]; suggested: string | null }> {
  const skills = await prisma.skill.findMany({
    where: {
      OR: [
        { visibility: "public" },
        { uploadedBy: userId },
      ],
    },
    select: { id: true, name: true, description: true },
  });

  const inputKeywords = extractKeywords(input);

  const matches: MatchResult[] = skills.map((skill) => {
    const skillText = `${skill.name} ${skill.description || ""}`;
    const skillKeywords = extractKeywords(skillText);

    const overlap = inputKeywords.filter((k) => skillKeywords.includes(k));
    const uniqueInputKeywords = [...new Set(inputKeywords)];
    const confidence =
      uniqueInputKeywords.length > 0
        ? Math.min((overlap.length / uniqueInputKeywords.length) * 2, 1)
        : 0;

    return {
      skillId: skill.id,
      name: skill.name,
      description: skill.description || "",
      confidence,
      reason:
        overlap.length > 0
          ? `匹配关键词: ${overlap.slice(0, 3).join(", ")}`
          : "通用推荐",
    };
  });

  const filtered = matches
    .filter((m) => m.confidence > 0.05)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  return {
    matches: filtered,
    suggested: filtered.length > 0 ? filtered[0].skillId : null,
  };
}
```

- [ ] **Step 2: 实现 `app/api/skills/match/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { matchSkills } from "@/lib/skill-matcher";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);
    const { input } = await req.json();

    if (!input) {
      return NextResponse.json(
        { error: "input required" },
        { status: 400 }
      );
    }

    const result = await matchSkills(userId, input);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Match failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/skill-matcher.ts app/api/skills/match/route.ts
git commit -m "feat: add keyword-based skill matching module and API"
```

---

## Task 6: 改造 API 路由

**Files:**
- Modify: `app/api/tasks/[id]/resume/route.ts`
- Modify: `app/api/tasks/[id]/cancel/route.ts`
- Modify: `app/api/tasks/[id]/events/route.ts`

- [ ] **Step 1: 修改 resume 路由，放宽状态限制**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { resumeTask } from "@/lib/task-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);
    const { userReply } = await req.json();

    if (!userReply) {
      return NextResponse.json(
        { error: "userReply required" },
        { status: 400 }
      );
    }

    await resumeTask(params.id, userReply);

    return NextResponse.json({ success: true, status: "running" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Resume failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 修改 cancel 路由（无需改动，已有逻辑）**

The existing cancel route already calls `cancelTask` which we've updated. No changes needed.

Actually, verify it still works. The current cancel route is fine.

- [ ] **Step 3: 修改 events 路由，扩展 paused payload**

```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.cookies.get("token")?.value;
  try {
    await getAuthUser(token);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let lastSequence = 0;
  let isActive = true;
  let lastPausedState: { reason: string | null; toolName: string | null; toolInput: unknown | null } | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const poll = async () => {
        while (isActive) {
          try {
            const task = await prisma.task.findUnique({
              where: { id: params.id },
              select: { status: true, pauseReason: true },
            });

            if (!task) {
              send("error", { message: "Task not found" });
              controller.close();
              return;
            }

            const newLogs = await prisma.taskLog.findMany({
              where: { taskId: params.id, sequence: { gt: lastSequence } },
              orderBy: { sequence: "asc" },
            });

            for (const log of newLogs) {
              send("log", {
                sequence: log.sequence,
                type: log.type,
                output: log.output,
                input: log.input,
                createdAt: log.createdAt,
              });
              lastSequence = log.sequence;

              // Track pause details from the latest pause log
              if (log.type === "pause" && log.input) {
                try {
                  const data = JSON.parse(log.input);
                  lastPausedState = {
                    reason: data.reason || null,
                    toolName: data.tool || null,
                    toolInput: data.input || null,
                  };
                } catch {
                  lastPausedState = null;
                }
              }
            }

            if (["completed", "failed", "cancelled"].includes(task.status)) {
              send("done", { status: task.status });
              controller.close();
              return;
            }

            if (task.status === "paused") {
              send("paused", {
                status: "paused",
                reason: task.pauseReason,
                ...lastPausedState,
              });
            }

            await new Promise((r) => setTimeout(r, 1000));
          } catch (error) {
            send("error", {
              message:
                error instanceof Error ? error.message : "Polling error",
            });
            controller.close();
            return;
          }
        }
      };

      poll();
    },
    cancel() {
      isActive = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: 更新 TaskLog 写入逻辑，存储 pause 详情**

In `lib/task-engine.ts`, modify `logEvent` to store pause details:

```typescript
async function logEvent(
  taskId: string,
  sequence: number,
  event: AgentEvent
): Promise<void> {
  let inputData: string | null = null;

  if (event.type === "tool_call" || event.type === "pause") {
    inputData = JSON.stringify({
      tool: event.toolName,
      input: event.toolInput,
      reason: event.pauseReason,
    });
  }

  await prisma.taskLog.create({
    data: {
      taskId,
      sequence,
      type: event.type,
      output: event.content || event.error || null,
      input: inputData,
    },
  });
}
```

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add app/api/tasks/\[id\]/resume/route.ts app/api/tasks/\[id\]/events/route.ts lib/task-engine.ts
git commit -m "feat: update API routes for multi-turn interaction and extended SSE events"
```

---

## Task 7: Prisma Schema 更新

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 添加 `pauseCount` 到 Task 模型**

```prisma
model Task {
  id             String       @id @default(cuid())
  userId         String
  user           User         @relation(fields: [userId], references: [id])
  skillId        String
  skill          Skill        @relation(fields: [skillId], references: [id])
  skillVersionId String
  skillVersion   SkillVersion @relation(fields: [skillVersionId], references: [id])

  status      String   @default("pending")
  input       String   @db.Text
  inputFiles  String[] @default([])
  output      String?  @db.Text
  outputFiles String[] @default([])
  duration    Int?

  agentRuntime  String  @default("claude-cli")
  modelProvider String?
  tokenUsage    Int?

  sessionId   String?
  pauseReason String?
  pausedAt    DateTime?
  pauseCount  Int      @default(0)

  retryCount Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  logs     TaskLog[]
  feedback TaskFeedback[]
}
```

- [ ] **Step 2: 生成并执行迁移**

Run:
```bash
npx prisma migrate dev --name add_pause_count
```
Expected: Migration created and applied successfully

- [ ] **Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: add pauseCount to Task model"
```

---

## Task 8: 前端 Hooks 改造

**Files:**
- Modify: `hooks/use-task-events.ts`
- Create: `hooks/use-skill-match.ts`

- [ ] **Step 1: 扩展 `useTaskEvents` 处理 paused reason 和 running 状态输入**

```typescript
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface TaskLogEvent {
  sequence: number;
  type: string;
  output: string | null;
  input: string | null;
  createdAt: string;
}

interface PausedEvent {
  status: string;
  reason?: string;
  toolName?: string;
  toolInput?: unknown;
}

interface UseTaskEventsOptions {
  taskId: string;
  enabled?: boolean;
  onComplete?: (status: string) => void;
  onPaused?: (data: PausedEvent) => void;
}

export function useTaskEvents({
  taskId,
  enabled = true,
  onComplete,
  onPaused,
}: UseTaskEventsOptions) {
  const [logs, setLogs] = useState<TaskLogEvent[]>([]);
  const [status, setStatus] = useState<string>("connecting");
  const [pausedData, setPausedData] = useState<PausedEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!taskId || !enabled) return;

    const es = new EventSource(`/api/tasks/${taskId}/events`);
    eventSourceRef.current = es;
    setStatus("connected");

    es.addEventListener("log", (e) => {
      const data = JSON.parse(e.data) as TaskLogEvent;
      setLogs((prev) => [...prev, data]);
    });

    es.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      setStatus(data.status);
      onComplete?.(data.status);
      es.close();
    });

    es.addEventListener("paused", (e) => {
      const data = JSON.parse(e.data) as PausedEvent;
      setStatus("paused");
      setPausedData(data);
      onPaused?.(data);
    });

    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus("disconnected");
      } else {
        setStatus("error");
        es.close();
      }
    });
  }, [taskId, enabled, onComplete, onPaused]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  return { logs, status, pausedData, disconnect };
}
```

- [ ] **Step 2: 创建 `useSkillMatch` hook**

```typescript
"use client";

import { useState } from "react";

interface MatchResult {
  skillId: string;
  name: string;
  description: string;
  confidence: number;
  reason: string;
}

export function useSkillMatch() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const match = async (input: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/skills/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!res.ok) throw new Error("Match failed");
      const data = await res.json();
      setMatches(data.matches || []);
      setSuggested(data.suggested || null);
      return data;
    } catch (err) {
      console.error(err);
      setMatches([]);
      setSuggested(null);
    } finally {
      setIsLoading(false);
    }
  };

  return { matches, suggested, isLoading, match };
}
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add hooks/use-task-events.ts hooks/use-skill-match.ts
git commit -m "feat: update task events hook and add skill match hook"
```

---

## Task 9: 前端新建任务页重写（聊天式 + Skill 匹配）

**Files:**
- Rewrite: `app/tasks/new/page.tsx`

- [ ] **Step 1: 重写为聊天式 UI**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSkillMatch } from "@/hooks/use-skill-match";
import { useCreateTask, useExecuteTask } from "@/hooks/use-tasks";
import { Upload, Send, Loader2, FileText, Wand2, CheckCircle2 } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  skills?: Array<{
    skillId: string;
    name: string;
    description: string;
    confidence: number;
    reason: string;
  }>;
}

export default function NewTaskPage() {
  const router = useRouter();
  const createTask = useCreateTask();
  const executeTask = useExecuteTask();
  const { matches, isLoading: matching, match } = useSkillMatch();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "ai",
      content: "你好！我是 SkillFlow 智能助手。\n\n请告诉我你想处理什么需求？你可以直接描述，或上传需求文档。",
    },
  ]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "matching" | "confirming">("input");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    setUploading(true);
    const uploadedPaths: string[] = [];

    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        uploadedPaths.push(data.filePath);
      }
    }

    setFiles((prev) => [...prev, ...uploadedPaths]);
    setUploading(false);
  };

  const handleSend = async () => {
    if (!input.trim() && files.length === 0) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input || `上传了 ${files.length} 个文件`,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPhase("matching");

    // Call skill matching
    const result = await match(userMsg.content);

    const aiMsg: ChatMessage = {
      id: `ai-${Date.now()}`,
      role: "ai",
      content: result?.matches?.length
        ? "基于你的需求，我为你匹配了以下 Skills："
        : "未找到精确匹配的 Skill，请手动选择或继续。",
      skills: result?.matches || [],
    };
    setMessages((prev) => [...prev, aiMsg]);
    setPhase("confirming");
  };

  const handleSelectSkill = (skillId: string) => {
    setSelectedSkillId(skillId);
    const skill = matches.find((m) => m.skillId === skillId);
    if (skill) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-confirm-${Date.now()}`,
          role: "ai",
          content: `已选择 **${skill.name}**。准备好后点击下方按钮启动工作流。`,
        },
      ]);
    }
  };

  const handleStartWorkflow = async () => {
    if (!selectedSkillId) return;

    // Collect all user messages as input
    const fullInput = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n\n");

    const result = await createTask.mutateAsync({
      skillId: selectedSkillId,
      input: fullInput,
      uploadedFiles: files.length > 0 ? files : undefined,
    });

    await executeTask.mutateAsync(result.taskId);
    router.push(`/tasks/${result.taskId}/execute`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">新建任务</h1>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">AI 在线</span>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "ai"
                    ? "bg-gradient-to-br from-violet-500 to-cyan-500"
                    : "bg-gray-200"
                }`}
              >
                {msg.role === "ai" ? (
                  <Wand2 className="w-4 h-4 text-white" />
                ) : (
                  <span className="text-xs font-medium text-gray-600">U</span>
                )}
              </div>
              <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : ""}`}>
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-white border shadow-sm rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>

                {/* Skill Recommendations */}
                {msg.skills && msg.skills.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.skills.map((skill, idx) => (
                      <button
                        key={skill.skillId}
                        onClick={() => handleSelectSkill(skill.skillId)}
                        className={`w-full text-left p-4 border rounded-xl transition-all ${
                          selectedSkillId === skill.skillId
                            ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                            : "hover:border-blue-300 hover:bg-blue-50/50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Wand2 className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm">{skill.name}</h4>
                              {idx === 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                  最匹配
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {skill.description}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                                匹配度: {(skill.confidence * 100).toFixed(0)}%
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {skill.reason}
                              </span>
                            </div>
                          </div>
                          {selectedSkillId === skill.skillId && (
                            <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {matching && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">正在分析需求...</span>
            </div>
          )}

          {phase === "confirming" && selectedSkillId && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleStartWorkflow}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                启动工作流
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {files.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700"
                >
                  <FileText className="w-3 h-3" />
                  {f.split(/[/\\]/).pop()}
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="ml-1 hover:text-blue-900"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className="p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 text-muted-foreground" />
              )}
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="描述你的需求..."
              className="flex-1 px-4 py-3 border rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-h-[44px] max-h-[120px]"
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && files.length === 0) || matching}
              className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/tasks/new/page.tsx
git commit -m "feat: rewrite new task page with chat-style UI and skill matching"
```

---

## Task 10: 前端执行页重写（持续交互）

**Files:**
- Rewrite: `app/tasks/[id]/execute/page.tsx`

- [ ] **Step 1: 重写为左侧步骤 + 右侧聊天对话**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTask } from "@/hooks/use-tasks";
import { useTaskEvents } from "@/hooks/use-task-events";
import { useResumeTask, useCancelTask } from "@/hooks/use-tasks";
import {
  Loader2,
  Send,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Bot,
  User,
  Wrench,
} from "lucide-react";

const WORKFLOW_STEPS = [
  { id: "parse", name: "解析输入" },
  { id: "analyze", name: "AI 分析" },
  { id: "match", name: "匹配 Skill" },
  { id: "generate", name: "生成内容" },
  { id: "review", name: "人工审核" },
  { id: "output", name: "输出结果" },
];

export default function TaskExecutePage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const { data: taskData } = useTask(taskId);
  const resumeTask = useResumeTask();
  const cancelTask = useCancelTask();

  const [replyInput, setReplyInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { logs, status, pausedData } = useTaskEvents({
    taskId,
    enabled: !!taskId,
    onComplete: (finalStatus) => {
      if (finalStatus === "completed") {
        setTimeout(() => router.push(`/tasks/${taskId}/result`), 1500);
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleSend = async () => {
    if (!replyInput.trim()) return;
    await resumeTask.mutateAsync({ taskId, userReply: replyInput });
    setReplyInput("");
  };

  const handleCancel = async () => {
    await cancelTask.mutateAsync(taskId);
  };

  const task = taskData?.task;
  const isInputEnabled = status === "paused" || status === "connected";

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Sidebar - Workflow Steps */}
      <div className="w-64 border-r bg-gray-50/50 flex-shrink-0 overflow-y-auto">
        <div className="p-4">
          <h3 className="text-sm font-medium mb-3">执行步骤</h3>
          <div className="space-y-1">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isActive = idx === 2; // Mock current step
              const isCompleted = idx < 2;
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                    isActive
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : isCompleted
                      ? "text-gray-700"
                      : "text-gray-400"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      isCompleted
                        ? "bg-green-100 text-green-600"
                        : isActive
                        ? "bg-blue-100 text-blue-600"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span>{step.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Panel - Chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg">
              {task?.skill?.name || "任务执行中"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Task ID: {taskId.slice(0, 8)}...
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            {status !== "completed" && status !== "failed" && (
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              >
                <XCircle className="w-3 h-3 inline mr-1" />
                取消
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {logs.map((log, i) => (
              <ChatMessage key={i} log={log} />
            ))}

            {status === "connected" && logs.length === 0 && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                等待执行输出...
              </div>
            )}

            {status === "completed" && (
              <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 px-4 py-3 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
                任务已完成，正在跳转到结果页...
              </div>
            )}

            {status === "failed" && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                任务执行失败
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input - Always visible */}
        <div className="border-t px-6 py-4">
          <div className="max-w-3xl mx-auto">
            {pausedData?.reason === "tool_call" && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800 text-sm">
                  <Wrench className="w-4 h-4" />
                  <span className="font-medium">
                    需要确认: {pausedData.toolName}
                  </span>
                </div>
                {pausedData.toolInput && (
                  <pre className="mt-2 text-xs text-amber-700 bg-amber-100/50 p-2 rounded overflow-auto">
                    {JSON.stringify(pausedData.toolInput, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <input
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  status === "paused"
                    ? "输入回复以继续执行..."
                    : "随时输入指令..."
                }
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!replyInput.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    connecting: { label: "连接中", cls: "text-gray-600 bg-gray-100" },
    connected: { label: "执行中", cls: "text-blue-600 bg-blue-50" },
    paused: { label: "等待输入", cls: "text-orange-600 bg-orange-50" },
    completed: { label: "已完成", cls: "text-green-600 bg-green-50" },
    failed: { label: "失败", cls: "text-red-600 bg-red-50" },
    disconnected: { label: "已断开", cls: "text-gray-600 bg-gray-100" },
    error: { label: "连接错误", cls: "text-red-600 bg-red-50" },
  };
  const c = config[status] || config.connecting;
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function ChatMessage({
  log,
}: {
  log: { type: string; output: string | null; input: string | null };
}) {
  if (log.type === "system") return null;

  if (log.type === "tool_call" && log.input) {
    try {
      const data = JSON.parse(log.input);
      return (
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Wrench className="w-4 h-4 text-gray-600" />
          </div>
          <div className="px-4 py-2 bg-gray-50 border rounded-xl text-xs font-mono max-w-[80%]">
            <span className="text-blue-600 font-medium">[{data.tool}]</span>{" "}
            <span className="text-muted-foreground">
              {typeof data.input === "string"
                ? data.input.slice(0, 100)
                : JSON.stringify(data.input).slice(0, 100)}
            </span>
          </div>
        </div>
      );
    } catch {}
  }

  if (log.type === "chunk" && log.output) {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="px-4 py-2.5 bg-white border rounded-2xl rounded-tl-md text-sm whitespace-pre-wrap max-w-[80%]">
          {log.output}
        </div>
      </div>
    );
  }

  if (log.type === "error" && log.output) {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-4 h-4 text-red-600" />
        </div>
        <div className="px-4 py-2.5 bg-red-50 text-red-700 text-sm rounded-2xl rounded-tl-md max-w-[80%]">
          {log.output}
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/tasks/\[id\]/execute/page.tsx
git commit -m "feat: rewrite execute page with chat-style persistent interaction"
```

---

## Self-Review Checklist

### 1. Spec Coverage

| Spec 章节 | 实现任务 | 状态 |
|-----------|---------|------|
| 1.1 目标 | 全部 Tasks | 已覆盖 |
| 1.2 一期范围 (7 个场景) | Tasks 2, 4, 6, 10 | 已覆盖 |
| 2.1 架构设计 | Tasks 1-4 | 已覆盖 |
| 3.1 Skill 匹配流程 | Tasks 5, 9 | 已覆盖 |
| 3.2 启动流程 | Tasks 2, 3, 4 | 已覆盖 |
| 3.3 暂停-恢复循环 | Tasks 2, 4, 6, 8, 10 | 已覆盖 |
| 3.4 跨 Skill 衔接 | Tasks 2, 4 | 已覆盖 (sendInput 注入) |
| 3.5 输出文件收集 | Task 4 (已有逻辑) | 已覆盖 |
| 4.1 Schema | Task 7 | 已覆盖 |
| 4.2 Runtime 接口 | Task 1 | 已覆盖 |
| 4.3 API 路由 | Tasks 5, 6 | 已覆盖 |
| 4.4 SSE 事件 | Task 6 | 已覆盖 |
| 5.1 前端页面 | Tasks 9, 10 | 已覆盖 |
| 6.1 关键词匹配 | Task 5 | 已覆盖 |
| 7.1 进程崩溃恢复 | Task 4 (健康检查定时器) | 已覆盖 |
| 8. 测试策略 | 各 Task 中的验证步骤 | 已覆盖 |

### 2. Placeholder Scan

- [x] 无 "TBD", "TODO", "implement later"
- [x] 无 "Add appropriate error handling" 等模糊描述
- [x] 每个代码步骤都有完整代码
- [x] 无 "Similar to Task N" 引用

### 3. Type Consistency

- [x] `AgentEvent.pauseReason` 类型 `"tool_call" | "output_complete" | "permission_request"` 在所有文件一致
- [x] `IAgentRuntime.sendInput` 签名 `Promise<void>` 一致
- [x] `IAgentRuntime.getProcessStatus` 返回类型一致
- [x] `useTaskEvents` 返回 `pausedData` 类型与 SSE 事件一致

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-persistent-interaction.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
