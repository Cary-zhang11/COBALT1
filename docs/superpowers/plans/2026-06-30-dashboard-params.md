# 数据看板参数调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升级数据看板 KPI 指标体系，新增时间筛选功能，改造人员排行和最近记录模块。

**Architecture:** 后端 API (`/api/stats`) 新增 7 个 query 参数控制各区域时间范围，前端 `Dashboard` 组件持有所有筛选状态并传参给 `useQuery`，各图表区域接收独立筛选值。需求数统计通过 `inputFiles` 文件名去重实现。

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Prisma, recharts, @tanstack/react-query, vitest

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `lib/stats-time-range.ts` | 时间范围解析与日期计算工具函数 | 新建 |
| `app/api/stats/route.ts` | 后端统计 API，解析 query 参数、按范围查询 | 修改 |
| `components/usecase-gen/dashboard.tsx` | 看板前端组件，KPI 卡片、筛选器、图表 | 修改 |
| `components/usecase-gen/__tests__/dashboard.test.tsx` | 看板组件测试 | 修改 |

---

## Task 1: 创建时间范围工具函数

**Files:**
- Create: `lib/stats-time-range.ts`

- [ ] **Step 1: 创建 `lib/stats-time-range.ts`**

```typescript
// KPI 时间范围类型
export type KpiRange = "all" | "week" | "month" | "30d";

// 图表时间范围类型
export type ChartRange = "all" | "7d" | "30d" | "90d";

// 允许的图表范围选项（不同图表可选范围不同）
const FULL_CHART_OPTIONS: ChartRange[] = ["all", "7d", "30d", "90d"];
const SHORT_CHART_OPTIONS: ChartRange[] = ["all", "7d", "30d"];

// KPI 时间窗口
export interface KpiDateWindow {
  currentStart: Date;
  previousStart: Date;
  previousEnd: Date;
}

// KPI 标签映射
export const KPI_LABELS: Record<KpiRange, string> = {
  all: "全部",
  week: "本周",
  month: "本月",
  "30d": "近30天",
};

// KPI 同比标签映射
export const KPI_TREND_LABELS: Record<KpiRange, string> = {
  all: "",
  week: "周同比",
  month: "月同比",
  "30d": "30天同比",
};

// KPI 本期/上期文字
export const KPI_PERIOD_LABELS: Record<Exclude<KpiRange, "all">, { current: string; previous: string }> = {
  week: { current: "本周", previous: "上周" },
  month: { current: "本月", previous: "上月" },
  "30d": { current: "近30天", previous: "前30天" },
};

// 图表标签映射
export const CHART_LABELS: Record<ChartRange, string> = {
  all: "全部",
  "7d": "近7天",
  "30d": "近30天",
  "90d": "近90天",
};

/** 解析 KPI 范围参数 */
export function parseKpiRange(value: string | null): KpiRange {
  if (value === "all" || value === "week" || value === "month" || value === "30d") return value;
  return "week";
}

/** 解析图表范围参数 */
export function parseChartRange(
  value: string | null,
  allowed: ChartRange[] = FULL_CHART_OPTIONS,
): ChartRange {
  if (allowed.includes(value as ChartRange)) return value as ChartRange;
  return "30d";
}

/** 短范围选项（仅 all/7d/30d） */
export function shortChartOptions(): ChartRange[] {
  return SHORT_CHART_OPTIONS;
}

/** 获取 KPI 时间窗口（currentStart 到 now, previousStart 到 previousEnd） */
export function getKpiDateWindow(range: KpiRange): KpiDateWindow | null {
  if (range === "all") return null;
  const now = Date.now();
  const days = range === "week" ? 7 : 30; // month 和 30d 均为 30 天滚动窗口
  const dayMs = 24 * 60 * 60 * 1000;
  return {
    currentStart: new Date(now - days * dayMs),
    previousStart: new Date(now - 2 * days * dayMs),
    previousEnd: new Date(now - days * dayMs),
  };
}

/** 获取图表起始日期（null 表示不过滤） */
export function getChartStartDate(range: ChartRange): Date | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** 从 inputFiles 提取需求标识 */
export function extractReqIdentifier(taskId: string, inputFiles: string[]): string {
  if (inputFiles && inputFiles.length > 0) {
    const fullPath = inputFiles[0];
    const fileName = fullPath.split("/").pop()?.split("\\").pop() || fullPath;
    return fileName.replace(/^\d+-/, "");
  }
  return `__no_file__:${taskId}`;
}

/** 计算同比百分比 */
export function calcChangePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit lib/stats-time-range.ts`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add lib/stats-time-range.ts
git commit -m "feat: add stats time range helper utility"
```

---

## Task 2: 后端 — 解析 query 参数 + 重构 KPI 查询

**Files:**
- Modify: `app/api/stats/route.ts`

- [ ] **Step 1: 添加 import 并解析 query 参数**

在 `app/api/stats/route.ts` 顶部添加 import：

```typescript
import {
  type KpiRange,
  type ChartRange,
  parseKpiRange,
  parseChartRange,
  getKpiDateWindow,
  getChartStartDate,
  extractReqIdentifier,
  calcChangePercent,
  shortChartOptions,
} from "@/lib/stats-time-range";
```

在 `GET` 函数体内，`await getAuthUser(token);` 之后、`const monthAgo` 之前，替换原有时间变量定义为参数解析：

```typescript
    // 解析 query 参数
    const { searchParams } = new URL(req.url);
    const kpiRange = parseKpiRange(searchParams.get("kpiRange"));
    const trendRange = parseChartRange(searchParams.get("trendRange"));
    const categoryRange = parseChartRange(searchParams.get("categoryRange"), shortChartOptions());
    const dimensionRange = parseChartRange(searchParams.get("dimensionRange"), shortChartOptions());
    const ratingRange = parseChartRange(searchParams.get("ratingRange"), shortChartOptions());
    const userRange = parseChartRange(searchParams.get("userRange"), shortChartOptions());
    const recordRange = parseChartRange(searchParams.get("recordRange"));

    const completedFilter = {
      status: { in: ["completed", "paused"] },
    };

    // KPI 时间窗口
    const kpiWindow = getKpiDateWindow(kpiRange);
    const kpiTimeFilter = kpiWindow
      ? { ...completedFilter, createdAt: { gte: kpiWindow.currentStart } }
      : completedFilter;
