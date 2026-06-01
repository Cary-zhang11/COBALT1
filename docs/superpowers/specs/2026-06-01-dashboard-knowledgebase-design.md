# 数据看板 & 知识库管理 设计文档

> 日期：2026-06-01

---

## 概述

将数据看板和知识库管理两个模块从 mock 数据改造为对接真实数据，新增必要的数据库列和 API 端点。

---

## 一、Prisma Schema 变更

### 1.1 Task 新增列

```prisma
model Task {
  // ... existing fields ...
  totalCases        Int?     // 首次生成后赋值，微调不更新
  qualityScore      Int?     // 首次生成后赋值，微调不更新
  category          String?  // 需求类型（支付/订单/认证/…），前端生成向导中指定
  dimensionCoverage Json?    // [{ name: "主流程", code: "D1", covered: true, caseCount: 5 }, ...]
}
```

### 1.2 新增 Knowledge 模型

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

### 1.3 存量数据迁移

一次性 SQL 脚本，从 `report` JSON 回填 `totalCases` / `qualityScore` 到存量 task：

```sql
UPDATE "Task"
SET 
  "totalCases"   = CAST("report"->'summary'->>'totalCases' AS INTEGER),
  "qualityScore" = CAST("report"->'summary'->>'qualityScore' AS INTEGER)
WHERE "totalCases" IS NULL
  AND "report" IS NOT NULL
  AND "report"->'summary' IS NOT NULL;
```

执行方式：`npx tsx scripts/migrate-task-columns.ts` 或 prisma migration 后手动执行。

---

## 二、赋值逻辑

### 2.1 `saveOutputAndReport` 修改

文件：`lib/task-engine.ts`

```
saveOutputAndReport(taskId):
  解析 report → summary.totalCases, summary.qualityScore
  解析 report → 维度覆盖提取 (见 2.2)
  
  task = await prisma.task.findUnique(taskId)
  
  如果 task.totalCases === null（首次生成）:
    写入 totalCases, qualityScore, dimensionCoverage
  否则（微调）:
    仅更新 outputFiles + report，不更新以上列
  
  如果 task.category 为空且用户指定了 category:
    写入 category
```

### 2.2 dimensionCoverage 提取

文件：`lib/parse-testcase-md.ts`

在「完整性检查报告」章节中提取维度覆盖列表：

```
输入 md:
  ### 5. 维度覆盖检查
  - 主流程（D1）：是，12个，已覆盖
  - 分支流程（D2）：是，8个，已覆盖
  - 异常容错（D3）：否，已判断不触发

输出:
  [
    { name: "主流程", code: "D1", covered: true, caseCount: 12 },
    { name: "分支流程", code: "D2", covered: true, caseCount: 8 },
    { name: "异常容错", code: "D3", covered: false, caseCount: 0 },
  ]
```

新增函数 `parseDimensionCoverage(markdown: string): DimensionCoverage[]`，在 `parseTestcaseMarkdown` 返回的 `ParseResult` 中增加 `dimensions` 字段。

---

## 三、API 设计

### 3.1 `GET /api/stats` — 数据看板聚合

返回格式：

```ts
{
  kpi: {
    totalCases: number;          // SUM(totalCases)
    monthlyActiveUsers: number;  // COUNT(DISTINCT userId) WHERE createdAt >= monthAgo
    avgQualityScore: number;     // AVG(qualityScore)
    avgDuration: number;         // AVG(duration), ms
  };
  dailyTrend: {                  // 近 30 天
    date: string;                // YYYY-MM-DD
    count: number;               // 当日生成 task 数
    avgScore: number;            // AVG(qualityScore)
  }[];
  categoryDistribution: {        // 需求类型分布饼图
    category: string;            // "支付" | "订单" | "认证" | ...
    count: number;
  }[];
  dimensionCoverage: {           // 覆盖维度分布饼图
    name: string;                // "主流程" | "分支流程" | ...
    covered: number;             // 该维度已覆盖的 task 数
    total: number;               // 已完成的 task 总数
  }[];
  // 聚合方式：遍历所有已完成 task 的 dimensionCoverage JSON，
  // 按维度 name 分组统计 covered === true 的 task 数
  topUsers: {                    // Top 10
    userName: string;
    count: number;
  }[];
  efficiency: {
    avgScore: number;            // AVG(qualityScore)
    avgDuration: number;         // AVG(duration), ms
    avgTokens: number;           // AVG(tokenUsage)
    editRate: number;            // COUNT(tweakCount > 0) / COUNT(*)
  };
  recentRecords: {               // 最近 50 条
    time: string;
    user: string;
    req: string;                 // input 截取前 60 字
    count: number;
    score: number;
    tokens: number;
    category: string;
  }[];
}
```

全部使用 Prisma `aggregate` / `groupBy` / `findMany`，不依赖 JSON 解析或 raw SQL。

### 3.2 `GET/POST/PUT/DELETE /api/knowledge` — 业务知识 CRUD

