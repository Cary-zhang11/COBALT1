# Step3 & 看板优化 · 设计文档

> 2026-06-03 · 基于方案 A（最小改动）

---

## 一、改动总览

| 序号 | 模块 | 改动 | 涉及文件 |
|------|------|------|---------|
| 1 | Step3 评价 | 回显已有评价 + 提交后确认刷新 | `RatingPanel`, `app/api/tasks/[id]/feedback/route.ts` |
| 2 | Step3 覆盖率 | 移除「覆盖率」列 | `ModuleOverviewTable` |
| 3 | 看板·周同比 | 5 个 KPI 卡片展示真实周同比 | `stats/route.ts`, `Dashboard` |
| 4 | 看板·类型分布 | stats 改读 businessType + Step2 手选 + 推算写入 | `stats/route.ts`, `generate-wizard.tsx`, `task-engine.ts`, `use-tasks.ts`, `app/api/tasks/route.ts` |
| 5 | 看板·覆盖维度 | 修复 MD 解析正则，兼容「否」条目 | `parse-testcase-md.ts` |
| 6 | 知识库 history | 分配类型 hover 改 click、平台行补类型标签、修 overflow 遮挡 | `knowledge-base.tsx` |

---

## 二、Step3 评价功能完善

### 现状

`RatingPanel` 组件支持星级打分 + 备注 → POST `/api/tasks/[id]/feedback`。但存在两个问题：

1. **无回显**：组件初始化时永远是空白状态，用户从历史记录重新进入 Step3 看不到之前提交的评价
2. **无确认刷新**：POST 成功后仅本地 `setSubmitted(true)`，未从服务端二次确认

### 设计

**API 改动**：`app/api/tasks/[id]/feedback/route.ts` 新增 `GET` handler，返回当前用户对该任务的最新评价：

```
GET → 查 TaskFeedback（taskId + userId，取最新一条）
  → 有数据：{ rating: number, comment: string | null }
  → 无数据：{ rating: null, comment: null }
```

**RatingPanel 组件改动：**

```
mount → GET /api/tasks/[taskId]/feedback
  → rating != null：setRating(rating), setComment(comment), setSubmitted(true)
  → rating == null：保持空白交互状态

submit → POST /api/tasks/[taskId]/feedback
  → 成功后：重新 GET 确认服务端数据
  → 失败：展示 error message
```

**RatingPanel 组件接口不变**：无需新增 props，auth 由 API 层处理。

### 边界情况

- 评价在 task 详情中已返回，无额外请求失败风险
- 如果 feedback 数组为空（未被评价过），保持正常的星级交互 UI
- 如果 GET 失败（网络问题），降级为允许重新提交（后端会创建新记录覆盖）

---

## 三、模块用例概览 · 移除覆盖率列

### 设计

`ModuleOverviewTable` 中删除：

1. 表头 `<th>` 中的「覆盖率」列
2. 每行 `<td>` 中的进度条 + 百分比显示

其他列（模块、用例数、P0/P1/P2）不变。

---

## 四、数据看板 · 周同比

### 现状

KPI 卡片底部显示占位文字 `— 周同比`，无实际数据。

### 数据定义

| KPI | 主值 | 周同比含义 |
|-----|------|-----------|
| 累计用例数 | 累计总数 | 本周新增 vs 上周新增 |
| 月活跃用户 | 近 30 天活跃用户数 | 本周活跃 vs 上周活跃 |
| AI 平均质量分 | 全量均值 | 本周均值 vs 上周均值 |
| 平均耗时 | 全量均值 | 本周均值 vs 上周均值 |
| 用户平均评分 | 全量均值 | 本周均值 vs 上周均值 |

**时间窗口**：本周 = 过去 7 天，上周 = 前 8–14 天。

### 后端改动

`stats/route.ts` 返回新增字段 `kpiTrend`：

```ts
kpiTrend: {
  totalCases:        { current: number; previous: number; changePercent: number | null },
  monthlyActiveUsers:{ current: number; previous: number; changePercent: number | null },
  avgQualityScore:   { current: number; previous: number; changePercent: number | null },
  avgDuration:       { current: number; previous: number; changePercent: number | null },
  avgUserRating:     { current: number; previous: number; changePercent: number | null },
}
```

