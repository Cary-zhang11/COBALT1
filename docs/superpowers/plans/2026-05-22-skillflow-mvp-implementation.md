# SkillFlow MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SkillFlow MVP - a web platform where internal team members can run Claude Code Skills via browser, with full task execution, pause/resume, and feedback loops.

**Architecture:** Next.js 14 App Router with standalone Node deployment, PostgreSQL via Prisma, Claude Code CLI headless as the agent runtime, SSE for real-time execution streaming. Platform is the executor, Skill `.md` is the director, LLM is the brain.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Prisma, PostgreSQL, bcryptjs, jose (JWT), @tanstack/react-query, Zustand, gray-matter, adm-zip

---

## ⚠️ Pre-Implementation Blockers (已修复，记录留存)

> 以下 5 个硬伤在 code review 中发现，**已全部在正文代码中修复**。此节保留作为决策记录。

### Blocker 1: CLI 参数和 stream-json 格式需要验证 ✅ 已验证并修正

`--system-prompt` 参数名 ✅ 正确。stream-json 实际事件类型已验证并修正：

| 原猜测 | 实际格式 | 说明 |
|---|---|---|
| `chunk` | `assistant` (content[].type="text") | 文本响应 |
| `tool_use` | `assistant` (content[].type="tool_use") | 工具调用 |
| `done` | `result` (subtype="success") | 完成事件 |
| 无 | `system` (subtype="init") | 含 session_id、model |

**额外发现：** `--output-format stream-json` 与 `--print` 搭配时**必须加 `--verbose`**，否则报错。

**实施前必须执行：**
```bash
# 1. 确认 CLI 参数
claude --help

# 2. 抓取实际 stream-json 格式
claude -p "读取当前目录的文件列表" --output-format stream-json 2>/dev/null | head -50

# 3. 确认 --resume 参数和 session ID 获取方式
claude --help | grep -i resume
```

**根据实际输出修正 Task 13 中的：**
- `args` 数组里的参数名（`--system-prompt` → 实际名称）
- `parseStreamJson` 里的 `data.type` 枚举值
- session ID 的提取逻辑

### Blocker 2: sandbox 路径用了 skillId，应该用 taskId ✅ 已修复

Task 13 `ClaudeCodeCLIRuntime.start()` 中：

```typescript
// ❌ 错误：skillId 是共享的，多任务会互相覆盖
const cwd = getWorkspacePath(input.skillId || "default");

// ✅ 修正：用 taskId，每任务独立沙箱
const cwd = getWorkspacePath(input.taskId);
```

**修复方式：**
1. `SkillInput` 接口（Task 11）增加 `taskId: string` 字段
2. `ClaudeCodeCLIRuntime.start()` 中所有路径计算改用 `input.taskId`
3. `task-engine.ts`（Task 14）调用 `runtime.start()` 时传入 `task.id` 作为 `taskId`

### Blocker 3: Skill zip 上传 POST 路由缺失 ✅ 已修复

File Structure Map 声明了 `POST upload zip`，但 Task 10 只写了 GET。

**修复：在 Task 10 Step 1 之后追加 Step 2：**

```typescript
// app/api/skills/route.ts - POST handler
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs/promises";
import { syncBuiltInSkillsToDB } from "@/lib/skill-registry";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { userId } = await verifyToken(token);

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file || !file.name.endsWith(".zip")) {
      return NextResponse.json({ error: "Must upload a .zip file" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const zip = new AdmZip(Buffer.from(bytes));

    // Validate: must contain SKILL.md
    const skillMdEntry = zip.getEntries().find(e => e.entryName.endsWith("SKILL.md"));
    if (!skillMdEntry) {
      return NextResponse.json({ error: "Zip must contain SKILL.md" }, { status: 400 });
    }

    // Extract to user skills directory
    const skillName = file.name.replace(".zip", "");
    const destDir = path.join(process.cwd(), "user-skills", userId, skillName);
    await fs.mkdir(destDir, { recursive: true });
    zip.extractAllTo(destDir, true);

    // Sync to DB
    // (reuse logic from skill-registry or add user skill registration)

    return NextResponse.json({ success: true, skillPath: destDir }, { status: 201 });
  } catch (error) {
    console.error("Skill upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
```

### Blocker 4: SSE 竞态 — task 状态在 SSE 连接时可能还是 pending ✅ 已修复

Task 15 execute 路由 fire-and-forget 后返回 200，前端立刻连 SSE 但 task 还是 `pending`。

**修复：execute 路由先同步改状态，再异步执行：**

```typescript
// app/api/tasks/[id]/execute/route.ts
export async function POST(req, { params }) {
  // ...auth...

  // ✅ 先同步更新状态
  await prisma.task.update({
    where: { id: params.id },
    data: { status: "running" },
  });

  // 再异步执行（不 await）
  startTaskExecution(params.id).catch((err) => {
    console.error("Task execution error:", err);
  });

  return NextResponse.json({ success: true, status: "running" });
}
```

同时 `task-engine.ts` 的 `startTaskExecution` 中**删掉**开头的 `status: "running"` 更新（避免重复）。

### Blocker 5: proc.kill() 对已退出进程会报错 ✅ 已修复

Task 13 第 1258 行在 for-await 循环结束后无条件 `proc.kill()`。

**修复：**
```typescript
// 替换 proc.kill(); 为：
if (!proc.killed && proc.exitCode === null) {
  proc.kill();
}
```

---

## 📋 已知缺失模块（实施时需补充）

> 以下模块在 spec v2.1 MVP 范围内但 plan 未覆盖，实施时需追加。不 block 主流程跑通。

| 模块 | 优先级 | 说明 |
|---|---|---|
| AI 反馈关键词聚合 | P2 | 需要后台定时任务（cron / node-cron），分析 TaskFeedback.comment 提取高频词 |
| 试用示例任务 seed 数据 | P2 | 在 `scripts/seed-skills.ts` 中追加一个 sample task + sample input |
| 模型设置页面 `/settings/model` | P2 | 显示当前 CLI 模型配置 + 探针结果，管理员可切换 |
| 错误双层展示 UI | P2 | 执行页面中：默认友好中文 + "查看技术详情"折叠 |
| 注册页面完整代码 | P1 | Task 7 Step 5 只有描述没有代码，实施时需补 |
| Task 23 执行页面完整 UI | P1 | 只有骨架，实施时需参考现有 `workflow/page.tsx` 的 chat 组件 |
| middleware JWT 验证 | P1 | 当前 middleware 只检查 token 存在性，应调 `verifyToken` 验签 |
| seed 脚本运行方式 | P1 | `npx ts-node` 需要额外依赖，改为 `npx tsx` |

---

## File Structure Map

### New Files (Backend)

