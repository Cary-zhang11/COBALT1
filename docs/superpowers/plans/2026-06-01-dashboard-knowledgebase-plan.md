# 数据看板 & 知识库管理 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数据看板和知识库管理两个模块从 mock 数据改造为对接真实数据，包括新增 Task 列、Knowledge 模型、聚合 API 和前端渲染。

**Architecture:** DB 层加列 + 加表；解析层新增 dimensionCoverage 提取；API 层新增 stats/knowledge 端点；前端去 mock 接真实数据。沿用现有 Prisma + Next.js Route Handler + @tanstack/react-query 技术栈。

**Tech Stack:** Next.js 14 (App Router), Prisma (PostgreSQL), recharts, react-markdown, Vitest

---

## 文件结构

```
prisma/
├── schema.prisma                      ← 修改：Task 加 4 列 + Knowledge 模型
├── migrations/                        ← 新增 migration
lib/
├── task-engine.ts                     ← 修改：saveOutputAndReport 赋值逻辑
├── parse-testcase-md.ts               ← 修改：新增 parseDimensionCoverage
scripts/
├── migrate-task-columns.ts            ← 新增：存量数据迁移
app/api/
├── stats/route.ts                     ← 新增：看板聚合
├── knowledge/
│   ├── route.ts                       ← 新增：业务知识 CRUD
│   ├── [id]/route.ts                  ← 新增：单条知识 PUT/DELETE
│   └── history/route.ts               ← 新增：历史用例列表
components/usecase-gen/
├── dashboard.tsx                      ← 修改：去 mock
├── knowledge-base.tsx                 ← 修改：去 mock，2 tab
```

---

### Task 1: Prisma Schema 迁移

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 在 Task 模型中新增 4 列**

在 `model Task` 的 `duration` 下方添加：

```prisma
  totalCases        Int?
  qualityScore      Int?
  category          String?
  dimensionCoverage Json?
```

- [ ] **Step 2: 新增 Knowledge 模型**

在 schema 文件末尾添加：

```prisma
model Knowledge {
  id        String    @id @default(uuid())
  title     String
  content   String    @db.Text
  tags      String[]  @default([])
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  refCount  Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}
```

- [ ] **Step 3: 生成并运行 migration**

```bash
cd d:/qorder_workspace/Cobalt && npx prisma migrate dev --name add_dashboard_columns_and_knowledge
```