`changePercent` 取整（`Math.round`），为 null 时表示无法计算（上周为 0）。

计算逻辑：

- **累计用例数（周新增）**：按 `createdAt` 在窗口内筛选，`_sum.totalCases`
- **月活跃用户（周活跃）**：按 `createdAt` 窗口内 `userId` 去重计数
- **质量分 / 耗时**：按窗口内 `_avg`
- **用户平均评分**：查窗口内已完成任务 → 取 `TaskFeedback` 最新评价 → 计算均值（需跨表关联）

### 前端改动

`Dashboard` KPI 卡片中将占位 `— 周同比` 替换为实际数据：

```
↑ 12%    （涨，绿色）
↓ 5%     （跌，红色）
新增      （上周为 0）
—        （两周都为 0 或无数据）
```

### 边界情况

- 上周数据为 0 → `changePercent = null`，前端展示「新增」
- 两周均为 0 → 展示 `—`
- 本周为 0 上周有数据 → `changePercent = -100`，展示 `↓ 100%`

---

## 五、看板 · 需求类型分布修复

### 根因

Task 表有两个字段：`category`（String?）和 `businessType`（String?）。

- `businessType`：上传知识库时可设、知识库 sidebar 可筛选、PATCH API 可修改 — **有数据**
- `category`：无任何代码写入，始终为 null — **无数据**

但 stats API 的饼图偏偏读的是 `category`：

```ts
// stats/route.ts
const categoryResult = await prisma.task.groupBy({ by: ["category"], ... });
```

导致所有任务显示为「未分类」。

### 修复

**a) stats API 改读 `businessType`**

```ts
// 将 by: ["category"] 改为 by: ["businessType"]
const categoryResult = await prisma.task.groupBy({ by: ["businessType"], ... });
// 前端映射：null → "未分类"
```

**b) Step2 加业务类型选择入口**

在 Step2 两个面板（业务知识 / 历史用例）上方增加一行：

```
业务类型：[下拉选择]  默认从关联知识推算
```

- 下拉选项 = `["自动推算", "C1C", "C1B", "C2C", "C2B", "数科", "车小妹"]`
- **推算逻辑**：取 `selectedKnowledgeIds` 中第一个有 `businessType` 且不为 null 的知识条目作为默认值，下拉显示对应选项
- **手选优先**：用户选择一个具体类型 → `manuallySet = true`，忽略后续推算变化
- **重置**：用户选择「自动推算」→ `manuallySet = false`，恢复推算值
- 未关联知识且未手选 → 下拉显示「自动推算」，实际值为空（null）

**c) 写入链路**

参数名统一使用 `businessType`，与 DB 字段一致：

```
Wizard startGenerate()
  → 取 selectedBusinessType（手选或推算）
  → createTask({ skillId, input, uploadedFiles, businessType })
    → useCreateTask hook → POST /api/tasks (body 含 businessType)
      → task-engine.ts createTask() 写入 Task.businessType
```

**涉及文件：**

| 文件 | 改动 |
|------|------|
| `generate-wizard.tsx` | Step2 加下拉、推算 + 手选状态管理（状态名 `selectedBusinessType`） |
| `use-tasks.ts` | `createTask` mutation 加 `businessType` 参数 |
| `app/api/tasks/route.ts` | POST body 解 `businessType`，传入 `createTask` |
| `lib/task-engine.ts` | `createTask` 函数加 `businessType?` 参数写入 `Task.businessType` |
| `app/api/stats/route.ts` | `groupBy` 从 `category` 改为 `businessType` |

---

## 六、看板 · 覆盖维度分布修复

### 根因

`parse-testcase-md.ts` 中的解析正则：

```ts
const lineRegex = /^-\s+(.+?)（(D\d+)）[：:]\s*(是|否)，?(\d+)?个/gm;
```

其中 `个` 为必填字符。但 AI 生成的「否」条目格式为：

```
- 权限安全（D5）：否，已判断不触发
- 性能（D7）：否，PRD未提及性能指标
```

缺少 `N个` 部分，正则匹配失败 → `parseDimensionCoverage` 返回部分数据或空数组。

### 修复

将 `(\d+)?个` 改为可选组 `(?:，(\d+)?个)?`：

```ts
const lineRegex = /^-\s+(.+?)（(D\d+)）[：:]\s*(是|否)(?:，(\d+)?个)?/gm;
```