```

删除原来的 `const monthAgo` 和 `const thirtyDaysAgo` 定义（它们将被上述参数替代）。

- [ ] **Step 2: 重构 KPI 查询**

将原来的 KPI 查询块（`// KPI` 到 `// Monthly active users` 结束）替换为：

```typescript
    // KPI（使用 kpiRange 过滤）
    const [totalAgg, avgAgg, taskCount] = await Promise.all([
      prisma.task.aggregate({
        _sum: { totalCases: true },
        where: kpiTimeFilter,
      }),
      prisma.task.aggregate({
        _avg: { duration: true },
        where: kpiTimeFilter,
      }),
      prisma.task.count({ where: kpiTimeFilter }),
    ]);

    // 周活跃用户（使用 kpiRange）
    const wauResult = await prisma.task.groupBy({
      by: ["userId"],
      where: kpiTimeFilter,
    });

    // 需求数（按文件名去重）
    const reqTasks = await prisma.task.findMany({
      where: kpiTimeFilter,
      select: { id: true, inputFiles: true },
    });
    const reqIdentifiers = new Set<string>();
    for (const task of reqTasks) {
      reqIdentifiers.add(extractReqIdentifier(task.id, task.inputFiles));
    }
    const requirementCount = reqIdentifiers.size;
```

- [ ] **Step 3: 重构 Daily Trend（使用 trendRange）**

将 `// Daily trend (last 30 days)` 块替换为：

```typescript
    // Daily trend（使用 trendRange）
    const trendStart = getChartStartDate(trendRange);
    const dailyTasks = await prisma.task.findMany({
      where: { ...completedFilter, ...(trendStart ? { createdAt: { gte: trendStart } } : {}) },
      select: { createdAt: true, qualityScore: true },
      orderBy: { createdAt: "asc" },
    });
```

- [ ] **Step 4: 重构 Category Distribution（使用 categoryRange）**

找到 `// Category distribution` 块，将其中的 `where: completedFilter` 改为按 categoryRange 过滤：

```typescript
    // Category distribution（使用 categoryRange）
    const categoryStart = getChartStartDate(categoryRange);
    const categoryTasks = await prisma.task.groupBy({
      by: ["category"],
      where: { ...completedFilter, ...(categoryStart ? { createdAt: { gte: categoryStart } } : {}) },
      _count: true,
    });
```

- [ ] **Step 5: 重构 Dimension Coverage（使用 dimensionRange）**

找到 dimension coverage 查询，将 `where: completedFilter` 改为按 dimensionRange 过滤：

```typescript
    const dimensionStart = getChartStartDate(dimensionRange);
    const dimTasks = await prisma.task.findMany({
      where: { ...completedFilter, ...(dimensionStart ? { createdAt: { gte: dimensionStart } } : {}) },
      select: { dimensions: true },
    });
```

- [ ] **Step 6: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误（kpiTrend 部分尚未修改，暂时会有类型不匹配，先忽略）

- [ ] **Step 7: Commit**

```bash
git add app/api/stats/route.ts
git commit -m "feat: parse query params and refactor KPI/chart queries with time ranges"
```

---

## Task 3: 后端 — 重构 kpiTrend + 新增指标

**Files:**
- Modify: `app/api/stats/route.ts`

- [ ] **Step 1: 替换整个周同比计算块**

将 `// ---- 周同比计算 ----` 到 `kpiTrend` 对象结束（约 lines 161-284）替换为：