Expected: Prisma 生成 migration SQL 并应用到数据库。

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add totalCases/qualityScore/category/dimensionCoverage to Task, add Knowledge model"
```

---

### Task 2: parseDimensionCoverage 解析

**Files:**
- Modify: `lib/parse-testcase-md.ts`

- [ ] **Step 1: 新增类型和函数**

在 `ParseResult` 接口前添加：

```typescript
export interface DimensionCoverage {
  name: string;
  code: string;
  covered: boolean;
  caseCount: number;
}
```

在 `ParseResult` 接口中添加 `dimensions` 字段：

```typescript
export interface ParseResult {
  tree: UsecaseModule[] | null;
  summary: ParseSummary;
  meta: ParseMeta;
  dimensions: DimensionCoverage[];
}
```

- [ ] **Step 2: 实现 parseDimensionCoverage**

在 `parseSummarySection` 函数后面添加：

```typescript
function parseDimensionCoverage(markdown: string): DimensionCoverage[] {
  const section = extractSectionByKeyword(markdown, "维度覆盖检查");
  if (!section) return [];

  const results: DimensionCoverage[] = [];
  // Match lines like: - 主流程（D1）：是，12个，已覆盖
  const lineRegex = /^-\s+(.+?)（(D\d+)）[：:]\s*(是|否)，?(\d+)?个/gm;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(section)) !== null) {
    const name = match[1].trim();
    const code = match[2];
    const covered = match[3] === "是";
    const caseCount = match[4] ? parseInt(match[4], 10) : 0;
    results.push({ name, code, covered, caseCount });
  }

  return results;
}
```

- [ ] **Step 3: 在 parseTestcaseMarkdown 中调用**

在 `parseTestcaseMarkdown` 函数末尾的 return 语句中添加 `dimensions`：

```typescript
return {
  tree: tree.length > 0 ? tree : null,
  summary,
  meta,
  dimensions: parseDimensionCoverage(markdown),
};
```

- [ ] **Step 4: 运行测试验证**

```bash
cd d:/qorder_workspace/Cobalt && npx vitest run
```

Expected: all tests pass (ParseResult 接口变更可能影响已有测试，检查并更新)。

- [ ] **Step 5: Commit**

```bash
git add lib/parse-testcase-md.ts
git commit -m "feat: add parseDimensionCoverage extraction from report section"
```

---

### Task 3: saveOutputAndReport 赋值逻辑

**Files:**
- Modify: `lib/task-engine.ts`

- [ ] **Step 1: 添加 import**

在文件顶部添加：

```typescript
import type { DimensionCoverage } from "./parse-testcase-md";
```

- [ ] **Step 2: 重写 saveOutputAndReport**

Replace the current function with:

```typescript
export async function saveOutputAndReport(taskId: string): Promise<void> {
  const outputDir = getOutputPath(taskId);
  try {
    const files = await collectFilesRelative(outputDir);
    const updates: Record<string, unknown> = { outputFiles: files };

    const mdPath = await findLatestMdFile(outputDir);
    if (mdPath) {
      const mdContent = await fs.readFile(mdPath, "utf-8");
      const parsed = parseTestcaseMarkdown(mdContent);
      updates.report = {
        tree: parsed.tree,
        summary: parsed.summary,
        meta: parsed.meta,
        dimensions: parsed.dimensions,
      };

      // First-time generation — write stats columns
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { totalCases: true, category: true },
      });

      if (task && task.totalCases === null) {
        updates.totalCases = parsed.summary.totalCases;
        updates.qualityScore = parsed.summary.qualityScore;
        updates.dimensionCoverage = parsed.dimensions as unknown as Prisma.InputJsonValue;
      }
    }

    await prisma.task.update({
      where: { id: taskId },
      data: updates as Prisma.TaskUpdateInput,
    });
  } catch {
    // No output files
  }
}
```

注意：需要 import `Prisma` from `@prisma/client`（如果尚未 import）。

- [ ] **Step 3: 检查 task-engine.ts 中 duration 赋值**

验证 `duration` 在状态更新时已正确保存（应已在之前的 commit 中处理）：三处 `duration: Date.now() - startTime` 在 task status update 中已存在。

- [ ] **Step 4: Commit**

```bash
git add lib/task-engine.ts
git commit -m "feat: write totalCases/qualityScore/dimensionCoverage on first generation only"
```

---

### Task 4: 存量数据迁移脚本

**Files:**
- Create: `scripts/migrate-task-columns.ts`

- [ ] **Step 1: 创建迁移脚本**

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrate() {
  console.log("Starting migration: backfill totalCases and qualityScore...");

  // Find all tasks with report but null totalCases
  const tasks = await prisma.task.findMany({
    where: {
      totalCases: null,
      report: { not: null },
    },
    select: { id: true, report: true },
  });

  let updated = 0;
  for (const task of tasks) {
    const report = task.report as Record<string, unknown> | null;
    const summary = report?.summary as Record<string, unknown> | undefined;
    if (!summary) continue;

    const totalCases = typeof summary.totalCases === "number" ? summary.totalCases : null;
    const qualityScore = typeof summary.qualityScore === "number" ? summary.qualityScore : null;

    const dimensions = (report?.dimensions as Record<string, unknown>[]) || null;

    await prisma.task.update({
      where: { id: task.id },
      data: {
        totalCases,
        qualityScore,
        dimensionCoverage: dimensions as unknown[],
      },
    });
    updated++;
  }

  console.log(`Migration complete: ${updated} tasks updated.`);
}

migrate()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: 运行迁移脚本**

```bash
cd d:/qorder_workspace/Cobalt && npx tsx scripts/migrate-task-columns.ts
```

Expected: 输出 `Migration complete: N tasks updated.`

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-task-columns.ts
git commit -m "feat: add one-time migration script to backfill task stats columns"
```