同时调整取值逻辑：`caseCount` 未匹配时默认为 0（对应「否」条目）。

**验证结果：**

```
主流程（D1）：是，10个，已覆盖 → covered:true, caseCount:10  ✅
权限安全（D5）：否，已判断不触发  → covered:false, caseCount:0  ✅ （之前不匹配）
性能（D7）：否，PRD未提及        → covered:false, caseCount:0  ✅ （之前不匹配）
```

---

## 七、知识库管理 · History Bug 修复

### Bug 1：「分配类型」下拉难点击

**现状**：使用 `group-hover:block`（CSS hover 触发）。鼠标在按钮和下拉之间移动时容易误关闭。

**修复**：改为 click 切换，用 `useState` 控制展开/收起。

```ts
const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
// 点击按钮：toggle openDropdownId
// 点击选项：assign + close
// 点击外部：close（通过 onBlur 或 useEffect 监听）
```

### Bug 2：平台生成记录不显示类型标签

**现状**：手动上传行同时显示 `<SourceBadge />` + `<BusinessTypeBadge />`，平台生成行只有 `<SourceBadge />`。

**修复**：平台生成行补上 `<BusinessTypeBadge type={item.businessType} />`。

后端 `GET /api/knowledge/history` 已返回 `businessType` 字段，前端只需展示。

### Bug 3：下拉被卡片 `overflow-hidden` 裁剪

**现状**：卡片容器 `className="bg-card rounded-xl ... overflow-hidden"`，下拉菜单绝对定位超出卡片下边界时被裁剪。

**修复**：移除卡片的 `overflow-hidden`。卡片作为 flex column 容器，子元素均为全宽，去除 overflow-hidden 不会导致圆角穿透等视觉问题。

---

## 八、涉及文件汇总

| 文件 | 改动类型 | 所属模块 |
|------|---------|---------|
| `components/usecase-gen/shared/rating-panel.tsx` | 修改 | Step3 评价 |
| `app/api/tasks/[id]/feedback/route.ts` | 修改（新增 GET） | Step3 评价 |
| `components/usecase-gen/shared/module-overview-table.tsx` | 修改 | Step3 覆盖率 |
| `app/api/stats/route.ts` | 修改 | 看板·周同比 + 类型分布 |
| `components/usecase-gen/dashboard.tsx` | 修改 | 看板·周同比 |
| `components/usecase-gen/generate-wizard.tsx` | 修改 | Step2 业务类型选择 |
| `hooks/use-tasks.ts` | 修改 | createTask 加 businessType 参数 |
| `app/api/tasks/route.ts` | 修改 | POST 解 businessType 传入 createTask |
| `lib/task-engine.ts` | 修改 | createTask 加 businessType 写 Task.businessType |
| `lib/parse-testcase-md.ts` | 修改 | 覆盖维度正则 |
| `components/usecase-gen/knowledge-base.tsx` | 修改 | history 三 bug |

无新增文件，无新增依赖。

---

## 九、测试要点

| 场景 | 验证方式 |
|------|---------|
| 评价回显：已评价用户重进 Step3 | 手动测试：提交评价 → 离开页面 → 重新进入，应看到已提交状态和星级 |
| 评价回显：未评价用户 | 手动测试：应看到空白星级交互 UI |
| 覆盖率列已移除 | 快照测试 + 手动测试 |
| 周同比正常情况 | 单元测试 `stats/route.ts` 计算逻辑 |
| 周同比上周为 0 | 手动测试：新环境第一周应显示「新增」 |
| Step2 手选类型 | 手动测试：选知识条目 → 下拉自动填充 → 手动改 → 确认不改回 |
| 类型分布有数据 | 手动测试：生成一个任务后看板饼图不再是全「未分类」 |
| 覆盖维度正则匹配「否」 | 单元测试 `parseDimensionCoverage` 所有格式 |
| 分配类型点击切换 | 手动测试：点击展开 → 点击选项 → 关闭 |
| 平台生成记录显示类型标签 | 手动测试：看历史记录列表，平台生成行应有类型标签 |
| 下拉不再被裁剪 | 手动测试：展开列表底部记录的下拉菜单，应完整显示 |

---

*文档版本 v1.0 · 2026-06-03*