```typescript
    // ---- KPI 同比计算（使用 kpiRange） ----
    let kpiTrend: {
      totalCases: { current: number; previous: number; changePercent: number | null };
      weeklyActiveUsers: { current: number; previous: number; changePercent: number | null };
      avgDuration: { current: number; previous: number; changePercent: number | null };
      avgUserRating: { current: number; previous: number; changePercent: number | null };
      tasksPerWeek: { current: number; previous: number; changePercent: number | null };
      requirementsPerWeek: { current: number; previous: number; changePercent: number | null };
    };

    function avgRatingForTaskIds(taskIds: string[]): number {
      if (taskIds.length === 0) return 0;
      const ratings = taskIds
        .map((id) => latestByTask.get(id)?.rating)
        .filter((r): r is number => r != null);
      if (ratings.length === 0) return 0;
      return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    }

    if (kpiWindow) {
      // 有时间窗口：查询两窗口数据，内存计算
      const [currentTasks, previousTasks] = await Promise.all([
        prisma.task.findMany({
          where: { ...completedFilter, createdAt: { gte: kpiWindow.currentStart } },
          select: { id: true, totalCases: true, duration: true, userId: true, inputFiles: true },
        }),
        prisma.task.findMany({
          where: { ...completedFilter, createdAt: { gte: kpiWindow.previousStart, lt: kpiWindow.previousEnd } },
          select: { id: true, totalCases: true, duration: true, userId: true, inputFiles: true },
        }),
      ]);

      const thisCaseSum = currentTasks.reduce((s, t) => s + (t.totalCases || 0), 0);
      const lastCaseSum = previousTasks.reduce((s, t) => s + (t.totalCases || 0), 0);
      const thisUsers = new Set(currentTasks.map((t) => t.userId)).size;
      const lastUsers = new Set(previousTasks.map((t) => t.userId)).size;
      const thisDur = currentTasks.length > 0
        ? Math.round(currentTasks.reduce((s, t) => s + (t.duration || 0), 0) / currentTasks.length)
        : 0;
      const lastDur = previousTasks.length > 0
        ? Math.round(previousTasks.reduce((s, t) => s + (t.duration || 0), 0) / previousTasks.length)
        : 0;
      const thisTaskCount = currentTasks.length;
      const lastTaskCount = previousTasks.length;

      const thisReqIds = new Set(currentTasks.map((t) => extractReqIdentifier(t.id, t.inputFiles)));
      const lastReqIds = new Set(previousTasks.map((t) => extractReqIdentifier(t.id, t.inputFiles)));

      const thisRating = avgRatingForTaskIds(currentTasks.map((t) => t.id));
      const lastRating = avgRatingForTaskIds(previousTasks.map((t) => t.id));

      kpiTrend = {
        totalCases: { current: thisCaseSum, previous: lastCaseSum, changePercent: calcChangePercent(thisCaseSum, lastCaseSum) },
        weeklyActiveUsers: { current: thisUsers, previous: lastUsers, changePercent: calcChangePercent(thisUsers, lastUsers) },
        avgDuration: { current: thisDur, previous: lastDur, changePercent: calcChangePercent(thisDur, lastDur) },
        avgUserRating: { current: thisRating, previous: lastRating, changePercent: calcChangePercent(thisRating, lastRating) },
        tasksPerWeek: { current: thisTaskCount, previous: lastTaskCount, changePercent: calcChangePercent(thisTaskCount, lastTaskCount) },
        requirementsPerWeek: { current: thisReqIds.size, previous: lastReqIds.size, changePercent: calcChangePercent(thisReqIds.size, lastReqIds.size) },
      };
    } else {
      // all 模式：不计算同比
      kpiTrend = {
        totalCases: { current: 0, previous: 0, changePercent: null },
        weeklyActiveUsers: { current: 0, previous: 0, changePercent: null },
        avgDuration: { current: 0, previous: 0, changePercent: null },
        avgUserRating: { current: 0, previous: 0, changePercent: null },
        tasksPerWeek: { current: 0, previous: 0, changePercent: null },
        requirementsPerWeek: { current: 0, previous: 0, changePercent: null },
      };
    }
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add app/api/stats/route.ts
git commit -m "feat: refactor kpiTrend with kpiRange and add tasksPerWeek/requirementsPerWeek"
```

---

## Task 4: 后端 — 应用图表范围 + 移除 take:10 + recordRange

**Files:**
- Modify: `app/api/stats/route.ts`

- [ ] **Step 1: Top Users — 移除 take:10，应用 userRange**

将 `// Top users` 块替换为：

```typescript
    // Top users（使用 userRange，移除 take 限制）
    const userStart = getChartStartDate(userRange);
    const userResult = await prisma.task.groupBy({
      by: ["userId"],
      where: { ...completedFilter, ...(userStart ? { createdAt: { gte: userStart } } : {}) },
      _count: true,
      orderBy: { _count: { userId: "desc" } },
    });
```

- [ ] **Step 2: Rating Distribution — 应用 ratingRange**

在 `const allLatestRatings = ...` 之后，添加按 ratingRange 过滤的评价分布计算：

```typescript
    // 评价分布（使用 ratingRange）
    const ratingStart = getChartStartDate(ratingRange);
    let ratingRatings = allLatestRatings;
    if (ratingStart) {
      const ratingTaskIds = new Set(
        (await prisma.task.findMany({
          where: { ...completedFilter, createdAt: { gte: ratingStart } },
          select: { id: true },
        })).map((t) => t.id)
      );
      ratingRatings = Array.from(latestByTask.entries())
        .filter(([taskId]) => ratingTaskIds.has(taskId))
        .map(([, fb]) => fb.rating);
    }
    const ratingDist = ratingDistribution(ratingRatings);
```

- [ ] **Step 3: Recent Records — 应用 recordRange**

将 `const recent = await prisma.task.findMany({...})` 的 `where` 替换为：

```typescript
    // Recent records（使用 recordRange）
    const recordStart = getChartStartDate(recordRange);
    const recent = await prisma.task.findMany({
      where: { ...completedFilter, ...(recordStart ? { createdAt: { gte: recordStart } } : {}) },
      select: {
        id: true,
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
```

- [ ] **Step 4: 更新 KPI avgUserRating 值**