---

### Task 5: `GET /api/stats` 看板聚合 API

**Files:**
- Create: `app/api/stats/route.ts`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p d:/qorder_workspace/Cobalt/app/api/stats
```

- [ ] **Step 2: 创建路由文件**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const completedFilter = {
      status: { in: ["completed", "paused"] },
    };

    // KPI
    const [totalAgg, avgAgg] = await Promise.all([
      prisma.task.aggregate({
        _sum: { totalCases: true },
        where: completedFilter,
      }),
      prisma.task.aggregate({
        _avg: { qualityScore: true, duration: true, tokenUsage: true },
        where: completedFilter,
      }),
    ]);

    // Monthly active users
    const mauResult = await prisma.task.groupBy({
      by: ["userId"],
      where: { ...completedFilter, createdAt: { gte: monthAgo } },
    });

    // Daily trend (last 30 days)
    const dailyTasks = await prisma.task.findMany({
      where: { ...completedFilter, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, qualityScore: true },
      orderBy: { createdAt: "asc" },
    });
    const dailyMap = new Map<string, { count: number; scores: number[] }>();
    for (const t of dailyTasks) {
      const date = t.createdAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(date) || { count: 0, scores: [] };
      entry.count++;
      if (t.qualityScore != null) entry.scores.push(t.qualityScore);
      dailyMap.set(date, entry);
    }
    const dailyTrend = Array.from(dailyMap.entries()).map(([date, v]) => ({
      date,
      count: v.count,
      avgScore: v.scores.length > 0
        ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length)
        : 0,
    }));

    // Category distribution
    const categoryResult = await prisma.task.groupBy({
      by: ["category"],
      where: completedFilter,
      _count: true,
    });
    const categoryDistribution = categoryResult.map((r) => ({
      category: r.category || "未分类",
      count: r._count,
    }));

    // Dimension coverage
    const tasksWithDimensions = await prisma.task.findMany({
      where: { ...completedFilter, dimensionCoverage: { not: null } },
      select: { dimensionCoverage: true },
    });
    const dimMap = new Map<string, { covered: number; total: number }>();
    for (const t of tasksWithDimensions) {
      const dims = t.dimensionCoverage as Array<{ name: string; covered: boolean }> | null;
      if (!dims) continue;
      for (const d of dims) {
        const entry = dimMap.get(d.name) || { covered: 0, total: 0 };
        entry.total++;
        if (d.covered) entry.covered++;
        dimMap.set(d.name, entry);
      }
    }
    const dimensionCoverage = Array.from(dimMap.entries()).map(([name, v]) => ({
      name,
      covered: v.covered,
      total: v.total,
    }));

    // Top users
    const userResult = await prisma.task.groupBy({
      by: ["userId"],
      where: completedFilter,
      _count: true,
      orderBy: { _count: { userId: "desc" } },
      take: 10,
    });
    const userIds = userResult.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name || u.id]));
    const topUsers = userResult.map((r) => ({
      userName: userMap.get(r.userId) || r.userId,
      count: r._count,
    }));

    // Efficiency
    const totalCompleted = await prisma.task.count({ where: completedFilter });
    const editedCount = await prisma.task.count({
      where: { ...completedFilter, tweakCount: { gt: 0 } },
    });

    // Recent records
    const recent = await prisma.task.findMany({
      where: completedFilter,
      select: {
        createdAt: true,
        input: true,
        totalCases: true,
        qualityScore: true,
        tokenUsage: true,
        category: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      kpi: {
        totalCases: totalAgg._sum.totalCases || 0,
        monthlyActiveUsers: mauResult.length,
        avgQualityScore: Math.round(avgAgg._avg.qualityScore || 0),
        avgDuration: Math.round(avgAgg._avg.duration || 0),
      },
      dailyTrend,
      categoryDistribution,
      dimensionCoverage,
      topUsers,
      efficiency: {
        avgScore: Math.round(avgAgg._avg.qualityScore || 0),
        avgDuration: Math.round(avgAgg._avg.duration || 0),
        avgTokens: Math.round(avgAgg._avg.tokenUsage || 0),
        editRate: totalCompleted > 0 ? Math.round((editedCount / totalCompleted) * 100) / 100 : 0,
      },
      recentRecords: recent.map((r) => ({
        time: r.createdAt.toLocaleDateString("zh-CN"),
        user: r.user?.name || "未知",
        req: (r.input || "").slice(0, 60),
        count: r.totalCases || 0,
        score: r.qualityScore || 0,
        tokens: r.tokenUsage || 0,
        category: r.category || "未分类",
      })),
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/stats/route.ts
git commit -m "feat: add GET /api/stats — dashboard aggregation from Task table"
```

