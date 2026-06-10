# Step3 & 看板优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Step3 评价回显、覆盖率冗余、看板周同比/类型分布/覆盖维度，以及知识库 history 三个 bug。

**Architecture:** 最小改动方案，11 个现有文件修改，无新增文件/依赖。按独立模块拆分为 9 个 Task，每个 Task 可独立验证。

**Tech Stack:** Next.js 14 (App Router), React 18, Prisma, TypeScript, Tailwind CSS, Vitest + React Testing Library

---

## 文件结构

| 文件 | 职责 | 改动类型 |
|------|------|---------|
| `lib/parse-testcase-md.ts` | MD 解析器，含维度覆盖正则 | 修改（正则 + 取值逻辑） |
| `components/usecase-gen/shared/module-overview-table.tsx` | 模块概览表格 | 修改（删覆盖率列） |
| `app/api/tasks/[id]/feedback/route.ts` | 评价 API（POST） | 修改（新增 GET） |
| `components/usecase-gen/shared/rating-panel.tsx` | 评价 UI 组件 | 修改（回显 + 刷新） |
| `app/api/stats/route.ts` | 看板数据 API | 修改（类型分布 + 周同比） |
| `lib/task-engine.ts` | 任务引擎 | 修改（createTask 加 businessType） |
| `hooks/use-tasks.ts` | 任务 hooks | 修改（createTask mutation 加参数） |
| `app/api/tasks/route.ts` | 任务 CRUD API | 修改（POST 解 businessType） |
| `components/usecase-gen/generate-wizard.tsx` | 生成向导 | 修改（Step2 加业务类型选择） |
| `components/usecase-gen/dashboard.tsx` | 数据看板 | 修改（周同比 UI） |
| `components/usecase-gen/knowledge-base.tsx` | 知识库管理 | 修改（history 三 bug） |

---

### Task 1: 覆盖维度正则修复

**Files:**
- Modify: `lib/parse-testcase-md.ts:279-293`

- [ ] **Step 1: 写失败测试**

```ts
// 在 components/usecase-gen/shared/__tests__/parse-usecase-output.test.ts 末尾追加
// 注意：parseDimensionCoverage 是 parse-testcase-md.ts 的内部函数，未被 parse-usecase-output.ts 导出。
// 本次修复只改正则，通过手动验证 + 现有集成测试覆盖。
// 测试策略：确认已生成的 sandbox MD 文件中的维度覆盖章节可被解析。
```

实际上 `parseDimensionCoverage` 是模块内部函数，不单独导出。通过以下方式验证：
1. 检查现有 sandbox 输出文件能否被 `parseTestcaseMarkdown` 完整解析
2. 编写 Node 脚本直接调 `parseTestcaseMarkdown` 验证

在 `scripts/` 下新建验证脚本：

```ts
// scripts/verify-dimension-fix.ts
import { readFileSync } from "fs";
import { parseTestcaseMarkdown } from "../lib/parse-testcase-md";

const mdPath = process.argv[2];
if (!mdPath) { console.error("Usage: tsx scripts/verify-dimension-fix.ts <md-file>"); process.exit(1); }

const content = readFileSync(mdPath, "utf-8");
const result = parseTestcaseMarkdown(content);
console.log("Dimensions:", JSON.stringify(result.dimensions, null, 2));
console.log("Total:", result.dimensions.length);
```

- [ ] **Step 2: 运行脚本确认当前解析失败**

```bash
tsx scripts/verify-dimension-fix.ts sandbox/0cdc349a-3c3e-4a7a-b62a-928ba35d0c93/output/卖车页面改版_测试用例.md
```

Expected: dimensions 数组中「否」条目缺失（如权限安全、性能等不出现）

- [ ] **Step 3: 修复正则**

在 `lib/parse-testcase-md.ts` 中找到 `parseDimensionCoverage` 函数（约 278 行），修改 `lineRegex`：

```ts
// 修改前
const lineRegex = /^-\s+(.+?)（(D\d+)）[：:]\s*(是|否)，?(\d+)?个/gm;

// 修改后 — 将 N个 部分改为完全可选
const lineRegex = /^-\s+(.+?)（(D\d+)）[：:]\s*(是|否)(?:，(\d+)?个)?/gm;
```