在 KPI 值的计算中，`avgUserRating` 需要使用 kpiRange 过滤后的 task IDs。在 `latestByTask` 定义之后、kpiTrend 计算之前，添加：

```typescript
    // KPI avgUserRating（使用 kpiRange 过滤）
    let kpiAvgRating: number;
    if (kpiWindow) {
      const kpiTaskIds = new Set(
        (await prisma.task.findMany({
          where: kpiTimeFilter,
          select: { id: true },
        })).map((t) => t.id)
      );
      const kpiRatings = Array.from(latestByTask.entries())
        .filter(([taskId]) => kpiTaskIds.has(taskId))
        .map(([, fb]) => fb.rating);
      kpiAvgRating = avgUserRating(kpiRatings);
    } else {
      kpiAvgRating = avgUserRating(allLatestRatings);
    }
```

注意：这段代码需要放在 `const latestByTask = latestFeedbackByTaskId(feedbackRows);` 和 `const allLatestRatings = ...` 之后。如果 kpiTrend 块中有重复的 `avgRatingForTaskIds` 函数定义，删除 kpiTrend 块中的那个，使用这里的 `kpiAvgRating` 变量。

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add app/api/stats/route.ts
git commit -m "feat: apply chart ranges, remove take:10, add recordRange filter"
```

---

## Task 5: 后端 — 更新响应结构

**Files:**
- Modify: `app/api/stats/route.ts`

- [ ] **Step 1: 更新 return JSON**

将 `return NextResponse.json({...})` 中的 `kpi` 对象替换为：

```typescript
      kpi: {
        totalCases: totalAgg._sum?.totalCases || 0,
        weeklyActiveUsers: wauResult.length,
        avgDuration: Math.round(avgAgg._avg?.duration || 0),
        avgUserRating: kpiAvgRating,
        tasksPerWeek: taskCount,
        requirementsPerWeek: requirementCount,
      },
```

将 `userRatingDistribution` 替换为使用 `ratingDist`：

```typescript
      userRatingDistribution: ratingDist,