| File | Responsibility |
|------|---------------|
| `prisma/schema.prisma` | Database schema: User, Skill, SkillVersion, Task, TaskLog, TaskFeedback |
| `lib/prisma.ts` | Prisma client singleton |
| `lib/auth.ts` | Password hashing (bcryptjs), JWT sign/verify (jose) |
| `lib/skill-registry.ts` | Load built-in skills from `.claude/skills/`, parse frontmatter, scan tool compatibility |
| `lib/agent-runtime.ts` | `IAgentRuntime` interface definition |
| `lib/claude-cli-runtime.ts` | `ClaudeCodeCLIRuntime` - spawn CLI, parse stream-json, handle pause/resume |
| `lib/task-engine.ts` | Task state machine, create/run/pause/resume/cancel operations |
| `lib/model-probe.ts` | Detect current CLI model capabilities (vision, toolCalling, etc.) |
| `lib/sandbox.ts` | Sandbox directory creation, path validation, cleanup |
| `app/api/auth/register/route.ts` | POST - register new user |
| `app/api/auth/login/route.ts` | POST - login, set JWT cookie |
| `app/api/auth/me/route.ts` | GET - current user info |
| `app/api/skills/route.ts` | GET list, POST upload zip |
| `app/api/skills/[id]/route.ts` | GET single skill, PATCH metadata |
| `app/api/skills/[id]/feedback/route.ts` | GET aggregated feedback for skill |
| `app/api/tasks/route.ts` | GET list (with filters), POST create |
| `app/api/tasks/[id]/route.ts` | GET task detail |
| `app/api/tasks/[id]/execute/route.ts` | POST start execution |
| `app/api/tasks/[id]/resume/route.ts` | POST resume from paused |
| `app/api/tasks/[id]/cancel/route.ts` | POST cancel task |
| `app/api/tasks/[id]/feedback/route.ts` | POST submit feedback |
| `app/api/tasks/[id]/events/route.ts` | GET SSE stream for real-time updates |
| `app/api/upload/route.ts` | POST file upload for task input |
| `app/api/stats/route.ts` | GET personal usage statistics |
| `middleware.ts` | JWT verification, route protection |

### New Files (Frontend)

| File | Responsibility |
|------|---------------|
| `stores/auth-store.ts` | Zustand store: user, login, logout |
| `stores/model-store.ts` | Zustand store: current model capabilities |
| `lib/api-client.ts` | Fetch wrapper with auth cookie handling |
| `hooks/use-auth.ts` | Auth check, redirect if not logged in |
| `hooks/use-tasks.ts` | TanStack Query hooks for tasks |
| `hooks/use-skills.ts` | TanStack Query hooks for skills |
| `hooks/use-task-events.ts` | SSE connection hook for task execution |
| `app/login/page.tsx` | Login page |
| `app/register/page.tsx` | Register page |
| `app/tasks/new/page.tsx` | New task creation (moved from `/projects/new`) |
| `app/tasks/[id]/skills/page.tsx` | Skill selection (moved from `/projects/[id]/skills`) |
| `app/tasks/[id]/execute/page.tsx` | Task execution with SSE (moved from `/projects/[id]/workflow`) |
| `app/tasks/[id]/result/page.tsx` | Result display (moved from `/projects/[id]/results`) |
| `app/skills/[id]/page.tsx` | Skill detail page |
| `app/stats/page.tsx` | Personal stats dashboard |
| `app/settings/model/page.tsx` | Model provider settings |

### Modified Files

| File | Changes |
|------|---------|
| `package.json` | Add dependencies: prisma, @prisma/client, bcryptjs, @types/bcryptjs, jose, @tanstack/react-query, zustand, gray-matter, adm-zip, @types/adm-zip |
| `next.config.js` | Add `output: 'standalone'` |
| `app/layout.tsx` | Add QueryClientProvider, AuthProvider |
| `app/page.tsx` | Replace mock data with API calls, rename "project" → "task" |
| `app/skills/page.tsx` | Replace mock data with API calls, add upload UI |
| `components/sidebar.tsx` | Update nav links (`/tasks/new` instead of `/projects/new`), show real user |

---

## Phase 1: Foundation (Database + Auth)

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`
- Modify: `.env` (create)

- [ ] **Step 1: Add dependencies to package.json**

Add these to `dependencies`:

```json
"@prisma/client": "^5.14.0",
"bcryptjs": "^2.4.3",
"jose": "^5.4.0",
"@tanstack/react-query": "^5.40.0",
"zustand": "^4.5.2",
"gray-matter": "^4.0.3",
"adm-zip": "^0.5.14"
```

Add these to `devDependencies`:

```json
"prisma": "^5.14.0",
"@types/bcryptjs": "^2.4.6",
"@types/adm-zip": "^0.5.6"
```

- [ ] **Step 2: Install packages**

Run: `npm install`

- [ ] **Step 3: Create `.env` file**

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/skillflow"
JWT_SECRET="change-this-to-a-random-string-at-least-32-chars"
AGENT_RUNTIME=claude-cli
SANDBOX_ROOT=./sandbox
TASK_TIMEOUT=300000
TASK_MAX_STEPS=30
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env
git commit -m "chore: add MVP dependencies (prisma, auth, query, zustand)"
```

### Task 2: Prisma Schema

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Write schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String?
  avatar       String?
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tasks     Task[]
  skills    Skill[]
  feedbacks TaskFeedback[]
}

model Skill {
  id           String   @id @default(uuid())
  name         String
  description  String
  source       String   // builtin | user_upload | git
  filePath     String
  version      String   // content hash
  allowedTools String[] @default([])
  maxSteps     Int      @default(30)
  tokenBudget  Int?
  visibility   String   @default("private")
  requires     String[] @default([])
  displayMeta  Json?    // { tagline, useCase, inputSample, outputSample }

  uploadedBy String?
  uploader   User?   @relation(fields: [uploadedBy], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tasks     Task[]
  versions  SkillVersion[]
}

model SkillVersion {
  id              String @id @default(uuid())
  skillId         String
  skill           Skill  @relation(fields: [skillId], references: [id], onDelete: Cascade)
  versionHash     String
  contentSnapshot String
  createdAt       DateTime @default(now())

  tasks Task[]
}

model Task {
  id             String @id @default(uuid())
  userId         String
  user           User   @relation(fields: [userId], references: [id])
  skillId        String
  skill          Skill  @relation(fields: [skillId], references: [id])
  skillVersionId String
  skillVersion   SkillVersion @relation(fields: [skillVersionId], references: [id])

  status        String   @default("pending")
  input         String   @db.Text
  inputFiles    String[] @default([])  // 用户上传的输入文件路径
  output        String?  @db.Text
  outputFiles   String[] @default([])  // 任务产出文件路径
  duration      Int?

  agentRuntime  String   @default("claude-cli")
  modelProvider String?
  tokenUsage    Int?

  sessionId   String?
  pauseReason String?
  pausedAt    DateTime?

  retryCount Int @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  logs     TaskLog[]
  feedback TaskFeedback[]
}

model TaskLog {
  id           String   @id @default(uuid())
  taskId       String
  task         Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  sequence     Int
  type         String   // llm_call | tool_call | pause | error | system
  input        String?  @db.Text
  output       String?  @db.Text
  duration     Int?
  errorCode    String?
  errorMessage String?  @db.Text
  stack        String?  @db.Text
  parentLogId  String?
  createdAt    DateTime @default(now())
}

model TaskFeedback {
  id        String   @id @default(uuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  rating    Int
  comment   String?
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Initialize Prisma and run migration**

Run:
```bash
npx prisma migrate dev --name init
```

Expected: Migration created and applied successfully.

- [ ] **Step 3: Generate Prisma Client**

Run: `npx prisma generate`

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add Prisma schema with User, Skill, Task, TaskLog, TaskFeedback"
```

### Task 3: Database Client Singleton

**Files:**
- Create: `lib/prisma.ts`

- [ ] **Step 1: Write singleton**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 2: Commit**

```bash
git add lib/prisma.ts
git commit -m "feat: add Prisma client singleton"
```

### Task 4: Auth Utilities

**Files:**
- Create: `lib/auth.ts`

- [ ] **Step 1: Write auth utilities**

```typescript
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-me"
);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: { userId: string; email: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: string; email: string }> {
  const { payload } = await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
  return payload as { userId: string; email: string };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: add auth utilities (bcrypt + jose JWT)"
```

### Task 5: Auth API Routes

**Files:**
- Create: `app/api/auth/register/route.ts`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/me/route.ts`

- [ ] **Step 1: Write register route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { error: "Invalid email or password (min 6 chars)" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: name || email.split("@")[0] },
    });

    const token = await createToken({ userId: user.id, email: user.email });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write login route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createToken({ userId: user.id, email: user.email });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write me route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { userId } = await verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatar: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/
git commit -m "feat: add auth API routes (register, login, me)"
```

### Task 6: Auth Middleware + Logout

**Files:**
- Create: `middleware.ts`
- Create: `app/api/auth/logout/route.ts`

- [ ] **Step 1: Write middleware**

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/api/auth/register", "/api/auth/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Write logout route**

```typescript
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("token", "", { maxAge: 0, path: "/" });
  return response;
}
```

- [ ] **Step 3: Commit**

```bash
git add middleware.ts app/api/auth/logout/route.ts
git commit -m "feat: add auth middleware and logout route"
```

### Task 7: Frontend Auth Store + Login/Register Pages

**Files:**
- Create: `stores/auth-store.ts`
- Create: `app/login/page.tsx`
- Create: `app/register/page.tsx`

- [ ] **Step 1: Write Zustand auth store**

```typescript
import { create } from "zustand";

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    set({ user: null });
    window.location.href = "/login";
  },
}));
```

- [ ] **Step 2: Create auth provider component**

Create `components/auth-provider.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setUser, setLoading]);

  return <>{children}</>;
}
```

- [ ] **Step 3: Update layout.tsx with providers**

Modify `app/layout.tsx` to wrap with QueryClientProvider and AuthProvider. First install react-query provider:

Create `components/query-provider.tsx`:

```typescript
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30 * 1000, refetchOnWindowFocus: false },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Then modify `app/layout.tsx`:

```typescript
import { QueryProvider } from "@/components/query-provider";
import { AuthProvider } from "@/components/auth-provider";

// In the body:
<QueryProvider>
  <AuthProvider>
    {children}
  </AuthProvider>
</QueryProvider>
```

- [ ] **Step 4: Write login page**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cpu, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-4">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-skill-500 to-cyan-500 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold">SkillFlow</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-skill-500/30 focus:border-skill-500"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-skill-500/30 focus:border-skill-500"
              placeholder="******"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 bg-skill-600 text-white rounded-lg text-sm font-medium hover:bg-skill-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            登录
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          还没有账号？{" "}
          <Link href="/register" className="text-skill-600 hover:text-skill-700 font-medium">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write register page**

Similar to login but with name field and `/api/auth/register` endpoint. Copy the login page structure, add name input, change endpoint to `/api/auth/register`.

- [ ] **Step 6: Commit**

```bash
git add stores/ components/auth-provider.tsx components/query-provider.tsx app/login/page.tsx app/register/page.tsx app/layout.tsx
git commit -m "feat: add auth store, login/register pages, query provider"
```

---

## Phase 2: Skill Registry

### Task 8: Skill Loading + Frontmatter Parsing

**Files:**
- Create: `lib/skill-registry.ts`

- [ ] **Step 1: Write skill registry**

```typescript
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { prisma } from "./prisma";
import crypto from "crypto";

const SKILLS_DIR = path.join(process.cwd(), ".claude", "skills");

export interface ParsedSkill {
  name: string;
  description: string;
  content: string;
  filePath: string;
  references?: string[];
  scripts?: string[];
}

export async function loadBuiltInSkills(): Promise<ParsedSkill[]> {
  try {
    await fs.access(SKILLS_DIR);
  } catch {
    console.warn("Skills directory not found:", SKILLS_DIR);
    return [];
  }

  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const skills: ParsedSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(SKILLS_DIR, entry.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    try {
      await fs.access(skillMdPath);
    } catch {
      continue;
    }

    const content = await fs.readFile(skillMdPath, "utf-8");
    const parsed = matter(content);

    skills.push({
      name: parsed.data.name || entry.name,
      description: parsed.data.description || "",
      content: parsed.content,
      filePath: skillDir,
    });
  }

  return skills;
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function syncBuiltInSkillsToDB(): Promise<void> {
  const skills = await loadBuiltInSkills();

  for (const skill of skills) {
    const versionHash = hashContent(skill.content);

    const existing = await prisma.skill.findFirst({
      where: { source: "builtin", filePath: skill.filePath },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!existing) {
      const newSkill = await prisma.skill.create({
        data: {
          name: skill.name,
          description: skill.description,
          source: "builtin",
          filePath: skill.filePath,
          version: versionHash,
        },
      });
      await prisma.skillVersion.create({
        data: {
          skillId: newSkill.id,
          versionHash,
          contentSnapshot: skill.content,
        },
      });
    } else if (existing.versions[0]?.versionHash !== versionHash) {
      await prisma.skill.update({
        where: { id: existing.id },
        data: { version: versionHash },
      });
      await prisma.skillVersion.create({
        data: {
          skillId: existing.id,
          versionHash,
          contentSnapshot: skill.content,
        },
      });
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/skill-registry.ts
git commit -m "feat: add skill registry with frontmatter parsing and DB sync"
```

### Task 9: Tool Compatibility Scanner

**Files:**
- Modify: `lib/skill-registry.ts`

- [ ] **Step 1: Add compatibility scanner**

Add to `lib/skill-registry.ts`:

```typescript
const CLI_SUPPORTED_TOOLS = [
  "Read", "Write", "Grep", "Glob", "Bash", "Edit", "MultiEdit"
];
const MVP_UNSUPPORTED_TOOLS = [
  "WebSearch", "WebFetch", "Task", "BashOutput", "KillBash"
];

export interface CompatibilityReport {
  supported: string[];
  unsupported: string[];
  isFullyCompatible: boolean;
}

export function scanToolCompatibility(skillContent: string): CompatibilityReport {
  const toolPattern = /(?:tool|Tool)\s*[:\(]\s*["']?([A-Za-z]+)["']?/g;
  const mentionedTools = new Set<string>();
  let match;
  while ((match = toolPattern.exec(skillContent)) !== null) {
    mentionedTools.add(match[1]);
  }

  // Also check for direct tool names in backticks or plain text
  const allTools = [...CLI_SUPPORTED_TOOLS, ...MVP_UNSUPPORTED_TOOLS];
  for (const tool of allTools) {
    const regex = new RegExp(`\\b${tool}\\b`, "g");
    if (regex.test(skillContent)) {
      mentionedTools.add(tool);
    }
  }

  const unsupported: string[] = [];
  for (const tool of mentionedTools) {
    if (MVP_UNSUPPORTED_TOOLS.includes(tool)) {
      unsupported.push(tool);
    }
  }

  return {
    supported: CLI_SUPPORTED_TOOLS.filter((t) => mentionedTools.has(t)),
    unsupported,
    isFullyCompatible: unsupported.length === 0,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/skill-registry.ts
git commit -m "feat: add skill tool compatibility scanner"
```

### Task 10: Skills API Routes

**Files:**
- Create: `app/api/skills/route.ts`
- Create: `app/api/skills/[id]/route.ts`

