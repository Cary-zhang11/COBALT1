# 向导第三步数据显示与功能交互优化设计

> 日期: 2026-07-03
> 范围: `components/usecase-gen/generate-wizard.tsx` Step 3 (wizStep === 2) 及相关共享组件

## 概述

优化用例生成向导第三步「生成并预览」的布局结构和交互方式，解决页面过长、用例详情展示不足、侧边栏与主区功能重叠等问题。

## 现状分析

当前第三步主区从上到下依次为：
1. **数据概览** — 4 个 KPI 卡片（生成模块/用例总数/质量评分/生成耗时），min-height 96px，占用大量垂直空间
2. **输出文件** — 文件行列表，每行 44px
3. **AI 微调** — 快捷指令 + 输入框 + 微调历史
4. **本次生成评价** — 星级评分 + 评论
5. **模块用例概览** — 位于最底部，仅展示模块名/用例数/P0-P1-P2 三列

侧边栏（ExecutionPanel）包含：工作流时间线 + 配置预览 + 快捷操作（下载 MD/下载 XMind/AI 微调/评价/编辑）。

**问题：**
- KPI 卡片高度大，信息密度低
- 模块概览在底部，用户需要滚动很远才能看到
- 模块概览只有模块级汇总，无法查看具体用例内容
- 评价面板在主区，与侧边栏快捷操作有功能重叠
- 侧边栏下载按钮分散（MD/XMind 分开），且不含 xlsx

## 设计方案

### 整体布局

```
┌─────────────────────────────────────────────────────┐
│  步骤指示器 (输入物料 → 关联用例 → 生成并预览)        │
├──────────────────────────────┬──────────────────────┤
│  主区 (左)                    │  侧边栏 (右, 220px)   │
│                              │                      │
│  ┌──────────────────────┐   │  ┌──────────────────┐│
│  │ 📊 数据概览           │   │  │ 执行轨迹          ││
│  │ 模块8·用例45·评分82·3.2min│   │  │ ✓✓✓✓✓           ││
│  └──────────────────────┘   │  │ ✓ 执行完成        ││
│  ┌──────────────────────┐   │  ├──────────────────┤│
│  │ 📋 模块用例概览       │   │  │ 快捷操作          ││
│  │ [全部展开][全部收起]  │   │  │ ⬇ 下载文件(浮窗)  ││
│  │ ▶ 登录模块 12 P0×3.. │   │  │ ✏️ 编辑脑图(浮窗)  ││
│  │ ▶ 注册模块 8  P0×2.. │   │  │ 💬 AI微调(↓主区)  ││
│  └──────────────────────┘   │  ├──────────────────┤│
│  ┌──────────────────────┐   │  │ 本次生成评价      ││
│  │ 📄 输出文件      3个  │   │  │ ☆☆☆☆☆           ││
│  │ 📄 xx.md [预览][下载] │   │  │ [补充说明...]     ││
│  │ 🧠 xx.xmind[编辑][下载]│  │  │ [提交评价]        ││
│  │ 📊 xx.xlsx    [下载]  │   │  └──────────────────┘│
│  └──────────────────────┘   │                      │
│  ┌──────────────────────┐   │                      │
│  │ ✨ AI 微调            │   │                      │
│  │ [chips] [input][发送] │   │                      │
│  └──────────────────────┘   │                      │
└──────────────────────────────┴──────────────────────┘
```

### 变更 1: 数据概览 — 单行内联

**当前**: 4 个 KPI 卡片，grid 2×2 或 1×4，min-height 96px/卡

**改为**: WizardSection 标题栏 + 单行内联数据，总高度约 70px

- 标题: 📊 数据概览
- 内容: `模块 8 · 用例 45 · 评分 82 · 耗时 3.2min`
- 评分颜色: ≥80 绿色, ≥60 橙色, <60 红色
- 数据来源不变: `usecaseTree.length`, `usecaseTree.reduce(cases)`, `genStats.qualityScore`, `genStats.duration`

### 变更 2: 模块用例概览 — 手风琴卡片 + 上移

