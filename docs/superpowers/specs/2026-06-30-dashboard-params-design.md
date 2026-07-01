# 数据看板参数调整设计文档

> 日期：2026-06-30 | 状态：已确认

## 概述

在现有数据看板基础上升级 KPI 指标、新增时间筛选功能。整体样式不变，增量修改现有组件和 API。

---

## 一、KPI 卡片变更

### 1.1 移除

- **移除「AI 平均质量分」**卡片（原第 3 个）

### 1.2 修改

| 卡片 | 变更 | 显示内容 |
|------|------|--------|
| 累计用例数 → **用例数** | 改为时间窗口内用例数（不再累计全量） | 数值 + 周同比 |
| 月活跃用户 → **周活跃用户** | 统计口径从月改为周 | 数值 + 本周/上周数量 + 较上周幅度 |
| 平均耗时 | 修复折行 | 数字和"分钟"同行 `flex` 布局 |

### 1.3 新增

| 卡片 | 统计口径 | 去重方式 |
|------|---------|---------|
| **任务数/周** | 时间窗口内完成的 task 条数 (`status IN ('completed','paused')`) | 无需去重 |
| **需求数/周** | 时间窗口内去重后的 PRD 文档数 | 从 `inputFiles` 提取文件名（去时间戳前缀），同名即同一需求 |

### 1.4 布局

6 张卡片，**2 行 × 3 列**（原 5 卡片单行）：

```
第一行：用例数 | 周活跃用户 | 平均耗时
第二行：用户平均评分 | 🆕 任务数/周 | 🆕 需求数/周
```

新增卡片用 `border-color` 区分（任务数绿色 `#22c55e`，需求数蓝色 `#3b82f6`）。

### 1.5 同比标签联动

KPI 卡片底部的同比标签随筛选器动态变化：

| 筛选值 | 同比标签 | 本期/上期文字 |
|--------|--------|-------------|
| 全部 | — | 不显示同比 |
| 本周 | 周同比 | 本周 N · 上周 N |
| 本月 | 月同比 | 本月 N · 上月 N |
| 近30天 | 30天同比 | 近30天 N · 前30天 N |

---

## 二、时间筛选策略（混合模式）

### 2.1 筛选分布

| 区域 | 筛选方式 | 可选范围 | 位置 |
|------|---------|---------|------|
| 6 个 KPI 卡片 | 🔗 统一筛选 | 全部 / 本周 / 本月 / 近30天 | KPI 区域右上角 |
| 趋势折线图 | 🔓 独立筛选 | 全部 / 近7天 / 近30天 / 近90天 | 图表右上角 |
| 需求类型分布 | 🔓 独立筛选 | 全部 / 近7天 / 近30天 | 图表右上角 |
| 覆盖维度分布 | 🔓 独立筛选 | 全部 / 近7天 / 近30天 | 图表右上角 |
| 用户评价分布 | 🔓 独立筛选 | 全部 / 近7天 / 近30天 | 图表右上角 |
| 人员使用排行 | 🔓 独立筛选 | 全部 / 近7天 / 近30天 | 图表右上角 |
| 最近记录 | 🔓 独立筛选 | 全部 / 近7天 / 近30天 / 近90天 | 图表右上角 |

> **「全部」选项**：不限定时间范围，返回全量数据。不计算同比，KPI 卡片同比区域显示「—」。

### 2.2 联动规则

- 切换任意筛选器 → 对应区域数据立即刷新
- KPI 区域统一筛选：切换一次，6 张卡片全部更新
- 中间图表区各图表独立筛选，互不联动（各图表各传独立 range 参数）
- 最近记录筛选独立于其他区域
- 同比幅度、本周/上周对比数据均随筛选联动

---

## 三、人员使用排行改造

### 3.1 变更

| 原 | 新 |
|----|----|
| Top 10 水平柱状图 | 全员可滚动列表 |
| 名字 `truncate` 截断 | 名字完整显示 |
| 固定高度 | `max-height` + `overflow-y:auto` |
| API `take: 10` 限制 | 去掉 `take` 限制，返回全部人员 |

### 3.2 布局

保持在原位（覆盖维度分布 + 用户评价分布 + 人员排行，同一行 4 列 grid），每行：排名 · 姓名 · 占比条 · 任务数。