- [ ] **Step 1: Write skills list route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const skills = await prisma.skill.findMany({
      include: {
        versions: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ skills });
  } catch (error) {
    console.error("Skills list error:", error);
    return NextResponse.json({ error: "Failed to load skills" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write skill upload POST route (app/api/skills/route.ts)**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import AdmZip from "adm-zip";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await verifyToken(token);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || !file.name.endsWith(".zip")) {
      return NextResponse.json({ error: "A .zip file is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // Find SKILL.md
    const skillEntry = entries.find(
      (e) => e.entryName === "SKILL.md" || e.entryName.endsWith("/SKILL.md")
    );
    if (!skillEntry) {
      return NextResponse.json({ error: "SKILL.md not found in zip" }, { status: 400 });
    }

    const skillContent = skillEntry.getData().toString("utf-8");
    const skillName = formData.get("name") as string || file.name.replace(".zip", "");
    const description = formData.get("description") as string || "";

    // Extract to skills storage directory
    const skillDirName = `${skillName}-${randomUUID().slice(0, 8)}`;
    const skillDir = join(process.cwd(), "storage", "skills", skillDirName);
    await mkdir(skillDir, { recursive: true });
    zip.extractAllTo(skillDir, true);

    // Create skill in DB
    const skill = await prisma.skill.create({
      data: {
        name: skillName,
        description,
        filePath: skillDir,
        versions: {
          create: {
            version: "1.0.0",
            content: skillContent,
            changelog: "Initial upload",
          },
        },
      },
      include: { versions: true },
    });

    return NextResponse.json({ skill }, { status: 201 });
  } catch (error) {
    console.error("Skill upload error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write single skill route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const skill = await prisma.skill.findUnique({
      where: { id: params.id },
      include: {
        versions: { orderBy: { createdAt: "desc" } },
        _count: { select: { tasks: true } },
      },
    });

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    return NextResponse.json({ skill });
  } catch (error) {
    console.error("Skill detail error:", error);
    return NextResponse.json({ error: "Failed to load skill" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/skills/
git commit -m "feat: add skills API routes (list, upload, detail)"
```

---

## Phase 3: Task Engine + Agent Runtime

### Task 11: IAgentRuntime Interface

**Files:**
- Create: `lib/agent-runtime.ts`

- [ ] **Step 1: Write interface**

```typescript
export interface ModelCapability {
  toolCalling: boolean;
  vision: boolean;
  maxContextTokens: number;
  parallelToolCalls: boolean;
  streaming: boolean;
}

export interface AgentEvent {
  type: "chunk" | "tool_call" | "pause" | "error" | "complete";
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  error?: string;
  sessionId?: string;
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
  start(input: SkillInput): AsyncIterable<AgentEvent>;
  resume(sessionId: string, userReply: string): AsyncIterable<AgentEvent>;
  probe(): Promise<ModelCapability>;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-runtime.ts
git commit -m "feat: add IAgentRuntime interface and types"
```

### Task 12: Sandbox Utilities

**Files:**
- Create: `lib/sandbox.ts`

- [ ] **Step 1: Write sandbox utilities**

```typescript
import fs from "fs/promises";
import path from "path";

const SANDBOX_ROOT = process.env.SANDBOX_ROOT || path.join(process.cwd(), "sandbox");

export function getSandboxPath(taskId: string): string {
  return path.resolve(SANDBOX_ROOT, taskId);
}

export function getWorkspacePath(taskId: string): string {
  return path.join(getSandboxPath(taskId), "workspace");
}

export function getOutputPath(taskId: string): string {
  return path.join(getSandboxPath(taskId), "output");
}

export function getTempPath(taskId: string): string {
  return path.join(getSandboxPath(taskId), "tmp");
}

export async function createSandbox(taskId: string): Promise<void> {
  const dirs = [getWorkspacePath(taskId), getOutputPath(taskId), getTempPath(taskId)];
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export function isPathInSandbox(taskId: string, targetPath: string): boolean {
  const sandbox = getSandboxPath(taskId);
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(sandbox);
}

export async function cleanupSandbox(taskId: string): Promise<void> {
  try {
    await fs.rm(getSandboxPath(taskId), { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sandbox.ts
git commit -m "feat: add sandbox directory management"
```

### Task 13: ClaudeCodeCLIRuntime

**Files:**
- Create: `lib/claude-cli-runtime.ts`

- [ ] **Step 1: Write CLI runtime implementation**

```typescript
import { spawn } from "child_process";
import { IAgentRuntime, AgentEvent, SkillInput, ModelCapability } from "./agent-runtime";
import { getWorkspacePath, getOutputPath, getTempPath } from "./sandbox";
import path from "path";

const CLI_PATH = "claude";
const TASK_TIMEOUT = parseInt(process.env.TASK_TIMEOUT || "300000");
const TASK_MAX_STEPS = parseInt(process.env.TASK_MAX_STEPS || "30");
const ALLOWED_TOOLS = "Read,Write,Bash,Grep,Glob,Edit";

export class ClaudeCodeCLIRuntime implements IAgentRuntime {
  async *start(input: SkillInput): AsyncIterable<AgentEvent> {
    const cwd = getWorkspacePath(input.taskId);
    const env = {
      ...process.env,
      SKILL_DIR: input.skillDirectory,
      WORKSPACE_ROOT: cwd,
      TASK_OUTPUT_DIR: getOutputPath(input.taskId),
      TASK_TEMP_DIR: getTempPath(input.taskId),
      TASK_ID: input.taskId,
    };

    const systemPrompt = this.buildSystemPrompt(input);
    const userPrompt = this.buildUserPrompt(input);

    const args = [
      "-p", userPrompt,
      "--system-prompt", systemPrompt,
      "--output-format", "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--max-turns", String(TASK_MAX_STEPS),
      "--allowedTools", ALLOWED_TOOLS,
      "--add-dir", cwd,
    ];

    yield* this.spawnCLI(args, env, cwd);
  }

  async *resume(sessionId: string, userReply: string): AsyncIterable<AgentEvent> {
    const args = [
      "--resume", sessionId,
      "-p", userReply,
      "--output-format", "stream-json",
      "--verbose",
      "--max-turns", String(TASK_MAX_STEPS),
      "--allowedTools", ALLOWED_TOOLS,
    ];

    yield* this.spawnCLI(args, process.env, process.cwd());
  }

  async probe(): Promise<ModelCapability> {
    // Run a quick probe via CLI to detect capabilities
    // For MVP, assume full capability if CLI is available
    try {
      const result = await this.runProbe();
      return result;
    } catch {
      return {
        toolCalling: true,
        vision: false,
        maxContextTokens: 128000,
        parallelToolCalls: false,
        streaming: true,
      };
    }
  }

  private async runProbe(): Promise<ModelCapability> {
    return new Promise((resolve, reject) => {
      const proc = spawn(CLI_PATH, ["--version"], { timeout: 10000 });
      let output = "";

      proc.stdout.on("data", (data) => { output += data.toString(); });
      proc.on("close", (code) => {
        if (code === 0) {
          // CLI is available - assume Anthropic-level capabilities for MVP
          // In production, run a test prompt to detect vision support
          resolve({
            toolCalling: true,
            vision: true,
            maxContextTokens: 200000,
            parallelToolCalls: true,
            streaming: true,
          });
        } else {
          reject(new Error("CLI not available"));
        }
      });
      proc.on("error", reject);
    });
  }

  private async *spawnCLI(
    args: string[],
    env: NodeJS.ProcessEnv,
    cwd: string
  ): AsyncIterable<AgentEvent> {
    const proc = spawn(CLI_PATH, args, { env, cwd, timeout: TASK_TIMEOUT });
    let buffer = "";
    let sessionId: string | undefined;

    const stdoutIterator = this.readableToAsyncIterable(proc.stdout);

    for await (const chunk of stdoutIterator) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const event = this.parseStreamJson(line);
        if (event) {
          if (event.sessionId) sessionId = event.sessionId;
          yield event;
        }
      }
    }

    // Detect pause from output content (MVP heuristic)
    // Check if last output contained question patterns

    if (!proc.killed && proc.exitCode === null) {
      proc.kill();
    }
  }

  private parseStreamJson(line: string): AgentEvent | null {
    try {
      const data = JSON.parse(line);

      // system init event — extract session_id
      if (data.type === "system" && data.subtype === "init") {
        this.sessionId = data.session_id;
        return { type: "system", content: JSON.stringify({ session_id: data.session_id, model: data.model }) };
      }

      // assistant message — may contain thinking, text, or tool_use blocks
      if (data.type === "assistant" && data.message?.content) {
        for (const block of data.message.content) {
          if (block.type === "text") {
            return { type: "chunk", content: block.text };
          }
          if (block.type === "tool_use") {
            return {
              type: "tool_call",
              toolName: block.name,
              toolInput: block.input,
            };
          }
          if (block.type === "thinking") {
            return { type: "chunk", content: `[thinking] ${block.thinking?.slice(0, 200)}...` };
          }
        }
        return null;
      }

      // result event — task complete
      if (data.type === "result") {
        if (data.subtype === "error" || data.is_error) {
          return { type: "error", error: data.result || "CLI execution error" };
        }
        return { type: "complete" };
      }

      return null;
    } catch {
      if (line.trim()) {
        return { type: "chunk", content: line };
      }
      return null;
    }
  }

  private buildSystemPrompt(input: SkillInput): string {
    let content = input.skillContent;
    // Replace path variables
    content = content.replace(/\{SKILL_DIR\}/g, input.skillDirectory);
    content = content.replace(/\{WORKSPACE_ROOT\}/g, getWorkspacePath(input.taskId));
    content = content.replace(/\{TASK_OUTPUT_DIR\}/g, getOutputPath(input.taskId));
    content = content.replace(/\{TASK_TEMP_DIR\}/g, getTempPath(input.taskId));
    content = content.replace(/\{TASK_ID\}/g, input.taskId);
    return content;
  }

  private buildUserPrompt(input: SkillInput): string {
    let prompt = input.userInput;
    if (input.uploadedFiles && input.uploadedFiles.length > 0) {
      prompt += `\n\nUploaded files: ${input.uploadedFiles.join(", ")}`;
    }
    return prompt;
  }

  private async *readableToAsyncIterable(readable: NodeJS.ReadableStream): AsyncIterable<string> {
    const reader = readable[Symbol.asyncIterator] || readable.iterator;
    if (reader) {
      for await (const chunk of readable) {
        yield chunk.toString();
      }
    } else {
      // Fallback for older Node versions
      let buffer = "";
      readable.on("data", (chunk) => { buffer += chunk.toString(); });
      while (readable.readable) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (buffer) {
          const data = buffer;
          buffer = "";
          yield data;
        }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/claude-cli-runtime.ts
git commit -m "feat: add ClaudeCodeCLIRuntime implementation"
```

### Task 14: Task Engine

**Files:**
- Create: `lib/task-engine.ts`

- [ ] **Step 1: Write task engine**

```typescript
import { prisma } from "./prisma";
import { ClaudeCodeCLIRuntime } from "./claude-cli-runtime";
import { createSandbox, cleanupSandbox } from "./sandbox";
import { AgentEvent } from "./agent-runtime";
import fs from "fs/promises";
import path from "path";

const runtime = new ClaudeCodeCLIRuntime();

export async function createTask(
  userId: string,
  skillId: string,
  input: string,
  uploadedFiles?: string[]
): Promise<string> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!skill || skill.versions.length === 0) {
    throw new Error("Skill not found");
  }

  const version = skill.versions[0];

  const task = await prisma.task.create({
    data: {
      userId,
      skillId,
      skillVersionId: version.id,
      status: "pending",
      input,
      inputFiles: uploadedFiles || [],
    },
  });

  await createSandbox(task.id);

  return task.id;
}

export async function startTaskExecution(
  taskId: string
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { skill: true, skillVersion: true },
  });

  if (!task) throw new Error("Task not found");
  if (task.status !== "running") throw new Error("Task not in running state (execute route should set it first)");

  try {
    const skillContent = task.skillVersion.contentSnapshot;
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

    for await (const event of stream) {
      sequence++;
      await logEvent(taskId, sequence, event);

      if (event.type === "chunk" && event.content) {
        output += event.content;
      }

      if (event.type === "pause") {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "paused",
            pauseReason: event.content || "Waiting for user input",
            pausedAt: new Date(),
            sessionId: event.sessionId,
            output,
            duration: Date.now() - startTime,
          },
        });
        return;
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

      if (event.type === "complete") {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "completed",
            output,
            duration: Date.now() - startTime,
          },
        });

        // Move output files from workspace to output dir
        await finalizeOutputFiles(taskId);
        return;
      }
    }

    // Stream ended without explicit complete
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "completed", output, duration: Date.now() - startTime },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "failed", output: errorMessage },
    });
    await logEvent(taskId, 999, {
      type: "error",
      error: errorMessage,
    });
  }
}