**当前**: 位于最底部，简单表格（模块名/用例数/P0-P1-P2），不可展开

**改为**: 上移到数据概览下方，手风琴卡片式，可展开看完整用例

**位置**: 从第 5 位 → 第 2 位（数据概览之后，输出文件之前）

**结构**:
- 标题栏: 📋 模块用例概览 (N 模块 · M 用例) + [全部展开] [全部收起] 按钮
- 每个模块一张卡片:
  - 折叠态: `▶ 模块名  N用例  P0×a P1×b P2×c`
  - 展开态: 每条用例显示完整字段:
    - 优先级 badge (P0 红/P1 橙/P2 灰)
    - 用例标题
    - 前置条件
    - 步骤
    - 预期结果
    - 标签

**默认状态**: 全部折叠

**展开/收起控制**:
- 点击模块卡片头部 → 切换该模块展开/折叠
- 「全部展开」→ 所有模块展开
- 「全部收起」→ 所有模块折叠

**性能**: 数据已在内存中（`usecaseTree` state），展开只是渲染操作，无额外 API 调用。未展开的模块不渲染用例详情，避免不必要的 DOM 节点。

### 变更 3: 输出文件 — 紧凑行布局

**当前**: 文件行列表，每行 44px，有预览/编辑/下载按钮

**改为**: 紧凑行布局，每行 32px，保留所有操作按钮

- 标题栏: 📄 输出文件 + 文件数
- 每行: 图标 + 文件名(ellipsis) + 操作按钮
  - `.md`: [预览] [下载]
  - `.xmind`: [编辑] [下载]
  - `.xlsx`: [下载]
- 按钮样式: 小号 (text-xs, py-0.5, px-2)

**数据源不变**: `mergedOutputFiles`，过滤逻辑 (`isDisplayable`) 不变

### 变更 4: 评价面板 — 移入侧边栏

**当前**: 主区独立 WizardSection（位于 AI 微调之后）

**改为**: 移入侧边栏 ExecutionPanel，位于快捷操作下方

- RatingPanel 组件复用，`sectioned` 模式
- 在 ExecutionPanel 的 QuickActions 之后渲染
- 交互逻辑不变: GET 回显 + POST 提交 + 乐观更新

**同步清理**:
- 移除主区的 `#step3-rating` WizardSection 渲染（generate-wizard.tsx L1289-1297）
- 移除 QuickActions 中的「评价 ↓主区」按钮
- 移除 ExecutionPanelProps 中的 `onScrollToRating` 回调
- 移除 generate-wizard.tsx 中对应的 `onScrollToRating` prop 传递

### 变更 5: 侧边栏快捷操作 — 下载/编辑改浮窗

**当前**: 
- 下载分为「下载 Markdown」「下载 XMind」两个按钮
- 编辑按钮直接跳转编辑器（无文件选择）

**改为**:

**下载文件浮窗**:
- 点击「⬇ 下载文件」按钮 → 弹出浮窗
- 浮窗列出可下载文件（md/xmind/xlsx），每种类型展示最新版本（复用 `pickLatestFiles` 逻辑，扩展支持 xlsx）
- 每个文件旁有「下载」按钮
- 点击下载按钮 → 触发下载 → 浮窗保持打开（用户可能下载多个）
- 点击遮罩/✕ 关闭浮窗

**编辑脑图浮窗**:
- 点击「✏️ 编辑脑图」按钮 → 弹出浮窗
- 浮窗列出所有 .xmind 文件（支持多版本）
- 每个文件旁有「编辑」按钮
- 点击编辑 → 跳转到编辑器 Tab（携带 taskId + filePath）
- 单个 xmind 文件时也走浮窗（保持交互一致性）

**回调签名变更**:
- `ExecutionPanelProps.onNavigateToEditor` 从 `() => void` 改为 `(filePath?: string) => void`
- generate-wizard.tsx 侧对应更新: `onNavigateToEditor={(filePath) => onNavigateToTab?.(2, taskId ? { taskId, filePath } : undefined)}`