- [ ] **Step 4: 运行验证脚本确认修复**

```bash
tsx scripts/verify-dimension-fix.ts sandbox/0cdc349a-3c3e-4a7a-b62a-928ba35d0c93/output/卖车页面改版_测试用例.md
```

Expected: 10 条维度全部解析，包括 `权限安全（D5）：covered:false, caseCount:0`、`性能（D7）：covered:false, caseCount:0` 等「否」条目

- [ ] **Step 5: 运行现有测试确保无回归**

```bash
npm test -- --run
```

Expected: 所有测试 PASS（尤其 `parse-usecase-output.test.ts` 的 11 个用例）

- [ ] **Step 6: Commit**

```bash
git add lib/parse-testcase-md.ts scripts/verify-dimension-fix.ts
git commit -m "fix: parseDimensionCoverage regex — 兼容「否」条目无 N个 的格式

将正则中 (\d+)?个 改为可选组 (?:，(\d+)?个)?，使"否，已判断不触发"类条目可匹配。
已验证: sandbox MD 文件中全部 10 个维度均正确解析。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 模块概览 — 移除覆盖率列

**Files:**
- Modify: `components/usecase-gen/shared/module-overview-table.tsx:36-74`

- [ ] **Step 1: 删除覆盖率表头**

在 `module-overview-table.tsx` 的 `<thead>` 中（约 36-42 行），删除：

```tsx
// 删除这一行
<th className="text-right px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">覆盖率</th>
```

- [ ] **Step 2: 删除每行覆盖率单元格**

在 `<tbody>` 中每个 `<tr>` 内（约 60-67 行），删除整个覆盖率 `<td>`：

```tsx
// 删除以下整个块
<td className="text-right px-5 py-3">
  <div className="flex items-center justify-end gap-2">
    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${cov >= 80 ? "bg-emerald-500" : cov >= 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${cov}%` }} />
    </div>
    <span className="text-xs text-muted-foreground">{cov}%</span>
  </div>
</td>
```

- [ ] **Step 3: 删除覆盖率计算变量**

在 `<tbody>` 渲染逻辑中（约 45-48 行），删除 `cov` 变量：

```tsx
// 删除这一行
const cov = Math.min(100, Math.round(mod.cases.length / Math.max(1, totalCases / modules.length) * 40 + 60));
```

- [ ] **Step 4: 运行测试确认无回归**

```bash
npm test -- --run
```

Expected: 所有测试 PASS

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/shared/module-overview-table.tsx
git commit -m "refactor: ModuleOverviewTable 移除覆盖率列

覆盖率使用纯前端公式计算，无业务含义。删除表头、行数据及计算逻辑。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 评价 — feedback API 新增 GET

**Files:**
- Modify: `app/api/tasks/[id]/feedback/route.ts`

- [ ] **Step 1: 新增 GET handler**

在 `app/api/tasks/[id]/feedback/route.ts` 中，于现有 `POST` 前插入 `GET` handler：

```ts
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    const feedback = await prisma.taskFeedback.findFirst({
      where: { taskId: params.id, userId },
      orderBy: { createdAt: "desc" },
      select: { rating: true, comment: true },
    });

    if (!feedback) {
      return NextResponse.json({ rating: null, comment: null });
    }

    return NextResponse.json({
      rating: feedback.rating,
      comment: feedback.comment,
    });
  } catch (error) {
    console.error("Feedback GET error:", error);
    return NextResponse.json(
      { error: "Failed to load feedback" },
      { status: 500 }
    );
  }
}
```

文件头部 import 保持不变（`NextRequest`, `NextResponse`, `prisma`, `getAuthUser` 已在）。

- [ ] **Step 2: 验证 GET endpoint**

启动 dev server 后用 curl 测试（需要先登录获取 token）：

```bash
# 手动测试：访问 /api/tasks/{已评价的taskId}/feedback
# Expected: { rating: 4, comment: "xxx" } 或 { rating: null, comment: null }
```

- [ ] **Step 3: Commit**

```bash
git add app/api/tasks/\[id\]/feedback/route.ts
git commit -m "feat: feedback API 新增 GET 回显当前用户评价

GET /api/tasks/[id]/feedback 返回当前用户对该任务的最新评价。
无评价时返回 { rating: null, comment: null }。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 评价 — RatingPanel 回显 + 刷新

**Files:**
- Modify: `components/usecase-gen/shared/rating-panel.tsx`

- [ ] **Step 1: 扩展测试用例**

在 `components/usecase-gen/shared/__tests__/rating-panel.test.tsx` 中新增两个测试：

```tsx
it("fetches and displays existing feedback on mount", async () => {
  const mockFetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ rating: 4, comment: "不错" }) });

  vi.stubGlobal("fetch", mockFetch);

  render(<RatingPanel taskId="task-1" />);

  await waitFor(() => {
    expect(screen.getByText("已提交 · 4 分")).toBeInTheDocument();
  });
  expect(screen.getByText("不错")).toBeInTheDocument();
});