```

确保 `kpiTrend` 已使用新的字段名（weeklyActiveUsers, tasksPerWeek, requirementsPerWeek），无 avgQualityScore。

- [ ] **Step 2: 删除遗留代码**

搜索并删除任何残留的 `avgQualityScore` 引用（如 `avgAgg._avg?.qualityScore`）。
删除旧的 `monthAgo`、`thirtyDaysAgo` 变量引用（如果还有）。
删除旧的 `thisWeekCases`、`lastWeekCases`、`thisWeekUsers`、`lastWeekUsers`、`thisWeekAvg`、`lastWeekAvg`、`thisWeekTaskRows`、`lastWeekTaskRows` 变量引用（如果还有）。
删除旧的 `avgRatingForWindow` 函数（如果还有）。

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 手动测试 API**

Run: `npx next dev` (如未启动)，然后：

```bash
curl.exe "http://localhost:3000/api/stats?kpiRange=week" | ConvertFrom-Json | Select-Object -ExpandProperty kpi
```
Expected: 返回包含 `weeklyActiveUsers`、`tasksPerWeek`、`requirementsPerWeek` 字段，无 `avgQualityScore`、`monthlyActiveUsers`。

- [ ] **Step 5: Commit**

```bash
git add app/api/stats/route.ts
git commit -m "feat: update API response structure with new KPI fields"
```

---

## Task 6: 前端 — 更新 StatsData 接口 + Dashboard 状态

**Files:**
- Modify: `components/usecase-gen/dashboard.tsx`

- [ ] **Step 1: 更新 StatsData 接口**

将 `StatsData` 接口中的 `kpi` 和 `kpiTrend` 替换为：

```typescript
interface StatsData {
  kpi: {
    totalCases: number;
    weeklyActiveUsers: number;
    avgDuration: number;
    avgUserRating: number;
    tasksPerWeek: number;
    requirementsPerWeek: number;
  };
  dailyTrend: { date: string; count: number; avgScore: number }[];
  categoryDistribution: { category: string; count: number }[];
  dimensionCoverage: { name: string; covered: number; total: number }[];
  topUsers: { userName: string; count: number }[];
  userRatingDistribution: { stars: number; count: number }[];
  userRatingRate: {
    percent: number;
    ratedCount: number;
    completedCount: number;
  };
  kpiTrend: {
    totalCases:         { current: number; previous: number; changePercent: number | null };
    weeklyActiveUsers:  { current: number; previous: number; changePercent: number | null };
    avgDuration:        { current: number; previous: number; changePercent: number | null };
    avgUserRating:      { current: number; previous: number; changePercent: number | null };
    tasksPerWeek:       { current: number; previous: number; changePercent: number | null };
    requirementsPerWeek:{ current: number; previous: number; changePercent: number | null };
  };
  recentRecords: {
    time: string;
    user: string;
    req: string;
    count: number;
    score: number;
    tokens: number;
    category: string;
    userRating: number | null;
    userComment: string | null;
  }[];
}
```

- [ ] **Step 2: 添加筛选类型 import 和状态**

在 `dashboard.tsx` 顶部添加 import：

```typescript
import type { KpiRange, ChartRange } from "@/lib/stats-time-range";
import { KPI_LABELS, KPI_TREND_LABELS, KPI_PERIOD_LABELS, CHART_LABELS, shortChartOptions } from "@/lib/stats-time-range";
```

- [ ] **Step 3: 修改 Dashboard 组件 — 添加筛选状态和参数化 useQuery**

将 `Dashboard` 组件替换为：

```typescript
export function Dashboard() {
  const [kpiRange, setKpiRange] = useState<KpiRange>("week");
  const [trendRange, setTrendRange] = useState<ChartRange>("30d");
  const [categoryRange, setCategoryRange] = useState<ChartRange>("30d");
  const [dimensionRange, setDimensionRange] = useState<ChartRange>("30d");
  const [ratingRange, setRatingRange] = useState<ChartRange>("30d");
  const [userRange, setUserRange] = useState<ChartRange>("30d");
  const [recordRange, setRecordRange] = useState<ChartRange>("30d");

  const params = new URLSearchParams({
    kpiRange,
    trendRange,
    categoryRange,
    dimensionRange,
    ratingRange,
    userRange,
    recordRange,
  });

  const { data, isLoading, error } = useQuery<StatsData>({
    queryKey: ["stats", kpiRange, trendRange, categoryRange, dimensionRange, ratingRange, userRange, recordRange],
    queryFn: () => fetch(`/api/stats?${params}`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  return (
    <div className="pb-16 min-h-0">
      <DashboardPageHeader />
      {isLoading ? (
        <div className={`${CHART_CARD} py-24 flex items-center justify-center`}>
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error || !data ? (
        <div className={`${CHART_CARD} py-24 flex items-center justify-center text-muted-foreground text-sm`}>
          数据加载失败
        </div>
      ) : (
        <DashboardBody
          data={data}
          kpiRange={kpiRange}
          setKpiRange={setKpiRange}
          trendRange={trendRange}
          setTrendRange={setTrendRange}
          categoryRange={categoryRange}
          setCategoryRange={setCategoryRange}
          dimensionRange={dimensionRange}
          setDimensionRange={setDimensionRange}
          ratingRange={ratingRange}
          setRatingRange={setRatingRange}
          userRange={userRange}
          setUserRange={setUserRange}
          recordRange={recordRange}
          setRecordRange={setRecordRange}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 修改 DashboardBody 签名 — 接收筛选 props**

将 `DashboardBody` 函数签名改为：

```typescript
interface DashboardBodyProps {
  data: StatsData;
  kpiRange: KpiRange;
  setKpiRange: (v: KpiRange) => void;
  trendRange: ChartRange;
  setTrendRange: (v: ChartRange) => void;
  categoryRange: ChartRange;
  setCategoryRange: (v: ChartRange) => void;
  dimensionRange: ChartRange;
  setDimensionRange: (v: ChartRange) => void;
  ratingRange: ChartRange;
  setRatingRange: (v: ChartRange) => void;
  userRange: ChartRange;
  setUserRange: (v: ChartRange) => void;
  recordRange: ChartRange;
  setRecordRange: (v: ChartRange) => void;
}

function DashboardBody({
  data,
  kpiRange, setKpiRange,
  trendRange, setTrendRange,
  categoryRange, setCategoryRange,
  dimensionRange, setDimensionRange,
  ratingRange, setRatingRange,
  userRange, setUserRange,
  recordRange, setRecordRange,
}: DashboardBodyProps) {
  const [recordSearch, setRecordSearch] = useState("");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("all");
  // ... 后续步骤会补充 KPI 卡片和筛选器代码
```

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit`
Expected: 可能有一些未使用的变量警告，但无错误

- [ ] **Step 6: Commit**

```bash
git add components/usecase-gen/dashboard.tsx
git commit -m "feat: update StatsData interface and Dashboard with filter state"
```

---

## Task 7: 前端 — KPI 卡片重构 + 时间筛选器

**Files:**
- Modify: `components/usecase-gen/dashboard.tsx`

- [ ] **Step 1: 添加 KPI 时间筛选器组件**

在 `DashboardBody` 之前添加：

```typescript
function KpiTimeFilter({ value, onChange }: { value: KpiRange; onChange: (v: KpiRange) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as KpiRange)}
      className="border border-border rounded px-2 py-1 text-xs bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {(Object.keys(KPI_LABELS) as KpiRange[]).map((k) => (
        <option key={k} value={k}>{KPI_LABELS[k]}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: 重构 KPI 卡片数组**

在 `DashboardBody` 内，将 `const kpis = [...]` 替换为：

```typescript
  const kpis = [
    { label: "用例数", value: data.kpi.totalCases.toLocaleString(), icon: BarChart3, bg: "bg-primary/10", iconColor: "text-primary", trendKey: "totalCases" as const },
    { label: "周活跃用户", value: data.kpi.weeklyActiveUsers.toString(), icon: Users, bg: "bg-emerald-100", iconColor: "text-emerald-600", trendKey: "weeklyActiveUsers" as const },
    { label: "平均耗时", value: formatDuration(data.kpi.avgDuration), icon: Clock, bg: "bg-violet-100", iconColor: "text-violet-600", trendKey: "avgDuration" as const },
    {
      label: "用户平均评分",
      value: data.kpi.avgUserRating > 0 ? data.kpi.avgUserRating.toFixed(1) : "—",
      icon: Star,
      bg: "bg-amber-50",
      iconColor: "text-amber-700",
      trendKey: "avgUserRating" as const,
    },
    { label: "任务数/周", value: data.kpi.tasksPerWeek.toString(), icon: BarChart3, bg: "bg-emerald-50", iconColor: "text-emerald-600", trendKey: "tasksPerWeek" as const },
    { label: "需求数/周", value: data.kpi.requirementsPerWeek.toString(), icon: BarChart3, bg: "bg-blue-50", iconColor: "text-blue-600", trendKey: "requirementsPerWeek" as const },
  ];
```

- [ ] **Step 3: 重构 KPI 卡片渲染区域**

将 KPI grid 区域（从 `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">` 到对应的 `</div>`）替换为：

```typescript
      <div className="flex justify-end mb-2">
        <KpiTimeFilter value={kpiRange} onChange={setKpiRange} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const trend = data.kpiTrend[kpi.trendKey];
          const showTrend = kpiRange !== "all" && trend.changePercent !== null;
          const isUp = (trend.changePercent ?? 0) > 0;
          const isDown = (trend.changePercent ?? 0) < 0;
          const colorClass = isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-muted-foreground";
          const arrow = isUp ? "↑" : isDown ? "↓" : "";
          const periodLabels = kpiRange !== "all" ? KPI_PERIOD_LABELS[kpiRange] : null;

          return (
            <div key={kpi.label} className={STAT_CARD}>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground mb-2">{kpi.label}</p>
                <p className="text-[30px] leading-[38px] font-semibold tabular-nums text-foreground/85 whitespace-nowrap">
                  {kpi.value}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {showTrend ? (
                    <>
                      <span className={`${colorClass} font-medium`}>
                        {arrow} {Math.abs(trend.changePercent!)}%
                      </span>
                      <span className="ml-1">{KPI_TREND_LABELS[kpiRange]}</span>
                      {periodLabels && (
                        <span className="block text-xs text-muted-foreground/70 mt-0.5">
                          {periodLabels.current} {trend.current} · {periodLabels.previous} {trend.previous}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/70">—</span>
                  )}
                </p>
              </div>
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ml-4 ${kpi.bg}`}
              >
                <Icon className={`w-5 h-5 ${kpi.iconColor}`} />
              </div>
            </div>
          );
        })}
      </div>
```

- [ ] **Step 4: 修复 formatDuration 折行问题**

将 `formatDuration` 函数修改为返回更紧凑的格式（数字和单位不换行）：

```typescript
function formatDuration(ms: number): string {
  return (ms / 60000).toFixed(1) + " 分钟";
}
```

（保持不变，折行问题通过 KPI 卡片的 `whitespace-nowrap` 类解决，已在 Step 3 中添加）

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add components/usecase-gen/dashboard.tsx
git commit -m "feat: restructure KPI cards with time filter and dynamic trend labels"
```

---

## Task 8: 前端 — 图表独立时间筛选器

**Files:**
- Modify: `components/usecase-gen/dashboard.tsx`

- [ ] **Step 1: 添加图表时间筛选器组件**

在 `KpiTimeFilter` 之后添加：

```typescript
function ChartTimeFilter({
  value,
  onChange,
  options = ["all", "7d", "30d", "90d"] as ChartRange[],
}: {
  value: ChartRange;
  onChange: (v: ChartRange) => void;
  options?: ChartRange[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ChartRange)}
      className="border border-border rounded px-2 py-1 text-xs bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{CHART_LABELS[opt]}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: 修改 DashboardChartCard — extra 改为 ReactNode**

将 `DashboardChartCard` 的 `extra` 类型从 `string` 改为 `ReactNode`：

```typescript
function DashboardChartCard({
  title,
  extra,
  children,
  className = "",
  bodyClass = "",
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
```

- [ ] **Step 3: 趋势折线图 — 添加时间筛选器**

将趋势图区域的 header（`<div className="flex items-center justify-between mb-4 flex-wrap gap-2">`）替换为：

```typescript
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h4 className="font-semibold text-sm text-foreground/85">每日生成量 &amp; 质量分趋势</h4>
            <div className="flex items-center gap-3">
              <TrendLegend />
              <ChartTimeFilter value={trendRange} onChange={setTrendRange} />
            </div>
          </div>
```

- [ ] **Step 4: 需求类型分布 — 添加时间筛选器**

将 `<DashboardChartCard title="需求类型分布" bodyClass="overflow-visible">` 改为：

```typescript
        <DashboardChartCard
          title="需求类型分布"
          bodyClass="overflow-visible"
          extra={<ChartTimeFilter value={categoryRange} onChange={setCategoryRange} options={shortChartOptions()} />}
        >
```

- [ ] **Step 5: 覆盖维度 — 添加时间筛选器**

将 `<DashboardChartCard title="覆盖维度分布" extra="覆盖率">` 改为：

```typescript
        <DashboardChartCard
          title="覆盖维度分布"
          extra={
            <div className="flex items-center gap-2">
              <ChartTimeFilter value={dimensionRange} onChange={setDimensionRange} options={shortChartOptions()} />
            </div>
          }
        >
```

- [ ] **Step 6: 用户评价分布 — 添加时间筛选器**

将 `<DashboardChartCard title="用户评价分布" extra="近 30 天 · 1–5 星占比">` 改为：

```typescript
        <DashboardChartCard
          title="用户评价分布"
          extra={<ChartTimeFilter value={ratingRange} onChange={setRatingRange} options={shortChartOptions()} />}
        >
```

- [ ] **Step 7: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 8: Commit**

```bash
git add components/usecase-gen/dashboard.tsx
git commit -m "feat: add independent time filters to all chart sections"
```

---

## Task 9: 前端 — 人员使用排行改造

**Files:**
- Modify: `components/usecase-gen/dashboard.tsx`

- [ ] **Step 1: 替换 TopUsersHorizontalBars 为可滚动列表**

将 `TopUsersHorizontalBars` 函数替换为：

```typescript
function TopUsersScrollableList({
  users,
}: {
  users: { userName: string; count: number }[];
}) {
  const max = Math.max(...users.map((u) => u.count), 1);

  if (users.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        暂无数据
      </div>
    );
  }

  return (
    <div className="h-full max-h-[200px] overflow-y-auto flex flex-col gap-1.5 pr-1">
      {users.map((u, i) => (
        <div key={`${u.userName}-${i}`} className="flex items-center gap-2 text-xs shrink-0">
          <span className="w-6 text-muted-foreground/70 tabular-nums text-right shrink-0">{i + 1}</span>
          <span className="w-20 text-muted-foreground shrink-0" title={u.userName}>
            {u.userName}
          </span>
          <div className="flex-1 h-5 bg-muted/50 rounded overflow-hidden">
            <div
              className="h-full bg-[#1890ff] rounded transition-all"
              style={{ width: `${Math.round((u.count / max) * 100)}%` }}
            />
          </div>
          <span className="tabular-nums text-muted-foreground w-6 text-right shrink-0">{u.count}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 更新人员排行卡片**

将 `<DashboardChartCard title="人员使用 Top 10" extra="近 30 天" className="md:col-span-2 xl:col-span-2">` 改为：

```typescript
        <DashboardChartCard
          title="人员使用排行"
          className="md:col-span-2 xl:col-span-2"
          extra={<ChartTimeFilter value={userRange} onChange={setUserRange} options={shortChartOptions()} />}
        >
          <TopUsersScrollableList users={data.topUsers} />
        </DashboardChartCard>
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add components/usecase-gen/dashboard.tsx
git commit -m "feat: redesign top users as scrollable list with full names"
```

---

## Task 10: 前端 — 最近记录时间筛选器

**Files:**
- Modify: `components/usecase-gen/dashboard.tsx`

- [ ] **Step 1: 在最近记录 header 添加时间筛选器**

将最近记录区域的筛选栏（`<div className="flex gap-2 ml-auto flex-wrap items-center">`）替换为：

```typescript
          <div className="flex gap-2 ml-auto flex-wrap items-center">
            <ChartTimeFilter value={recordRange} onChange={setRecordRange} />
            <input
              type="search"
              placeholder="搜索需求…"
              value={recordSearch}
              onChange={(e) => setRecordSearch(e.target.value)}
              className="border border-border rounded px-2 py-1 text-xs w-32 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <select
              value={recordFilter}
              onChange={(e) => setRecordFilter(e.target.value as RecordFilter)}
              className="border border-border rounded px-2 py-1 text-xs bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="筛选记录"
            >
              <option value="all">全部</option>
              <option value="rated">有评价</option>
              <option value="unrated">无评价</option>
            </select>
          </div>
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 验证页面渲染**

Run: `npx next dev` (如未启动)，访问 `http://localhost:3000`，检查看板页面：
- KPI 区域有 6 张卡片（2行×3列），右上角有筛选器
- 趋势图、饼图、覆盖维度、用户评价、人员排行各有独立筛选器
- 最近记录有时间筛选器 + 搜索框 + 评价状态筛选
- 人员排行可滚动，名字完整显示

- [ ] **Step 4: Commit**

```bash
git add components/usecase-gen/dashboard.tsx
git commit -m "feat: add time filter to recent records section"
```

---

## Task 11: 更新测试

**Files:**
- Modify: `components/usecase-gen/__tests__/dashboard.test.tsx`

- [ ] **Step 1: 更新 mockStats 数据**

将 `mockStats` 对象中的 `kpi` 和 `kpiTrend` 替换为：

```typescript
const mockStats = {
  kpi: {
    totalCases: 100,
    weeklyActiveUsers: 5,
    avgDuration: 120000,
    avgUserRating: 4.2,
    tasksPerWeek: 12,
    requirementsPerWeek: 8,
  },
  dailyTrend: [{ date: "2026-06-01", count: 3, avgScore: 80 }],
  categoryDistribution: [{ category: "功能", count: 2 }],
  dimensionCoverage: [{ name: "边界", covered: 1, total: 2 }],
  topUsers: [{ userName: "Alice", count: 3 }],
  userRatingDistribution: [
    { stars: 1, count: 0 },
    { stars: 2, count: 0 },
    { stars: 3, count: 1 },
    { stars: 4, count: 2 },
    { stars: 5, count: 1 },
  ],
  kpiTrend: {
    totalCases: { current: 12, previous: 10, changePercent: 20 },
    weeklyActiveUsers: { current: 3, previous: 2, changePercent: 50 },
    avgDuration: { current: 110000, previous: 120000, changePercent: -8 },
    avgUserRating: { current: 4, previous: 4, changePercent: 0 },
    tasksPerWeek: { current: 12, previous: 10, changePercent: 20 },
    requirementsPerWeek: { current: 8, previous: 6, changePercent: 33 },
  },
  userRatingRate: { percent: 67, ratedCount: 2, completedCount: 3 },
  recentRecords: [
    {
      time: "2026/6/1",
      user: "Alice",
      req: "登录功能",
      count: 10,
      score: 90,
      tokens: 1000,
      category: "功能",
      userRating: 5,
      userComment: "很好",
    },
  ],
};
```

- [ ] **Step 2: 更新测试断言**

将 `"renders user rating KPI and chart, no efficiency block"` 测试中的：

```typescript
      expect(screen.getByText("AI 平均质量分")).toBeDefined();
      expect(screen.getByText("AI质量分")).toBeDefined();
```

替换为：

```typescript
      expect(screen.getByText("任务数/周")).toBeDefined();
      expect(screen.getByText("需求数/周")).toBeDefined();
```

- [ ] **Step 3: 添加新测试 — KPI 时间筛选器存在**

在 `describe("Dashboard", ...)` 块内添加新测试：

```typescript
  it("shows KPI time filter and new KPI cards", async () => {
    renderWithClient(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("用例数")).toBeDefined();
      expect(screen.getByText("周活跃用户")).toBeDefined();
      expect(screen.getByText("任务数/周")).toBeDefined();
      expect(screen.getByText("需求数/周")).toBeDefined();
      expect(screen.queryByText("AI 平均质量分")).toBeNull();
      expect(screen.queryByText("累计用例数")).toBeNull();
    });
  });

  it("shows trend label changes with kpiRange filter", async () => {
    renderWithClient(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("周同比")).toBeDefined();
    });
  });
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run components/usecase-gen/__tests__/dashboard.test.tsx`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/__tests__/dashboard.test.tsx
git commit -m "test: update dashboard tests for new KPI structure and filters"
```

---

## Self-Review

**Spec coverage check:**

| Spec 要求 | 实现任务 |
|-----------|---------|
| 移除 AI 平均质量分 KPI 卡片 | Task 7 Step 2（从 kpis 数组移除） |
| 修复平均耗时折行 | Task 7 Step 3（whitespace-nowrap） |
| 累计用例数 → 用例数（时间窗口内） | Task 2 Step 2（kpiTimeFilter）+ Task 7 Step 2 |
| 月活 → 周活 | Task 2 Step 2 + Task 5 Step 1 + Task 7 Step 2 |
| 新增任务数/周 | Task 2 Step 2 + Task 5 Step 1 + Task 7 Step 2 |
| 新增需求数/周（文件名去重，无文件按 taskId） | Task 1（extractReqIdentifier）+ Task 2 Step 2 + Task 5 Step 1 |
| KPI 区统一筛选 | Task 6 Step 3 + Task 7 Step 1/3 |
| 图表区各独立筛选 | Task 8（全步骤） |
| 所有筛选器增加「全部」选项 | Task 1（类型含 all）+ Task 8 Step 1 |
| 同比标签随筛选联动 | Task 7 Step 3（KPI_TREND_LABELS） |
| 全部时不显示同比 | Task 7 Step 3（showTrend 判断） |
| 人员使用全员 + 可滚动 + 名字完整 | Task 9 Step 1/2 |
| 人员排行去掉 take:10 | Task 4 Step 1 |
| 最近记录增加筛选 | Task 10 Step 1 |
| 最近记录保留原有搜索和评价筛选 | Task 10 Step 1（保留原有 input + select） |
| 趋势图保留 avgScore 折线 | 不改动（仅添加筛选器，不改 Line 配置） |
| 整体样式不变 | 所有 Task 均沿用现有 Tailwind 类名 |
| API 新增 7 个 query 参数 | Task 2 Step 1 |
| API 响应去掉 avgQualityScore | Task 5 Step 1 |
| API 响应改名 monthlyActiveUsers → weeklyActiveUsers | Task 5 Step 1 |
| API 响应新增 tasksPerWeek, requirementsPerWeek | Task 5 Step 1 |
| kpiTrend 同步变更 | Task 3 Step 1 |
| 需求数统计：有文件按文件名去重，无文件按 taskId | Task 1（extractReqIdentifier） |
| 不涉及 Prisma schema | 确认：无 schema 改动 |
| 文件仅 3 个 + 1 个新建 | 确认：route.ts + dashboard.tsx + test + stats-time-range.ts |

**Placeholder scan:** ✅ 无 TBD/TODO，所有步骤包含完整代码。

**Type consistency:**
- `KpiRange` / `ChartRange` 在 Task 1 定义，Task 6 import 使用 ✅
- `KPI_LABELS` / `KPI_TREND_LABELS` / `KPI_PERIOD_LABELS` / `CHART_LABELS` 在 Task 1 定义，Task 6/7/8 使用 ✅
- `extractReqIdentifier` 在 Task 1 定义，Task 2/3 使用 ✅
- `calcChangePercent` 在 Task 1 定义，Task 3 使用 ✅
- `kpiTrend` 字段名（`weeklyActiveUsers`, `tasksPerWeek`, `requirementsPerWeek`）在 Task 3 定义、Task 5 返回、Task 6 接口、Task 7 引用 — 全部一致 ✅
- `TopUsersScrollableList` 在 Task 9 定义并使用 ✅
- `ChartTimeFilter` 在 Task 8 定义，Task 9/10 使用 ✅

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-30-dashboard-params.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个 Task 派发独立子智能体执行，任务间审查，快速迭代

**2. Inline Execution** — 在当前会话中按顺序执行，批量处理 + 检查点审查

**Which approach?**