**浮窗组件**: 新建 `FileActionModal` 组件，接口如下：

```typescript
interface FileActionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;           // "下载文件" / "编辑脑图"
  files: FileInfo[];       // 文件列表
  actionLabel: string;     // "下载" / "编辑"
  onAction: (file: FileInfo) => void;  // 点击操作按钮
  emptyText?: string;      // "暂无可下载文件" / "暂无可编辑的脑图文件"
}
```

视觉样式复用 FilePreviewModal 的浮窗框架（fixed inset-0 + backdrop + centered card）。

### 变更 6: 区块标题图标统一

**当前**: 部分区块有图标，部分没有

**改为**: 所有 WizardSection 标题栏统一包含图标

| 区块 | 图标 | lucide 组件 |
|------|------|-------------|
| 数据概览 | 📊 | BarChart3 |
| 模块用例概览 | 📋 | Table |
| 输出文件 | 📄 | FileText |
| AI 微调 | ✨ | Sparkles |

## 组件影响分析

### 需修改的文件

| 文件 | 变更内容 |
|------|----------|
| `components/usecase-gen/generate-wizard.tsx` | Step3 主区区块顺序调整、数据概览改内联、评价面板移除、模块概览替换为新组件、移除 `onScrollToRating` prop 传递、更新 `onNavigateToEditor` 签名 |
| `components/usecase-gen/shared/module-overview-table.tsx` | 重写为手风琴卡片组件，支持展开/收起、全部展开/全部收起 |
| `components/usecase-gen/shared/execution-panel.tsx` | 添加评价面板、下载/编辑改浮窗触发、移除原 QuickActions 中的分离下载按钮和评价滚动按钮、移除 `onScrollToRating` prop、`onNavigateToEditor` 签名改为 `(filePath?: string) => void` |
| `components/usecase-gen/shared/output-files.tsx` | 紧凑行布局，行高 32px |

### 需新建的文件

| 文件 | 用途 |
|------|------|
| `components/usecase-gen/shared/file-action-modal.tsx` | 通用文件操作浮窗（下载列表/编辑选择） |

### 不变的文件

- `components/usecase-gen/shared/ai-tweak-panel.tsx` — 交互不变，仅位置下移
- `components/usecase-gen/shared/rating-panel.tsx` — 组件不变，渲染位置从主区移到侧边栏
- `components/usecase-gen/shared/file-preview.tsx` — 预览浮窗不变
- `components/usecase-gen/shared/wizard-section.tsx` — 区块壳不变

## 数据流

### 现有数据流（不变）

```
report API → usecaseTree (state) → ModuleOverviewTable / OutputFiles
                                     ↓
                              scanner / loadedFiles → mergedOutputFiles
```

### 新增数据流

```
ExecutionPanel
  ├── foundFiles → pickLatestFiles → 下载浮窗文件列表
  ├── foundFiles → filter(.xmind) → 编辑浮窗文件列表
  └── taskId → RatingPanel (GET/POST feedback)
```

## 错误处理

- 下载浮窗: 文件列表为空时显示「暂无可下载文件」
- 编辑浮窗: 无 xmind 文件时显示「暂无可编辑的脑图文件」
- 评价面板: GET/POST 失败保持现有降级逻辑不变
- 模块展开: 数据已在内存中，无加载失败场景

## 测试要点

1. **模块手风琴**: 单个展开/折叠、全部展开/全部收起、展开后用例字段完整性
2. **下载浮窗**: 弹出/关闭、文件列表完整性（含 xlsx）、下载触发
3. **编辑浮窗**: 弹出/关闭、xmind 文件列表、跳转编辑器参数正确
4. **评价面板**: 侧边栏渲染、回显、提交、错误状态
5. **数据概览**: 内联数据正确性、评分颜色阈值
6. **输出文件**: 紧凑行布局、按钮按文件类型显示、预览浮窗正常
7. **布局顺序**: 数据概览 → 模块概览 → 输出文件 → AI 微调