it("stays interactive when GET returns null rating", async () => {
  const mockFetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ rating: null, comment: null }) });

  vi.stubGlobal("fetch", mockFetch);

  render(<RatingPanel taskId="task-1" />);

  await waitFor(() => {
    expect(screen.getByText("提交评价")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run components/usecase-gen/shared/__tests__/rating-panel.test.tsx
```

Expected: 新增 2 个测试 FAIL，因为 RatingPanel 尚未调用 GET

- [ ] **Step 3: 实现 RatingPanel 回显逻辑**

修改 `components/usecase-gen/shared/rating-panel.tsx`：

在现有 `useState` 声明之后、`if (!taskId)` 之前，新增 `useEffect`：

```tsx
import { useState, useEffect } from "react";

// 在组件体内，useState 声明之后插入：

// 回显已有评价
useEffect(() => {
  if (!taskId) return;
  let cancelled = false;
  fetch(`/api/tasks/${taskId}/feedback`)
    .then((res) => {
      if (!res.ok) throw new Error("Failed");
      return res.json();
    })
    .then((data: { rating: number | null; comment: string | null }) => {
      if (cancelled) return;
      if (data.rating != null) {
        setRating(data.rating);
        if (data.comment) setComment(data.comment);
        setSubmitted(true);
      }
    })
    .catch(() => {
      // GET 失败 — 降级，保持空白交互状态，允许用户重新提交
    });
  return () => { cancelled = true; };
}, [taskId]);
```

- [ ] **Step 4: 修改 POST 成功后刷新逻辑**

找到 `handleSubmit` 函数中的 POST 成功分支（约 35-36 行），在 `setSubmitted(true)` 后改为重新 GET：

```tsx
// 修改前
if (res.ok) {
  setSubmitted(true);
}

// 修改后
if (res.ok) {
  // 重新 GET 确认服务端数据
  try {
    const confirmRes = await fetch(`/api/tasks/${taskId}/feedback`);
    if (confirmRes.ok) {
      const confirmed = await confirmRes.json();
      setRating(confirmed.rating);
      if (confirmed.comment) setComment(confirmed.comment);
      setSubmitted(true);
    } else {
      setSubmitted(true); // GET 失败但 POST 成功，仍然标记已提交
    }
  } catch {
    setSubmitted(true);
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx vitest run components/usecase-gen/shared/__tests__/rating-panel.test.tsx
```

Expected: 所有测试 PASS（原有 1 个 + 新增 2 个）

- [ ] **Step 6: 运行全部测试**

```bash
npm test -- --run
```

Expected: 所有测试 PASS

- [ ] **Step 7: Commit**

```bash
git add components/usecase-gen/shared/rating-panel.tsx components/usecase-gen/shared/__tests__/rating-panel.test.tsx
git commit -m "feat: RatingPanel 回显已有评价 + 提交后服务端确认

- mount 时 GET /api/tasks/[id]/feedback 回显已有评价
- POST 成功后重新 GET 确认服务端数据
- GET 失败时降级展示空白交互 UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 类型分布 — stats API groupBy 修复

**Files:**
- Modify: `app/api/stats/route.ts:69`

- [ ] **Step 1: 修改 groupBy 字段**

在 `app/api/stats/route.ts` 中找到约第 69 行：

```ts
// 修改前
const categoryResult = await prisma.task.groupBy({
  by: ["category"],
  where: completedFilter,
  _count: true,
});
const categoryDistribution = categoryResult.map((r) => ({
  category: r.category || "未分类",
  count: r._count,
}));

// 修改后
const categoryResult = await prisma.task.groupBy({
  by: ["businessType"],
  where: completedFilter,
  _count: true,
});
const categoryDistribution = categoryResult.map((r) => ({
  category: r.businessType || "未分类",
  count: r._count,
}));
```

注意：返回 JSON 中 key 仍为 `category`，前端 `Dashboard` 的 `StatsData` interface 无需改动，饼图 `nameKey="category"` 无需改动。

- [ ] **Step 2: 验证 API 响应**

```bash
# 启动 dev server 后
curl http://localhost:3000/api/stats -H "Cookie: token=..."
```

Expected: `categoryDistribution` 数组中不再全部是 `"未分类"`，而是出现 C1C、C1B 等实际值

- [ ] **Step 3: Commit**

```bash
git add app/api/stats/route.ts
git commit -m "fix: stats API 需求类型分布改读 businessType 字段

Task.businessType 已有数据（知识库上传/PATCH API 写入），
但 groupBy 误读了始终为 null 的 category 字段，导致饼图全为"未分类"。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: businessType 写入链路

**Files:**
- Modify: `lib/task-engine.ts:12`
- Modify: `hooks/use-tasks.ts:43`
- Modify: `app/api/tasks/route.ts:34`

- [ ] **Step 1: task-engine.ts — createTask 加参数**

修改 `lib/task-engine.ts` 中 `createTask` 函数签名和 Prisma create：

```ts
// 修改前
export async function createTask(
  userId: string,
  skillId: string,
  input: string,
  uploadedFiles?: string[]
): Promise<string> {

// 修改后
export async function createTask(
  userId: string,
  skillId: string,
  input: string,
  uploadedFiles?: string[],
  businessType?: string | null
): Promise<string> {
```

在 `prisma.task.create` 的 `data` 对象中加入：

```ts
const task = await prisma.task.create({
  data: {
    userId,
    skillId,
    skillVersionId: latestVersion.id,
    input,
    inputFiles: uploadedFiles || [],
    businessType: businessType || null,
  },
});
```

- [ ] **Step 2: app/api/tasks/route.ts — POST 解 businessType**

修改 `app/api/tasks/route.ts` 的 POST handler（约 38 行）：

```ts
// 修改前
const { skillId, input, uploadedFiles } = await req.json();

// 修改后
const { skillId, input, uploadedFiles, businessType } = await req.json();
```

```ts
// 修改前
const taskId = await createTask(userId, skillId, input, uploadedFiles);

// 修改后
const taskId = await createTask(userId, skillId, input, uploadedFiles, businessType || null);
```

- [ ] **Step 3: hooks/use-tasks.ts — useCreateTask 加参数**

修改 `hooks/use-tasks.ts` 中 `useCreateTask` mutation：

```ts
// 修改前
mutationFn: async (data: {
  skillId: string;
  input: string;
  uploadedFiles?: string[];
}) => {

// 修改后
mutationFn: async (data: {
  skillId: string;
  input: string;
  uploadedFiles?: string[];
  businessType?: string | null;
}) => {
```

在 fetch body 中加入：

```ts
body: JSON.stringify({
  skillId: data.skillId,
  input: data.input,
  uploadedFiles: data.uploadedFiles,
  businessType: data.businessType,
}),
```

- [ ] **Step 4: 验证写入链路**

通过创建一个任务并检查数据库：

```bash
# 手动：在 Wizard 中触发一次生成 → 检查 Prisma Studio 或查询
# npx prisma studio
# 确认 Task 记录的 businessType 字段有值
```

- [ ] **Step 5: Commit**

```bash
git add lib/task-engine.ts hooks/use-tasks.ts app/api/tasks/route.ts
git commit -m "feat: createTask 写入链路加 businessType 参数

- task-engine createTask() 新增 businessType? 参数
- POST /api/tasks 解 businessType 并传入 createTask
- useCreateTask hook mutation 加 businessType 参数

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Step2 — 业务类型选择入口

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`

- [ ] **Step 1: 新增状态变量**

在 `generate-wizard.tsx` 中，于 Step2 相关状态声明区域（约 78-89 行之后）添加：

```tsx
// 业务类型选择（Step2）
const [selectedBusinessType, setSelectedBusinessType] = useState<string>("");
const [businessTypeManuallySet, setBusinessTypeManuallySet] = useState(false);
```

- [ ] **Step 2: 新增推算逻辑**

在 Step2 相关逻辑区域，在 `historyOptions` 的 `useMemo` 之后（约 160 行之后），添加推算 `useMemo`：

```tsx
// 从已选知识条目推算 businessType
const inferredBusinessType = useMemo(() => {
  const items = (knowledgeData as { items?: { id: string; businessType: string | null }[] } | undefined)?.items || [];
  for (const id of selectedKnowledgeIds) {
    const item = items.find((i: { id: string; businessType: string | null }) => i.id === id);
    if (item?.businessType) return item.businessType;
  }
  return null;
}, [selectedKnowledgeIds, knowledgeData]);
```

- [ ] **Step 3: 新增推算同步 effect**

```tsx
// 自动推算 → 同步到 selectedBusinessType（仅当未手选时）
useEffect(() => {
  if (!businessTypeManuallySet) {
    setSelectedBusinessType(inferredBusinessType || "");
  }
}, [inferredBusinessType, businessTypeManuallySet]);
```

- [ ] **Step 4: 在 Step2 UI 中加业务类型选择器**

在 `wizStep === 1` 的渲染块中，在两个面板的 `<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">` 之前（约 588 行），插入：

```tsx
{/* 业务类型选择 */}
<div className="bg-card rounded-xl shadow-sm border border-border/60 p-4 flex items-center gap-3">
  <label className="text-sm font-medium whitespace-nowrap">业务类型</label>
  <select
    value={businessTypeManuallySet ? selectedBusinessType : (inferredBusinessType || "auto")}
    onChange={(e) => {
      const val = e.target.value;
      if (val === "auto") {
        setBusinessTypeManuallySet(false);
        setSelectedBusinessType(inferredBusinessType || "");
      } else {
        setBusinessTypeManuallySet(true);
        setSelectedBusinessType(val);
      }
    }}
    className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
  >
    <option value="auto">自动推算{inferredBusinessType ? `（${inferredBusinessType}）` : ""}</option>
    {BUSINESS_TYPES.map((bt) => (
      <option key={bt} value={bt}>{bt}</option>
    ))}
  </select>
  {!businessTypeManuallySet && !inferredBusinessType && (
    <span className="text-xs text-muted-foreground">关联知识条目后自动推算</span>
  )}
</div>
```

- [ ] **Step 5: startGenerate 中传递 businessType**

找到 `startGenerate` 函数中的 `createTask.mutateAsync` 调用（约 405 行），加入 `businessType`：

```tsx
// 修改前
const { taskId: newTaskId } = await createTask.mutateAsync({
  skillId,
  input,
  uploadedFiles: uploadedFiles.map((f) => f.path),
});

// 修改后
const { taskId: newTaskId } = await createTask.mutateAsync({
  skillId,
  input,
  uploadedFiles: uploadedFiles.map((f) => f.path),
  businessType: selectedBusinessType || undefined,
});
```

- [ ] **Step 6: 运行测试**

```bash
npm test -- --run
```

Expected: 所有测试 PASS（generate-wizard test 可能需要更新 snapshot）

- [ ] **Step 7: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat: Step2 加业务类型选择入口（手选 + 知识推算）

- 下拉菜单含"自动推算" + C1C~车小妹 选项
- 自动从已选知识条目推算 businessType
- 手选后锁定，选择"自动推算"可重置
- 传递给 createTask 写入 Task.businessType

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 看板 — 周同比（后端 + 前端）

**Files:**
- Modify: `app/api/stats/route.ts`
- Modify: `components/usecase-gen/dashboard.tsx`

- [ ] **Step 1: stats/route.ts 加 kpiTrend 计算**

在 `app/api/stats/route.ts` 中，于现有 KPI 计算之后（约 157 行 `return NextResponse.json` 之前），添加周同比计算逻辑：

```ts
// ---- 周同比计算 ----
const now = new Date();
const thisWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
const lastWeekEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

function calcChangePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// 累计用例数（周新增）
const [thisWeekCases, lastWeekCases] = await Promise.all([
  prisma.task.aggregate({
    _sum: { totalCases: true },
    where: { ...completedFilter, createdAt: { gte: thisWeekStart } },
  }),
  prisma.task.aggregate({
    _sum: { totalCases: true },
    where: { ...completedFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
  }),
]);

// 月活跃用户（周活跃）
const [thisWeekUsers, lastWeekUsers] = await Promise.all([
  prisma.task.groupBy({
    by: ["userId"],
    where: { ...completedFilter, createdAt: { gte: thisWeekStart } },
  }),
  prisma.task.groupBy({
    by: ["userId"],
    where: { ...completedFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
  }),
]);

// 质量分 + 耗时（周均值）
const [thisWeekAvg, lastWeekAvg] = await Promise.all([
  prisma.task.aggregate({
    _avg: { qualityScore: true, duration: true },
    where: { ...completedFilter, createdAt: { gte: thisWeekStart } },
  }),
  prisma.task.aggregate({
    _avg: { qualityScore: true, duration: true },
    where: { ...completedFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
  }),
]);

// 用户平均评分（周均值 — 需关联 TaskFeedback）
const [thisWeekTaskIds, lastWeekTaskIds] = await Promise.all([
  prisma.task.findMany({
    where: { ...completedFilter, createdAt: { gte: thisWeekStart } },
    select: { id: true },
  }).then(ts => ts.map(t => t.id)),
  prisma.task.findMany({
    where: { ...completedFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
    select: { id: true },
  }).then(ts => ts.map(t => t.id)),
]);

function avgRatingForTaskIds(taskIds: string[]): number {
  if (taskIds.length === 0) return 0;
  const ratings = taskIds
    .map(id => latestByTask.get(id)?.rating)
    .filter((r): r is number => r != null);
  if (ratings.length === 0) return 0;
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
}

const thisWeekCaseCount = thisWeekCases._sum?.totalCases || 0;
const lastWeekCaseCount = lastWeekCases._sum?.totalCases || 0;

const kpiTrend = {
  totalCases: {
    current: thisWeekCaseCount,
    previous: lastWeekCaseCount,
    changePercent: calcChangePercent(thisWeekCaseCount, lastWeekCaseCount),
  },
  monthlyActiveUsers: {
    current: thisWeekUsers.length,
    previous: lastWeekUsers.length,
    changePercent: calcChangePercent(thisWeekUsers.length, lastWeekUsers.length),
  },
  avgQualityScore: {
    current: Math.round(thisWeekAvg._avg?.qualityScore || 0),
    previous: Math.round(lastWeekAvg._avg?.qualityScore || 0),
    changePercent: calcChangePercent(
      Math.round(thisWeekAvg._avg?.qualityScore || 0),
      Math.round(lastWeekAvg._avg?.qualityScore || 0)
    ),
  },
  avgDuration: {
    current: Math.round(thisWeekAvg._avg?.duration || 0),
    previous: Math.round(lastWeekAvg._avg?.duration || 0),
    changePercent: calcChangePercent(
      Math.round(thisWeekAvg._avg?.duration || 0),
      Math.round(lastWeekAvg._avg?.duration || 0)
    ),
  },
  avgUserRating: {
    current: avgRatingForTaskIds(thisWeekTaskIds),
    previous: avgRatingForTaskIds(lastWeekTaskIds),
    changePercent: calcChangePercent(
      avgRatingForTaskIds(thisWeekTaskIds),
      avgRatingForTaskIds(lastWeekTaskIds)
    ),
  },
};
```

在 `return NextResponse.json` 对象中加入 `kpiTrend`：

```ts
// 修改前
return NextResponse.json({
  kpi: { ... },
  dailyTrend,
  ...
});

// 修改后 — 在 dailyTrend 前加 kpiTrend
return NextResponse.json({
  kpi: { ... },
  kpiTrend,
  dailyTrend,
  ...
});
```

- [ ] **Step 2: Dashboard 前端 — 扩展 interface**

在 `components/usecase-gen/dashboard.tsx` 的 `StatsData` interface（约 13 行）中，加入 `kpiTrend` 类型：

```ts
// 在 StatsData interface 内部添加
kpiTrend: {
  totalCases:        { current: number; previous: number; changePercent: number | null };
  monthlyActiveUsers:{ current: number; previous: number; changePercent: number | null };
  avgQualityScore:   { current: number; previous: number; changePercent: number | null };
  avgDuration:       { current: number; previous: number; changePercent: number | null };
  avgUserRating:     { current: number; previous: number; changePercent: number | null };
};
```

- [ ] **Step 3: Dashboard 前端 — KPI 卡片替换占位符**

在 `DashboardBody` 组件中，找到 KPI 卡片的渲染区域（约 276-299 行）。当前每个卡片底部有：

```tsx
<p className="mt-2 text-sm text-muted-foreground">
  <span className="text-muted-foreground/70">—</span>
  <span className="ml-1">周同比</span>
</p>
```

替换为使用 `kpiTrend` 数据的动态渲染。在 `kpis` 数组中每个 KPI 对象加 `trendKey` 字段：

```tsx
const kpis = [
  { label: "累计用例数", value: ..., icon: BarChart3, ..., trendKey: "totalCases" as const },
  { label: "月活跃用户", value: ..., icon: Users, ..., trendKey: "monthlyActiveUsers" as const },
  { label: "AI 平均质量分", value: ..., icon: Target, ..., trendKey: "avgQualityScore" as const },
  { label: "平均耗时", value: ..., icon: Clock, ..., trendKey: "avgDuration" as const },
  { label: "用户平均评分", value: ..., icon: Star, ..., trendKey: "avgUserRating" as const },
];
```

然后每个 KPI 卡片的底部替换为：

```tsx
const trend = data.kpiTrend[kpi.trendKey];

{(() => {
  if (trend.changePercent === null) {
    if (trend.current === 0 && trend.previous === 0) {
      return <span className="text-muted-foreground/70">—</span>;
    }
    return <span className="text-emerald-600 font-medium">新增</span>;
  }
  const isUp = trend.changePercent > 0;
  const isDown = trend.changePercent < 0;
  const colorClass = isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-muted-foreground";
  const arrow = isUp ? "↑" : isDown ? "↓" : "";
  return (
    <span className={`${colorClass} font-medium`}>
      {arrow} {Math.abs(trend.changePercent)}%
    </span>
  );
})()}
<span className="ml-1">周同比</span>
```

- [ ] **Step 4: 运行测试**

```bash
npm test -- --run
```

Expected: 所有测试 PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/stats/route.ts components/usecase-gen/dashboard.tsx
git commit -m "feat: 看板 KPI 卡片展示真实周同比数据

后端: stats API 新增 kpiTrend 字段，计算本周 vs 上周的 5 个 KPI 变化
前端: Dashboard KPI 卡片替换占位符，展示 ↑/↓ N% / 新增 / —

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 知识库 history — 三 bug 修复

**Files:**
- Modify: `components/usecase-gen/knowledge-base.tsx`

- [ ] **Step 1: 添加 openDropdownId 状态**

在 `KnowledgeBase` 组件中，于现有 `useState` 声明区域添加：

```tsx
const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
```

- [ ] **Step 2: 替换平台生成行的下拉（hover → click）**

找到平台生成记录行的 "分配类型" 按钮（约 367-386 行）。将整个 `relative group` div 替换为 click 版本：

```tsx
{/* 修改前: <div className="relative group"> ... hover:block ... </div> */}

{/* 修改后 */}
<div className="relative">
  <ActionButton
    className="gap-0.5"
    onClick={() => setOpenDropdownId(openDropdownId === item.id ? null : item.id)}
  >
    分配类型
    <ChevronDown className={`w-3 h-3 transition-transform ${openDropdownId === item.id ? "rotate-180" : ""}`} />
  </ActionButton>
  {openDropdownId === item.id && (
    <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-20 min-w-[80px]">
      {BUSINESS_TYPES.map((bt) => (
        <button
          key={bt}
          type="button"
          onClick={() => {
            assignBusinessTypeMutation.mutate({ taskId: item.id, bt });
            setOpenDropdownId(null);
          }}
          className={`block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted whitespace-nowrap ${
            item.businessType === bt ? "text-primary font-medium" : ""
          }`}
        >
          {bt}
        </button>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 3: 添加点击外部关闭**

在 `KnowledgeBase` 组件中添加 `useEffect` 监听全局点击：

```tsx
// 点击外部关闭下拉
useEffect(() => {
  if (!openDropdownId) return;
  const handler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-dropdown]")) {
      setOpenDropdownId(null);
    }
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [openDropdownId]);
```

并在下拉父容器上添加 `data-dropdown` 属性：

```tsx
<div className="relative" data-dropdown>
```

- [ ] **Step 4: 平台生成行补 BusinessTypeBadge**

找到平台生成行的 badge 渲染部分（约 342 行），在 `<SourceBadge variant="platform" />` 后面加：

```tsx
// 修改前
badge={<SourceBadge variant="platform" />}

// 修改后
badge={
  <>
    <SourceBadge variant="platform" />
    <BusinessTypeBadge type={item.businessType} />
  </>
}
```

- [ ] **Step 5: 移除卡片 overflow-hidden**

找到列表卡片容器（约 457 行）：

```tsx
// 修改前
className="bg-card rounded-xl border border-border/60 shadow-sm overflow-hidden"

// 修改后 — 移除 overflow-hidden
className="bg-card rounded-xl border border-border/60 shadow-sm"
```

- [ ] **Step 6: 运行测试**

```bash
npm test -- --run
```

Expected: 所有测试 PASS（knowledge-base 无单独测试文件，测试 `generate-wizard.test.tsx` 等不相关测试仍然通过）

- [ ] **Step 7: Commit**

```bash
git add components/usecase-gen/knowledge-base.tsx
git commit -m "fix: 知识库 history — 分配类型、类型标签、overflow 三修复

- 分配类型下拉 hover 改 click + 点击外部关闭
- 平台生成记录补 BusinessTypeBadge
- 卡片移除 overflow-hidden 修复下拉被裁剪

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 执行顺序

```
Task 1 (正则)  ──┐
Task 2 (覆盖率) ──┤
Task 3 (GET)    ──┤  可并行
Task 5 (groupBy)──┤
Task 6 (写入链路)─┤
                  │
Task 4 (回显)   ──┤  依赖 Task 3（GET endpoint）
Task 7 (Step2)  ──┤  依赖 Task 6（写入链路准备好）
Task 8 (周同比) ──┘  依赖 Task 5（同一文件 stats/route.ts 先改 groupBy）
Task 9 (history) ───  独立，无依赖
```

推荐顺序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

---

## 自审（Self-Review）

### 1. Spec 覆盖

| Spec 章节 | 对应 Task |
|-----------|----------|
| 二、Step3 评价功能完善 | Task 3 (GET) + Task 4 (回显) |
| 三、移除覆盖率列 | Task 2 |
| 四、周同比 | Task 8 |
| 五、需求类型分布修复 | Task 5 (groupBy) + Task 6 (写入链路) + Task 7 (Step2) |
| 六、覆盖维度修复 | Task 1 |
| 七、知识库 history bug | Task 9 |

无遗漏。

### 2. Placeholder 扫描

- 无 TBD/TODO/implement later
- 无 "add appropriate error handling" — 所有错误处理有具体代码
- 无 "similar to Task N" — 每个 Task 独立完整

### 3. Type 一致性

- `businessType` 在所有 Task 中统一使用（Task 5/6/7/9）
- `kpiTrend` 类型在 Task 8 后端和前端一致
- `RatingPanel` 接口不变（Task 4），props 无需修改