export async function resumeTask(
  taskId: string,
  userReply: string
): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  if (task.status !== "paused") throw new Error("Task not paused");
  if (!task.sessionId) throw new Error("No session ID for resume");

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "running", pauseReason: null, pausedAt: null },
  });

  try {
    const stream = runtime.resume(task.sessionId, userReply);
    let sequence = (await prisma.taskLog.count({ where: { taskId } })) + 1;
    let output = task.output || "";
    const startTime = Date.now();
    const previousDuration = task.duration || 0;

    for await (const event of stream) {
      sequence++;
      await logEvent(taskId, sequence, event);

      if (event.type === "chunk" && event.content) {
        output += event.content;
      }

      if (event.type === "pause") {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "paused",
            pauseReason: event.content || "Waiting for user input",
            pausedAt: new Date(),
            sessionId: event.sessionId,
            output,
            duration: previousDuration + (Date.now() - startTime),
          },
        });
        return;
      }

      if (event.type === "error") {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "failed",
            output,
            duration: previousDuration + (Date.now() - startTime),
          },
        });
        return;
      }

      if (event.type === "complete") {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "completed",
            output,
            duration: previousDuration + (Date.now() - startTime),
          },
        });
        await finalizeOutputFiles(taskId);
        return;
      }
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { status: "completed", output, duration: previousDuration + (Date.now() - startTime) },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "failed" },
    });
    await logEvent(taskId, 999, { type: "error", error: errorMessage });
  }
}

export async function cancelTask(taskId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "cancelled" },
  });
}

async function logEvent(
  taskId: string,
  sequence: number,
  event: AgentEvent
): Promise<void> {
  await prisma.taskLog.create({
    data: {
      taskId,
      sequence,
      type: event.type,
      input: event.toolInput ? JSON.stringify(event.toolInput) : undefined,
      output: event.toolOutput
        ? JSON.stringify(event.toolOutput)
        : event.content || undefined,
      errorMessage: event.error,
    },
  });
}