---

### Task 6: 业务知识 CRUD API

**Files:**
- Create: `app/api/knowledge/route.ts`
- Create: `app/api/knowledge/[id]/route.ts`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p d:/qorder_workspace/Cobalt/app/api/knowledge/\[id\]
```

- [ ] **Step 2: `GET/POST /api/knowledge/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const search = req.nextUrl.searchParams.get("search") || "";
    const tag = req.nextUrl.searchParams.get("tag") || "";
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
    const pageSize = 20;

    const where: Record<string, unknown> = {};
    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }
    if (tag) {
      where.tags = { has: tag };
    }

    const [items, total] = await Promise.all([
      prisma.knowledge.findMany({
        where,
        select: {
          id: true,
          title: true,
          tags: true,
          refCount: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.knowledge.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, pageSize });
  } catch (error) {
    console.error("Knowledge list error:", error);
    return NextResponse.json({ error: "Failed to load knowledge" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    const body = await req.json();
    const { title, content, tags } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
    }

    const knowledge = await prisma.knowledge.create({
      data: {
        title,
        content,
        tags: tags || [],
        userId,
      },
    });

    return NextResponse.json(knowledge, { status: 201 });
  } catch (error) {
    console.error("Knowledge create error:", error);
    return NextResponse.json({ error: "Failed to create knowledge" }, { status: 500 });
  }
}
```

- [ ] **Step 3: `PUT/DELETE /api/knowledge/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const knowledge = await prisma.knowledge.findUnique({
      where: { id: params.id },
      include: { user: { select: { name: true } } },
    });

    if (!knowledge) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(knowledge);
  } catch (error) {
    console.error("Knowledge get error:", error);
    return NextResponse.json({ error: "Failed to load knowledge" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const body = await req.json();
    const { title, content, tags } = body;

    const knowledge = await prisma.knowledge.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(tags !== undefined && { tags }),
      },
    });

    return NextResponse.json(knowledge);
  } catch (error) {
    console.error("Knowledge update error:", error);
    return NextResponse.json({ error: "Failed to update knowledge" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    await prisma.knowledge.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Knowledge delete error:", error);
    return NextResponse.json({ error: "Failed to delete knowledge" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/knowledge/
git commit -m "feat: add knowledge CRUD API — GET/POST/PUT/DELETE /api/knowledge"
```

---

### Task 7: `GET /api/knowledge/history` 历史用例 API

**Files:**
- Create: `app/api/knowledge/history/route.ts`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p d:/qorder_workspace/Cobalt/app/api/knowledge/history
```

- [ ] **Step 2: 创建路由文件**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const search = req.nextUrl.searchParams.get("search") || "";
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
    const pageSize = 20;

    const where: Record<string, unknown> = {
      status: { in: ["completed", "paused"] },
      report: { not: null },
    };
    if (search) {
      where.input = { contains: search, mode: "insensitive" };
    }

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          id: true,
          input: true,
          createdAt: true,
          totalCases: true,
          qualityScore: true,
          report: true,
          outputFiles: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({
      items: items.map((t) => {
        const report = t.report as Record<string, unknown> | null;
        const summary = report?.summary as Record<string, unknown> | undefined;
        return {
          id: t.id,
          req: (t.input || "").slice(0, 60),
          createdAt: t.createdAt.toLocaleDateString("zh-CN"),
          totalCases: t.totalCases || 0,
          qualityScore: t.qualityScore || 0,
          modules: summary?.modules as number || 0,
          userName: t.user?.name || "未知",
          mdFileName: (t.outputFiles as string[] | null)?.find((f: string) => f.endsWith(".md") && f.includes("测试用例")) || "",
        };
      }),
      total,
    });
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/knowledge/history/route.ts
git commit -m "feat: add GET /api/knowledge/history — completed tasks as historical cases"
```

---

### Task 8: 数据看板前端

**Files:**
- Modify: `components/usecase-gen/dashboard.tsx`

- [ ] **Step 1: 重写 Dashboard 组件**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, TrendingUp, Users, Target, Clock, Loader2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer, Legend,
} from "recharts";

interface StatsData {
  kpi: {
    totalCases: number;
    monthlyActiveUsers: number;
    avgQualityScore: number;
    avgDuration: number;
  };
  dailyTrend: { date: string; count: number; avgScore: number }[];
  categoryDistribution: { category: string; count: number }[];
  dimensionCoverage: { name: string; covered: number; total: number }[];
  topUsers: { userName: string; count: number }[];
  efficiency: {
    avgScore: number;
    avgDuration: number;
    avgTokens: number;
    editRate: number;
  };
  recentRecords: {
    time: string;
    user: string;
    req: string;
    count: number;
    score: number;
    tokens: number;
    category: string;
  }[];
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function formatDuration(ms: number): string {
  return (ms / 60000).toFixed(1) + " 分钟";
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        数据加载失败
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "累计用例数", value: data.kpi.totalCases.toLocaleString(), icon: BarChart3, color: "text-primary", bg: "bg-primary/10" },
          { label: "月活跃用户", value: data.kpi.monthlyActiveUsers.toString(), icon: Users, color: "text-emerald-600", bg: "bg-emerald-100" },
          { label: "平均质量分", value: data.kpi.avgQualityScore.toString(), icon: Target, color: "text-amber-600", bg: "bg-amber-100" },
          { label: "平均耗时", value: formatDuration(data.kpi.avgDuration), icon: Clock, color: "text-violet-600", bg: "bg-violet-100" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} className="bg-card rounded-xl shadow-sm p-5 flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                <p className={`text-3xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.bg}`}>
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="col-span-2 bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">每日生成量 &amp; 质量分趋势</h4>
          <ResponsiveContainer width="100%" height={176}>
            <LineChart data={data.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line yAxisId="left" type="monotone" dataKey="count" stroke="#3b82f6" name="生成量" />
              <Line yAxisId="right" type="monotone" dataKey="avgScore" stroke="#10b981" name="质量分" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">需求类型分布</h4>
          <ResponsiveContainer width="100%" height={176}>
            <PieChart>
              <Pie data={data.categoryDistribution} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={60} label={({ category }) => category}>
                {data.categoryDistribution.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">覆盖维度分布</h4>
          <ResponsiveContainer width="100%" height={176}>
            <PieChart>
              <Pie data={data.dimensionCoverage} dataKey="covered" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name }) => name.slice(0, 4)}>
                {data.dimensionCoverage.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="col-span-2 bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">人员使用 Top 10</h4>
          <ResponsiveContainer width="100%" height={176}>
            <BarChart data={data.topUsers} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="userName" width={80} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" name="生成数" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Efficiency */}
      <div className="bg-card rounded-xl shadow-sm p-5 mb-4 border-l-4 border-cyan-400">
        <h4 className="font-semibold text-sm mb-3">生成效率统计</h4>
        <div className="grid grid-cols-4 gap-4 text-center">
          {[
            { v: data.efficiency.avgScore.toString(), l: "平均质量分" },
            { v: formatDuration(data.efficiency.avgDuration), l: "平均耗时" },
            { v: data.efficiency.avgTokens.toLocaleString(), l: "平均 Token" },
            { v: Math.round(data.efficiency.editRate * 100) + "%", l: "用例编辑率" },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-xl font-bold text-cyan-600">{s.v}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="bg-card rounded-xl shadow-sm p-5">
        <h4 className="font-semibold text-sm mb-4">最近生成记录</h4>
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-2 pr-3 text-muted-foreground font-medium">时间</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">用户</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">需求名</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">用例数</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">质量分</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">Token</th>
              <th className="pb-2 text-muted-foreground font-medium">类型</th>
            </tr>
          </thead>
          <tbody>
            {data.recentRecords.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted">
                <td className="py-2.5 pr-3 text-muted-foreground">{row.time}</td>
                <td className="py-2.5 pr-3">{row.user}</td>
                <td className="py-2.5 pr-3 max-w-32 truncate">{row.req}</td>
                <td className="py-2.5 pr-3 font-medium">{row.count}</td>
                <td className="py-2.5 pr-3">
                  <span className={`px-1.5 py-0.5 rounded ${row.score >= 90 ? "text-green-600 bg-green-50" : row.score >= 60 ? "text-amber-600 bg-amber-50" : "text-red-500 bg-red-50"}`}>
                    {row.score}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">{row.tokens.toLocaleString()}</td>
                <td className="py-2.5">{row.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/dashboard.tsx
git commit -m "feat: replace mock data with real stats API in dashboard, add recharts, remove scheme column"
```

---

### Task 9: 知识库管理前端

**Files:**
- Modify: `components/usecase-gen/knowledge-base.tsx`

- [ ] **Step 1: 重写 KnowledgeBase 组件**

```typescript
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Loader2, Trash2, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { FilePreviewModal } from "./shared/file-preview";

interface KnowledgeItem {
  id: string;
  title: string;
  tags: string[];
  refCount: number;
  updatedAt: string;
  user?: { name: string };
}

interface HistoryItem {
  id: string;
  req: string;
  createdAt: string;
  totalCases: number;
  qualityScore: number;
  modules: number;
  userName: string;
  mdFileName: string;
}

const TABS = ["业务知识", "历史用例"];

export function KnowledgeBase() {
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const queryClient = useQueryClient();

  // Business knowledge query
  const { data: kbData, isLoading: kbLoading } = useQuery<{ items: KnowledgeItem[]; total: number }>({
    queryKey: ["knowledge", search, selectedTag],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedTag) params.set("tag", selectedTag);
      return fetch(`/api/knowledge?${params}`).then((r) => r.json());
    },
    enabled: tab === 0,
  });

  // History query
  const { data: historyData, isLoading: historyLoading } = useQuery<{ items: HistoryItem[]; total: number }>({
    queryKey: ["knowledge-history", search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      return fetch(`/api/knowledge/history?${params}`).then((r) => r.json());
    },
    enabled: tab === 1,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (body: { title: string; content: string; tags: string[] }) =>
      fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      setShowAddModal(false);
      setNewTitle("");
      setNewContent("");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
  });

  const ALL_TAGS = ["认证", "支付", "订单", "商品", "通用", "冒烟", "安全", "性能"];

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Tab bar */}
      <div className="bg-card rounded-xl shadow-sm p-1 flex gap-1 mb-4 w-fit">
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Left sidebar */}
        <div className="w-48 flex-shrink-0 space-y-3">
          <div className="bg-card rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">搜索</p>
            <input
              type="text"
              placeholder="关键词..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {tab === 0 && (
            <div className="bg-card rounded-xl shadow-sm p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">标签筛选</p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tag"
                    checked={selectedTag === ""}
                    onChange={() => setSelectedTag("")}
                    className="accent-cyan-500 w-3 h-3"
                  />
                  <span className="text-xs">全部</span>
                </label>
                {ALL_TAGS.map((tag) => (
                  <label key={tag} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="tag"
                      checked={selectedTag === tag}
                      onChange={() => setSelectedTag(tag)}
                      className="accent-cyan-500 w-3 h-3"
                    />
                    <span className="text-xs">{tag}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {tab === 0 && (
            <div>
              {kbLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <>
                  <div className="space-y-2">
                    {(kbData?.items || []).map((item) => (
                      <div key={item.id} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.title}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                            </span>
                            {item.tags.map((tag, ti) => (
                              <button
                                key={ti}
                                onClick={() => setSelectedTag(tag)}
                                className="text-xs bg-muted text-muted-foreground px-1.5 rounded hover:text-foreground transition-colors"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="text-center flex-shrink-0">
                          <p className="text-lg font-bold text-cyan-500">{item.refCount}</p>
                          <p className="text-xs text-muted-foreground">引用次数</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/knowledge/${item.id}`);
                                const data = await res.json();
                                setPreviewTitle(data.title);
                                setPreviewContent(data.content);
                                setPreviewTaskId(null);
                              } catch { /* ignore */ }
                            }}
                            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30"
                          >
                            预览
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(item.id)}
                            className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-4 w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:border-cyan-500 hover:text-cyan-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />添加新条目
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 1 && (
            <div>
              {historyLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {(historyData?.items || []).map((item) => (
                    <div key={item.id} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Eye className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.req}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{item.createdAt}</span>
                          <span>{item.userName}</span>
                          <span>{item.totalCases} 用例</span>
                          <span>质量分 {item.qualityScore}</span>
                          <span>{item.modules} 模块</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setPreviewContent(item.mdFileName);
                          setPreviewTitle("");
                          setPreviewTaskId(item.id);
                        }}
                        className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30"
                      >
                        预览
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <h3 className="font-semibold text-lg mb-4">添加业务知识</h3>
            <input
              type="text"
              placeholder="标题"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <textarea
              placeholder="Markdown 内容..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={10}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60">取消</button>
              <button
                onClick={() => createMutation.mutate({ title: newTitle, content: newContent, tags: [] })}
                disabled={!newTitle || !newContent || createMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-40"
              >
                {createMutation.isPending ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Knowledge content preview (inline modal) */}
      {previewContent !== null && !previewTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) { setPreviewContent(null); } }}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-sm truncate pr-4">{previewTitle}</h3>
              <button onClick={() => setPreviewContent(null)} className="p-1 rounded-lg hover:bg-muted">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{previewContent}</ReactMarkdown>
              </div>
            </div>
            <div className="flex justify-end px-6 py-3 border-t">
              <button onClick={() => setPreviewContent(null)} className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* History file preview */}
      <FilePreviewModal
        open={previewContent !== null && previewTaskId !== null}
        onClose={() => { setPreviewContent(null); setPreviewTaskId(null); }}
        fileName={previewContent || ""}
        taskId={previewTaskId}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/knowledge-base.tsx