### 3.3 趋势图说明

趋势折线图保留「质量分」折线（`avgScore`），不移除。仅 KPI 卡片中的「AI 平均质量分」被移除，趋势图中的 avgScore 折线作为时序可视化保留。

---

## 四、最近记录

- 新增独立时间筛选（近7天 / 近30天 / 近90天），放在表格右上角
- 原搜索框和评价状态筛选保留不变

---

## 五、API 变更

### 5.1 `GET /api/stats` 新增 query 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `kpiRange` | `all` \| `week` \| `month` \| `30d` | `week` | KPI 卡片时间范围 |
| `trendRange` | `all` \| `7d` \| `30d` \| `90d` | `30d` | 趋势图时间范围 |
| `categoryRange` | `all` \| `7d` \| `30d` | `30d` | 需求类型分布饼图 |
| `dimensionRange` | `all` \| `7d` \| `30d` | `30d` | 覆盖维度分布图 |
| `ratingRange` | `all` \| `7d` \| `30d` | `30d` | 用户评价分布图 |
| `userRange` | `all` \| `7d` \| `30d` | `30d` | 人员使用排行 |
| `recordRange` | `all` \| `7d` \| `30d` \| `90d` | `30d` | 最近记录时间范围 |

### 5.2 响应数据新增字段

```typescript
// kpi 中去掉 avgQualityScore
// monthlyActiveUsers → weeklyActiveUsers
kpi: {
  totalCases: number;
  weeklyActiveUsers: number;      // 改名
  avgDuration: number;
  avgUserRating: number;
  tasksPerWeek: number;           // 新增
  requirementsPerWeek: number;    // 新增
}

// kpiTrend 新增
kpiTrend: {
  totalCases: TrendItem;
  weeklyActiveUsers: TrendItem;   // 改名
  avgDuration: TrendItem;
  avgUserRating: TrendItem;
  tasksPerWeek: TrendItem;        // 新增
  requirementsPerWeek: TrendItem; // 新增
}
```

### 5.3 需求数统计逻辑

```
// 伪代码
function extractReqIdentifier(taskId: string, inputFiles: string[]): string {
  if (inputFiles && inputFiles.length > 0) {
    // 有文件：用文件名去时间戳前缀作为需求标识
    const fileName = path.basename(inputFiles[0]);
    return fileName.replace(/^\d+-/, ''); // "1780581436572-卖车页面改版.docx" → "卖车页面改版.docx"
  }
  // 无文件：每个任务视为一个独立需求，用 taskId 作为标识
  return `__no_file__:${taskId}`;
}

// 统计：对时间窗口内的所有 tasks，按 extractReqIdentifier 结果去重 count
```

> **说明**：有文件的任务按文件名去重，无文件的任务每个算 1 个独立需求。

### 5.4 API 缓存控制

API 路由已有 `export const dynamic = "force-dynamic"`，保持不变。

---

## 六、前端变更范围

### 文件清单

| 文件 | 变更 |
|------|------|
| `components/usecase-gen/dashboard.tsx` | 主要改动：KPI 卡片重构、筛选器、人员列表改造 |
| `app/api/stats/route.ts` | 新增 query 参数解析、新统计逻辑、新字段 |
| `components/usecase-gen/__tests__/dashboard.test.tsx` | 更新 mock 数据和测试用例 |

### 不涉及

- Prisma schema（无需改表）
- 其他页面/组件
- 样式系统（沿用现有 Tailwind 类名体系）

---

## 七、确认清单

- [x] 移除 AI 平均质量分（KPI 卡片），趋势图保留 avgScore 折线
- [x] 修复平均耗时折行
- [x] 累计用例数 → 用例数（时间窗口内）
- [x] 月活 → 周活，显示本周/上周 + 幅度
- [x] 新增任务数/周 + 需求数/周（文件名去重，无文件按 taskId 计）
- [x] KPI 区统一筛选 + 图表区各独立筛选
- [x] 所有筛选器增加「全部」选项
- [x] 同比标签随筛选联动（全部时不显示同比）
- [x] 人员使用全员 + 可滚动 + 名字完整 + 去掉 take:10
- [x] 最近记录增加筛选 + 保留原有搜索和评价筛选
- [x] 整体样式不变，增量修改