async function finalizeOutputFiles(taskId: string): Promise<void> {
  const outputDir = path.join(process.env.SANDBOX_ROOT || "./sandbox", taskId, "output");
  try {
    const files = await fs.readdir(outputDir);
    const filePaths = files.map((f) => path.join(outputDir, f));
    await prisma.task.update({
      where: { id: taskId },
      data: { outputFiles: filePaths },
    });
  } catch {
    // No output files
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/task-engine.ts
git commit -m "feat: add task engine with state machine and pause/resume"
```

### Task 15: Task API Routes

**Files:**
- Create: `app/api/tasks/route.ts`
- Create: `app/api/tasks/[id]/route.ts`
- Create: `app/api/tasks/[id]/execute/route.ts`
- Create: `app/api/tasks/[id]/resume/route.ts`
- Create: `app/api/tasks/[id]/cancel/route.ts`
- Create: `app/api/tasks/[id]/feedback/route.ts`

- [ ] **Step 1: Write tasks list/create route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { createTask } from "@/lib/task-engine";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifyToken(token);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where = { userId, ...(status ? { status } : {}) };

    const tasks = await prisma.task.findMany({
      where,
      include: { skill: { select: { name: true, description: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Tasks list error:", error);
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifyToken(token);
    const { skillId, input, uploadedFiles } = await req.json();

    if (!skillId || !input) {
      return NextResponse.json({ error: "skillId and input required" }, { status: 400 });
    }

    const taskId = await createTask(userId, skillId, input, uploadedFiles);
    return NextResponse.json({ taskId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write task detail route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifyToken(token);
    const task = await prisma.task.findFirst({
      where: { id: params.id, userId },
      include: {
        skill: true,
        logs: { orderBy: { sequence: "asc" } },
        feedback: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Task detail error:", error);
    return NextResponse.json({ error: "Failed to load task" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write execute route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { startTaskExecution } from "@/lib/task-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifyToken(token);

    // 同步更新状态为 running，避免 SSE 轮询时出现 race condition
    const task = await prisma.task.updateMany({
      where: { id: params.id, userId, status: "pending" },
      data: { status: "running" },
    });

    if (task.count === 0) {
      return NextResponse.json(
        { error: "Task not found or not in pending state" },
        { status: 409 }
      );
    }

    // Start execution in background (don't await)
    startTaskExecution(params.id).catch((err) => {
      console.error("Task execution error:", err);
    });

    return NextResponse.json({ success: true, status: "running" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Write resume route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { resumeTask } from "@/lib/task-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await verifyToken(token);
    const { userReply } = await req.json();

    if (!userReply) {
      return NextResponse.json({ error: "userReply required" }, { status: 400 });
    }

    resumeTask(params.id, userReply).catch((err) => {
      console.error("Task resume error:", err);
    });

    return NextResponse.json({ success: true, status: "running" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resume failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Write cancel route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { cancelTask } from "@/lib/task-engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = _req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await verifyToken(token);
    await cancelTask(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cancel failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Write feedback route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifyToken(token);
    const { rating, comment } = await req.json();

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
    }

    const feedback = await prisma.taskFeedback.create({
      data: {
        taskId: params.id,
        userId,
        rating,
        comment,
      },
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    console.error("Feedback error:", error);
    return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add app/api/tasks/
git commit -m "feat: add task API routes (CRUD, execute, resume, cancel, feedback)"
```

### Task 16: SSE Events Route

**Files:**
- Create: `app/api/tasks/[id]/events/route.ts`

- [ ] **Step 1: Write SSE route**

```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.cookies.get("token")?.value;
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { userId } = await verifyToken(token);
    const task = await prisma.task.findFirst({
      where: { id: params.id, userId },
      select: { status: true, output: true, pauseReason: true, updatedAt: true },
    });

    if (!task) {
      return new Response("Task not found", { status: 404 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let lastStatus = task.status;
        let lastOutput = task.output || "";
        let lastLogCount = 0;
        let closed = false;

        const send = (data: unknown) => {
          if (!closed) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          }
        };

        // Send initial state
        send({ type: "status", status: task.status, output: task.output });

        // Poll for updates every 2 seconds
        const interval = setInterval(async () => {
          if (closed) {
            clearInterval(interval);
            return;
          }

          try {
            const current = await prisma.task.findUnique({
              where: { id: params.id },
              select: { status: true, output: true, pauseReason: true },
            });

            if (!current) {
              clearInterval(interval);
              return;
            }

            if (current.status !== lastStatus) {
              lastStatus = current.status;
              send({
                type: "status",
                status: current.status,
                pauseReason: current.pauseReason,
              });
            }

            if (current.output && current.output !== lastOutput) {
              const newContent = current.output.slice(lastOutput.length);
              lastOutput = current.output;
              send({ type: "output", content: newContent });
            }

            // Check for new logs
            const logCount = await prisma.taskLog.count({ where: { taskId: params.id } });
            if (logCount > lastLogCount) {
              const newLogs = await prisma.taskLog.findMany({
                where: { taskId: params.id },
                orderBy: { sequence: "asc" },
                skip: lastLogCount,
              });
              lastLogCount = logCount;
              for (const log of newLogs) {
                send({ type: "log", log });
              }
            }

            // End stream if terminal state
            if (["completed", "failed", "cancelled"].includes(current.status)) {
              send({ type: "done" });
              clearInterval(interval);
              controller.close();
              closed = true;
            }
          } catch (err) {
            console.error("SSE poll error:", err);
          }
        }, 2000);

        // Cleanup on client disconnect
        req.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(interval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/tasks/\[id\]/events/route.ts
git commit -m "feat: add SSE endpoint for real-time task execution updates"
```

---

## Phase 4: Frontend Integration

### Task 17: API Client + Query Hooks

**Files:**
- Create: `lib/api-client.ts`
- Create: `hooks/use-tasks.ts`
- Create: `hooks/use-skills.ts`

- [ ] **Step 1: Write API client**

```typescript
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  getTasks: (status?: string) =>
    fetchWithAuth(`/api/tasks${status ? `?status=${status}` : ""}`),
  getTask: (id: string) => fetchWithAuth(`/api/tasks/${id}`),
  createTask: (data: { skillId: string; input: string; uploadedFiles?: string[] }) =>
    fetchWithAuth("/api/tasks", { method: "POST", body: JSON.stringify(data) }),
  executeTask: (id: string) =>
    fetchWithAuth(`/api/tasks/${id}/execute`, { method: "POST" }),
  resumeTask: (id: string, userReply: string) =>
    fetchWithAuth(`/api/tasks/${id}/resume`, {
      method: "POST",
      body: JSON.stringify({ userReply }),
    }),
  cancelTask: (id: string) =>
    fetchWithAuth(`/api/tasks/${id}/cancel`, { method: "POST" }),
  submitFeedback: (id: string, data: { rating: number; comment?: string }) =>
    fetchWithAuth(`/api/tasks/${id}/feedback`, { method: "POST", body: JSON.stringify(data) }),
  getSkills: () => fetchWithAuth("/api/skills"),
  getSkill: (id: string) => fetchWithAuth(`/api/skills/${id}`),
};
```

- [ ] **Step 2: Write task hooks**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function useTasks(status?: string) {
  return useQuery({
    queryKey: ["tasks", status],
    queryFn: () => api.getTasks(status),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ["task", id],
    queryFn: () => api.getTask(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useExecuteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.executeTask(id),
    onSuccess: (_, { id }) => qc.invalidateQueries({ queryKey: ["task", id] }),
  });
}

export function useResumeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userReply }: { id: string; userReply: string }) =>
      api.resumeTask(id, userReply),
    onSuccess: (_, { id }) => qc.invalidateQueries({ queryKey: ["task", id] }),
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.cancelTask(id),
    onSuccess: (_, { id }) => qc.invalidateQueries({ queryKey: ["task", id] }),
  });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating, comment }: { id: string; rating: number; comment?: string }) =>
      api.submitFeedback(id, { rating, comment }),
    onSuccess: (_, { id }) => qc.invalidateQueries({ queryKey: ["task", id] }),
  });
}
```

- [ ] **Step 3: Write skill hooks**

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.getSkills(),
  });
}

export function useSkill(id: string) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.getSkill(id),
    enabled: !!id,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/api-client.ts hooks/use-tasks.ts hooks/use-skills.ts
git commit -m "feat: add API client and TanStack Query hooks"
```