git commit -m "feat: replace mock data with real API in knowledge base — 2 tabs, CRUD, history"
```

---

### Task 10: 测试与验证

- [ ] **Step 1: 运行全量测试**

```bash
cd d:/qorder_workspace/Cobalt && npx vitest run
```
Expected: all tests pass

- [ ] **Step 2: Prisma generate 验证 schema**

```bash
cd d:/qorder_workspace/Cobalt && npx prisma generate
```
Expected: no errors

- [ ] **Step 3: TypeScript 编译检查**

```bash
cd d:/qorder_workspace/Cobalt && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: only pre-existing project errors, no new errors from our changes

- [ ] **Step 4: Commit any fixes**

---

## 改动文件汇总

| # | 文件 | 类型 |
|---|------|------|
| 1 | `prisma/schema.prisma` | 修改 (4 列 + 1 模型) |
| 2 | `lib/parse-testcase-md.ts` | 修改 (+parseDimensionCoverage) |
| 3 | `lib/task-engine.ts` | 修改 (+首次生成赋值) |
| 4 | `scripts/migrate-task-columns.ts` | 新增 (一次性迁移) |
| 5 | `app/api/stats/route.ts` | 新增 (看板聚合) |
| 6 | `app/api/knowledge/route.ts` | 新增 (知识 CRUD) |
| 7 | `app/api/knowledge/[id]/route.ts` | 新增 (单条 CUD) |
| 8 | `app/api/knowledge/history/route.ts` | 新增 (历史用例) |
| 9 | `components/usecase-gen/dashboard.tsx` | 修改 (去 mock) |
| 10 | `components/usecase-gen/knowledge-base.tsx` | 修改 (去 mock) |