| Method | Query/Body | 说明 |
|--------|-----------|------|
| `GET` | `?search=&tag=&page=` | 列表 + 关键词搜索 + 标签筛选 + 分页 |
| `POST` | `{ title, content, tags }` | 新增文档，userId 取自 auth |
| `PUT /:id` | `{ title?, content?, tags? }` | 编辑文档 |
| `DELETE /:id` | — | 删除文档 |

### 3.3 `GET /api/knowledge/history` — 历史用例

| Query | 说明 |
|-------|------|
| `?search=&page=` | 按 input 关键词搜索已完成 task |

返回值：

```ts
{
  items: {
    id: string;
    req: string;       // task.input 截取前 60 字
    createdAt: string;
    totalCases: number;
    qualityScore: number;
    modules: number;   // task.report.summary.modules
    userName: string;
  }[];
  total: number;
}
```

---

## 四、前端改动

### 4.1 数据看板 (`dashboard.tsx`)

- 删除所有 `mockKPICards` / `mockRecords` 引用
- 新增 `useQuery({ queryKey: ["stats"], queryFn: () => fetch("/api/stats").then(r => r.json()) })`
- KPI 卡片：渲染 `data.kpi`
- 每日趋势折线图：`recharts` `<LineChart>`，X 轴日期 Y 轴生成量 + 质量分双线
- 需求类型饼图：`recharts` `<PieChart>`，数据 `data.categoryDistribution`
- 覆盖维度饼图：`recharts` `<PieChart>`，数据 `data.dimensionCoverage`（已覆盖/未覆盖）
- Top 10 柱状图：`recharts` `<BarChart>`，数据 `data.topUsers`
- 效率统计卡片：`data.efficiency`
- 最近记录表：`data.recentRecords`，去掉「方案」列
- 需要用户前端提供 `category`（TODO：后续在生成向导中加分类选择，本期看板从已有数据聚合）

### 4.2 知识库管理 (`knowledge-base.tsx`)

- 删除所有 `mockKBTabs` / `mockKBTags` / `mockKBItems` / `mockPromptTemplates` 引用
- Tab 缩减为 2 个：`["业务知识", "历史用例"]`
- 共享左侧搜索框 + 右侧内容区布局

**业务知识 Tab**：
- 调用 `GET /api/knowledge`，支持搜索/标签筛选/分页
- 每条：标题 / 标签 / 更新时间 / 引用次数 / 预览(复用 FilePreviewModal) / 删除
- 底部「添加新条目」按钮 → 弹出编辑 Modal（Markdown 编辑器）
- 标签支持点击筛选

**历史用例 Tab**：
- 调用 `GET /api/knowledge/history`
- 每条：需求名 / 生成时间 / 用例数 / 质量分 / 模块数 / 生成人
- 预览：复用 FilePreviewModal，显示对应 task 的 `测试用例.md`
- 暂不做引用逻辑

### 4.3 parse-testcase-md.ts

新增维度覆盖提取：

```ts
interface DimensionCoverage {
  name: string;
  code: string;
  covered: boolean;
  caseCount: number;
}

function parseDimensionCoverage(markdown: string): DimensionCoverage[]
```

在 `parseTestcaseMarkdown` 返回的 `ParseResult` 中增加 `dimensions: DimensionCoverage[]` 字段。

---

## 五、改动文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 修改 | Task 加 4 列 + Knowledge 模型 |
| `lib/task-engine.ts` | 修改 | saveOutputAndReport 新列赋值逻辑 |
| `lib/parse-testcase-md.ts` | 修改 | 新增 parseDimensionCoverage |
| `app/api/stats/route.ts` | **新增** | 看板聚合 API |
| `app/api/knowledge/route.ts` | **新增** | 业务知识 CRUD API |
| `app/api/knowledge/[id]/route.ts` | **新增** | 单条知识编辑/删除 |
| `app/api/knowledge/history/route.ts` | **新增** | 历史用例列表 |
| `scripts/migrate-task-columns.ts` | **新增** | 存量数据一次性迁移 |
| `components/usecase-gen/dashboard.tsx` | 修改 | 去 mock，接真实 API |
| `components/usecase-gen/knowledge-base.tsx` | 修改 | 去 mock，2 tab + API |

**不改动**：
- `page.tsx`、`sidebar.tsx`、`generate-wizard.tsx`、其他已有组件
- 所有已有 API 路由（除可能受 schema 变更影响的）

---

## 六、Scope 边界

**本次包含**：
- Prisma schema 变更（4 列 + 1 模型）
- 存量数据迁移脚本
- saveOutputAndReport 赋值逻辑
- dimensionCoverage 解析
- 数据看板 API + 前端真实数据渲染
- 知识库 CRUD API + 前端真实数据
- 历史用例浏览

**本次不包含**：
- 生成向导中 category 选择 UI（后续迭代）
- 历史用例作为 few-shot 引用（后续迭代）
- 知识库 RAG 集成（后续迭代）
- 用例规范 / Prompt 模板（已删除）
- 原始数据看板指标变更（全部保留）