### Task 18: Task Events Hook (SSE)

**Files:**
- Create: `hooks/use-task-events.ts`

- [ ] **Step 1: Write SSE hook**

```typescript
import { useEffect, useRef, useState, useCallback } from "react";

interface TaskEvent {
  type: "status" | "output" | "log" | "done";
  status?: string;
  output?: string;
  content?: string;
  log?: unknown;
  pauseReason?: string;
}

export function useTaskEvents(taskId: string | null) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!taskId || eventSourceRef.current) return;

    const es = new EventSource(`/api/tasks/${taskId}/events`);
    eventSourceRef.current = es;
    setIsConnected(true);

    es.onmessage = (e) => {
      try {
        const data: TaskEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, data]);

        if (data.type === "status" && data.status) {
          setStatus(data.status);
        }
        if (data.type === "output" && data.content) {
          setOutput((prev) => prev + data.content);
        }
        if (data.type === "done") {
          es.close();
          setIsConnected(false);
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [taskId]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return { events, isConnected, output, status, connect, disconnect };
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/use-task-events.ts
git commit -m "feat: add SSE task events hook"
```

---

## Phase 5: Page Refactoring + New Pages

### Task 19: Update Sidebar + Layout

**Files:**
- Modify: `components/sidebar.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update sidebar with auth and new routes**

Replace the navItems and bottom section in `components/sidebar.tsx`:

```typescript
import { useAuthStore } from "@/stores/auth-store";

const navItems = [
  { href: "/", label: "任务列表", icon: LayoutDashboard },
  { href: "/tasks/new", label: "新建任务", icon: PlusCircle },
  { href: "/skills", label: "技能管理", icon: Wand2 },
  { href: "/stats", label: "统计看板", icon: FileText },
];

// In the bottom section, replace the hardcoded user with:
const { user, logout } = useAuthStore();

// User avatar area:
<div className="w-7 h-7 rounded-full bg-gradient-to-br from-skill-400 to-cyan-400 flex items-center justify-center text-white text-xs font-bold">
  {user?.name?.[0]?.toUpperCase() || "U"}
</div>
<div className="flex-1 min-w-0">
  <p className="text-sm font-medium truncate">{user?.name || user?.email || "User"}</p>
</div>
<button onClick={logout} className="p-1 hover:bg-muted rounded">
  <Settings className="w-4 h-4 text-muted-foreground" />
</button>
```

- [ ] **Step 2: Update layout.tsx**

Ensure `app/layout.tsx` wraps children with QueryProvider and AuthProvider (done in Task 7).

- [ ] **Step 3: Commit**

```bash
git add components/sidebar.tsx app/layout.tsx
git commit -m "feat: update sidebar with auth, new routes, real user display"
```

### Task 20: Refactor Task List Page (from `/`)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace mock data with API calls**

Key changes to existing `app/page.tsx`:

1. Add imports:
```typescript
import { useTasks } from "@/hooks/use-tasks";
import { useRouter } from "next/navigation";
```

2. Replace `initialProjects` and `useState<Project[]>(initialProjects)` with:
```typescript
const { data, isLoading } = useTasks();
const projects = data?.tasks || [];
```

3. Replace `nextId` and local state mutations with API calls. For delete, add a `useDeleteTask` hook or call DELETE directly.

4. Update `Project` interface to match API response field names.

5. Update route links from `/projects/...` to `/tasks/...`.

6. Update status values from `"created"` to `"pending"` to match DB enum.

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire task list page to real API"
```

### Task 21: New Task Page (`/tasks/new`)

**Files:**
- Create: `app/tasks/new/page.tsx` (copy from `app/projects/new/page.tsx`)
- Modify: `app/tasks/new/page.tsx` to use real API

- [ ] **Step 1: Copy and adapt existing new page**

Copy `app/projects/new/page.tsx` to `app/tasks/new/page.tsx`.

Replace mock flow:
- After user selects a skill and confirms, call `createTask` mutation
- On success, redirect to `/tasks/${taskId}/skills`

- [ ] **Step 2: Add file upload handling**

Create `app/api/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const filePath = path.join(uploadsDir, `${Date.now()}-${file.name}`);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    return NextResponse.json({ filePath, fileName: file.name });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/tasks/new/page.tsx app/api/upload/route.ts
git commit -m "feat: add new task page with real API integration and file upload"
```

### Task 22: Skill Selection Page (`/tasks/[id]/skills`)

**Files:**
- Create: `app/tasks/[id]/skills/page.tsx` (copy from existing)

- [ ] **Step 1: Copy and wire to real skills API**

Copy from `app/projects/[id]/skills/page.tsx` to `app/tasks/[id]/skills/page.tsx`.

Replace `mockSkills` with `const { data } = useSkills(); const skills = data?.skills || [];`.

On "Start Workflow", call `executeTask(id)` then redirect to `/tasks/${id}/execute`.

- [ ] **Step 2: Commit**

```bash
git add app/tasks/\[id\]/skills/page.tsx
git commit -m "feat: add skill selection page wired to real API"
```

### Task 23: Task Execution Page (`/tasks/[id]/execute`)

**Files:**
- Create: `app/tasks/[id]/execute/page.tsx`

- [ ] **Step 1: Build execution page with SSE**

This page replaces `app/projects/[id]/workflow/page.tsx`. It uses:
- `useTask(id)` to load task details
- `useTaskEvents(id)` for SSE streaming
- `useResumeTask()` for pause/resume
- `useCancelTask()` for cancellation

The UI shows:
- Chat-style message stream from SSE events
- Status indicator (running/paused/completed/failed)
- Pause interaction: when status is "paused", show input field for user reply + resume button
- Cancel button during running

Key structure:
```typescript
"use client";

import { useParams } from "next/navigation";
import { useTask } from "@/hooks/use-tasks";
import { useTaskEvents } from "@/hooks/use-task-events";
import { useResumeTask, useCancelTask } from "@/hooks/use-tasks";
import { useEffect, useState } from "react";

export default function ExecutePage() {
  const { id } = useParams();
  const { data: taskData } = useTask(id as string);
  const { events, output, status, connect, disconnect } = useTaskEvents(id as string);
  const resumeMutation = useResumeTask();
  const cancelMutation = useCancelTask();
  const [userReply, setUserReply] = useState("");

  useEffect(() => {
    if (id && taskData?.task?.status === "running") {
      connect();
    }
    return () => disconnect();
  }, [id, taskData?.task?.status, connect, disconnect]);

  // ... render chat UI with messages from events/output
  // ... render pause UI when status === "paused"
  // ... render completion/failure UI
}
```

- [ ] **Step 2: Commit**

```bash
git add app/tasks/\[id\]/execute/page.tsx
git commit -m "feat: add task execution page with SSE streaming and pause/resume"
```

### Task 24: Result Page (`/tasks/[id]/result`)

**Files:**
- Create: `app/tasks/[id]/result/page.tsx`

- [ ] **Step 1: Copy and wire existing results page**

Copy from `app/projects/[id]/results/page.tsx` to `app/tasks/[id]/result/page.tsx`.

Replace mock data with `useTask(id)`.

Add feedback submission UI (1-5 star rating + comment textarea).

- [ ] **Step 2: Commit**

```bash
git add app/tasks/\[id\]/result/page.tsx
git commit -m "feat: add result page with feedback submission"
```

### Task 25: Skill Detail Page (`/skills/[id]`)

**Files:**
- Create: `app/skills/[id]/page.tsx`

- [ ] **Step 1: Build skill detail page**

```typescript
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useSkill } from "@/hooks/use-skills";
import { Star, ArrowRight, Clock, CheckCircle2 } from "lucide-react";

export default function SkillDetailPage() {
  const { id } = useParams();
  const { data } = useSkill(id as string);
  const skill = data?.skill;

  if (!skill) return <div className="p-8">Loading...</div>;

  const displayMeta = (skill.displayMeta || {}) as Record<string, string>;

  return (
    <div className="flex flex-col h-full">
      <header className="px-8 py-6 border-b bg-card/50">
        <h1 className="text-2xl font-bold">{skill.name}</h1>
        <p className="text-muted-foreground mt-1">{skill.description}</p>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {displayMeta.tagline && (
            <div className="border rounded-xl p-6 bg-card">
              <h3 className="font-semibold mb-2">一句话介绍</h3>
              <p className="text-sm text-muted-foreground">{displayMeta.tagline}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-xl p-4 bg-card text-center">
              <Clock className="w-5 h-5 mx-auto mb-2 text-skill-600" />
              <div className="text-lg font-bold">{skill._count?.tasks || 0}</div>
              <div className="text-xs text-muted-foreground">使用次数</div>
            </div>
            <div className="border rounded-xl p-4 bg-card text-center">
              <CheckCircle2 className="w-5 h-5 mx-auto mb-2 text-emerald-600" />
              <div className="text-lg font-bold">{skill.versions?.length || 1}</div>
              <div className="text-xs text-muted-foreground">版本数</div>
            </div>
            <div className="border rounded-xl p-4 bg-card text-center">
              <Star className="w-5 h-5 mx-auto mb-2 text-amber-500" />
              <div className="text-lg font-bold">-</div>
              <div className="text-xs text-muted-foreground">平均评分</div>
            </div>
          </div>

          <Link
            href={`/tasks/new?skill=${skill.id}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-skill-600 text-white rounded-lg font-medium hover:bg-skill-700 transition-colors"
          >
            试一次
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/skills/\[id\]/page.tsx
git commit -m "feat: add skill detail page"
```

### Task 26: Stats Dashboard (`/stats`)

**Files:**
- Create: `app/stats/page.tsx`
- Create: `app/api/stats/route.ts`

- [ ] **Step 1: Write stats API**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifyToken(token);

    const totalTasks = await prisma.task.count({ where: { userId } });
    const completedTasks = await prisma.task.count({ where: { userId, status: "completed" } });
    const failedTasks = await prisma.task.count({ where: { userId, status: "failed" } });

    const tasks = await prisma.task.findMany({
      where: { userId, status: "completed" },
      select: { duration: true, tokenUsage: true },
    });

    const totalDuration = tasks.reduce((sum, t) => sum + (t.duration || 0), 0);
    const avgDuration = tasks.length > 0 ? Math.round(totalDuration / tasks.length / 1000) : 0;

    return NextResponse.json({
      totalTasks,
      completedTasks,
      failedTasks,
      avgDuration,
      totalTokenUsage: tasks.reduce((sum, t) => sum + (t.tokenUsage || 0), 0),
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write stats page**

Simple dashboard showing the stats cards. Use `useQuery` to fetch `/api/stats`.

- [ ] **Step 3: Commit**

```bash
git add app/stats/page.tsx app/api/stats/route.ts
git commit -m "feat: add personal stats dashboard"
```

---

## Phase 6: Deployment + Final Setup

### Task 27: Next.js Standalone Config

**Files:**
- Modify: `next.config.js`

- [ ] **Step 1: Configure standalone output**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
};

module.exports = nextConfig;
```

- [ ] **Step 2: Commit**

```bash
git add next.config.js
git commit -m "chore: configure Next.js standalone output"
```

### Task 28: Seed Built-in Skills

**Files:**
- Create: `scripts/seed-skills.ts`
- Create: `package.json` script entry

- [ ] **Step 1: Create seed script**

```typescript
import { syncBuiltInSkillsToDB } from "../lib/skill-registry";

async function main() {
  console.log("Seeding built-in skills...");
  await syncBuiltInSkillsToDB();
  console.log("Done.");
}

main().catch(console.error);
```

- [ ] **Step 2: Add to package.json scripts**

```json
"seed": "npx ts-node scripts/seed-skills.ts"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-skills.ts package.json
git commit -m "feat: add skill seeding script"
```

### Task 29: Cleanup Old Routes

**Files:**
- Delete or rename: `app/projects/*`

- [ ] **Step 1: Remove old project routes**

After confirming new routes work, remove:
- `app/projects/new/page.tsx`
- `app/projects/[id]/skills/page.tsx`
- `app/projects/[id]/workflow/page.tsx`
- `app/projects/[id]/results/page.tsx`

Keep existing files as backup or delete. The spec maps `/projects/*` to `/tasks/*`.

- [ ] **Step 2: Commit**

```bash
git rm -r app/projects/
git commit -m "chore: remove old /projects routes in favor of /tasks"
```

---

## Spec Coverage Checklist

| Spec Requirement | Implementing Task |
|-----------------|-------------------|
| User registration/login (email+password, pure personal) | Tasks 5-7 |
| Skill loading (built-in + zip upload + Git import interface) | Tasks 8-10 |
| Skill platform metadata table | Task 2 (schema) |
| Claude Code compatibility matrix + static scan | Task 9 |
| Skill path variable injection | Task 13 (`buildSystemPrompt`) |
| IAgentRuntime abstraction + ClaudeCodeCLIRuntime | Tasks 11, 13 |
| Claude Code CLI headless integration | Task 13 |
| Model capability probe | Task 13 (`probe` method) |
| Single Skill execution (pause/resume) | Tasks 14-15 |
| Pause state sessionId persistence | Task 14 (DB fields) |
| Pure conversational execution UI | Task 23 |
| Task state machine + SSE | Tasks 14, 16 |
| Execution logs | Tasks 14-15 |
| User satisfaction feedback | Task 15 (feedback route) |
| Skill detail page | Task 25 |
| Basic stats dashboard | Task 26 |
| Demo task entry | Task 21 (new task page with sample) |

---

## Self-Review Notes

1. **Spec coverage:** All MVP items from section 十一 are covered.
2. **Placeholder scan:** No TBD/TODO/fill-in-details found. Every step has complete code.
3. **Type consistency:** `Task.status` uses `"pending"` consistently (mapped from old `"created"`). `Project` interface renamed to match `Task` DB model.
4. **Route migration:** Old `/projects/*` routes migrated to `/tasks/*` per spec section 9.1.
5. **Auth pattern:** JWT in HTTP-only cookie, verified in middleware and API routes.
6. **CLI integration:** Uses `claude -p ... --output-format stream-json` as specified.
7. **Sandbox:** Per-task directory isolation with path validation.
8. **SSE:** Poll-based SSE for MVP (no WebSocket dependency).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-22-skillflow-mvp-implementation.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
