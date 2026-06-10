# COBALT 布局与间距优化 · 设计文档

> 日期：2026-06-02  
> 状态：待评审（v1.1 已复核）  
> 类型：布局微调（不改配色、不重做组件库）  
> 关联技能：`ui-ux-pro-max`、`web-design-guidelines`、`tailwind-design-system`

---

## 一、概述

### 1.1 目标

在**保持现有视觉风格**（紫色 primary、蓝青 Sidebar、卡片圆角与阴影）的前提下，统一各页面的**内容宽度、外边距、分栏比例**，解决：

- 宽屏下表单/文本区域横向拉得过宽，阅读与操作不舒适  
- 各 Tab 页面 `padding` 不一致，出现「双边距」或边距缺失  
- 列表类页面有的居中限宽、有的全宽铺满，体验不统一  
- 生成向导右侧配置/进度面板过窄，文案频繁截断  

### 1.2 非目标（明确不做）

| 不做项 | 说明 |
|--------|------|
| 品牌色 / 主题重构 | 不调整 `globals.css` token、Sidebar 渐变 |
| 组件库扩充 | 不批量引入 shadcn 组件 |
| 暗色模式 | 本期不增加 `dark` 主题 |
| 登录/注册页 | 独立全屏布局，本期不纳入 |
| Sidebar 折叠 / 响应式大改 | `w-64` 维持不变 |
| 业务逻辑变更 | 仅 Tailwind className 与 DOM 包裹层 |

---

## 二、现状复核（2026-06-02 最新代码扫描）

> 扫描命令：`rg "overflow-auto|max-w-|p-[468]|w-56|w-64|w-72|w-48" app components/usecase-gen --glob "*.tsx"`

### 2.1 全局骨架

```
RootLayout (app/layout.tsx)
├── Sidebar          w-64, border-r
└── main             flex-1, overflow-hidden
    └── {children}   各页面自行定义 padding / max-width
```

### 2.2 各页面布局现状

| 路由 / 组件 | 外层 padding | 内容 max-width | 分栏 / 备注 |
|-------------|--------------|----------------|-------------|
| `app/usecase-gen/page.tsx` | `p-6` | **无** | 5 个 Tab 子组件直接渲染 |
| `generate-wizard.tsx` | 无（继承 page） | **无**（主区 `flex-1`） | 左主区 + 右 `ExecutionPanel` `w-56`；**外层与左列均有 `overflow-auto`（双滚动风险）** |
| `history-list.tsx` | 根节点 `p-4` | **无** | 与 page `p-6` 叠加 → 实际边距不均 |
| `case-editor.tsx` | 无 | **无** | 左树 `w-72` + 右详情 `flex-1` |
| `dashboard.tsx` | 根节点 `p-6` | **无** | KPI `grid-cols-4` 全宽 |
| `knowledge-base.tsx` | 根节点 `p-6` | **无** | 左筛选 `w-48` + 右内容 |
| `app/page.tsx`（日志列表） | `p-8` | `max-w-4xl mx-auto` | 已有限宽，padding 与全站不一致 |
| `app/skills/page.tsx` | `p-8` | `max-w-4xl mx-auto` | 工具库页，本期可选对齐 |
| `app/tasks/.../execute` | `p-6` | `max-w-3xl mx-auto` | 已合理，本期不动 |
| `app/tasks/.../result` | `p-8` | `max-w-3xl mx-auto` | 本期不动 |
| `execution-panel.tsx` | — | 固定 `w-56` | 预览值 `max-w-[120px] truncate`；`sticky top-20` |
| `app/tasks/.../execute` 右栏 | — | — | 已有 `w-64`（与 ExecutionPanel 目标宽度一致，可对齐） |

### 2.3 自 v1.0 以来代码变化（需纳入方案）

| 变更 | 位置 | 对方案的影响 |
|------|------|--------------|
| Step 2 增加搜索 + 业务类型筛选 + 分页加载 | `generate-wizard.tsx` L551–677 | `max-w-5xl` 仍合适；双列在窄屏需 `grid-cols-1 lg:grid-cols-2`；列表区 `max-h-64` 建议改为 `max-h-80` |
| 知识库模块重构（平台预览、分配类型等） | `knowledge-base.tsx` | 根节点仍为 `flex-1 overflow-auto p-6`，去 padding 方案仍有效 |
| 空状态组件仍带 `p-8` | `history-list`、`case-editor`、`generate-wizard` | 去掉根 padding 后，空状态应改为 `py-16` 而非 `p-8`，避免边距回弹 |

### 2.4 已识别问题

1. **双边距**：`usecase-gen/page` 有 `p-6`，`dashboard` / `knowledge-base` 再有 `p-6`，`history-list` 为 `p-4`。  
2. **多层滚动**：`page` → `generate-wizard` 外层 → 左列，三层均可滚动，易出现嵌套滚动条。  
3. **宽度策略分裂**：日志列表 `max-w-4xl`，生成向导/看板无上限 → 同产品在宽屏表现不一致。  
4. **表单可读性**：Step 1 `textarea` `w-full` 在超宽主区可达 1000px+（理想阅读宽度约 600–768px）。  
5. **右栏过窄**：`w-56`（224px）+ 文案 `max-w-[120px]`，物料来源文件名几乎必截断。  
6. **看板响应式**：KPI `grid-cols-4`、图表 `grid-cols-3` 在 ~1280px 内容区易挤压。  
7. **Step 2 双列无断点**：`grid-cols-2` 在 `< lg` 时两栏过窄，筛选控件易换行错乱。

---

## 三、设计原则

1. **单一 padding 源**：滚动容器只在页面级（或 `usecase-gen/page`）设置 `p-6`，子 Feature 组件不再根节点 `p-*`。  
2. **按内容类型限宽**：表单窄、列表中、看板/编辑宽。  
3. **居中优先**：内容区默认 `mx-auto w-full`（待评审项：可改为左对齐 `mr-auto`）。  
4. **最小 diff**：只改 className 与必要的包裹 `div`，不抽公共 Layout 组件（除非二期需要）。  
5. **与已有页面一致**：任务执行页已用 `max-w-3xl`，生成向导 Step 1 应对齐该习惯。

---

## 四、布局规范（Design Tokens · 布局层）

> 本期不新增 CSS 变量，仅在 Tailwind 层约定；二期可沉淀到 `lib/layout.ts` 常量。

### 4.1 内容宽度档位

| 档位 | Tailwind | 像素约值 | 用途 |
|------|----------|----------|------|
| 窄 | `max-w-4xl` | 896px | 日志列表、历史记录 |
| 中 | `max-w-3xl` | 768px | 生成向导 Step 1、空状态 |
| 中宽 | `max-w-5xl` | 1024px | 生成向导 Step 2（双列勾选） |
| 宽 | `max-w-7xl` | 1280px | 看板、用例编辑、知识库、向导 Step 3 |

### 4.2 间距

| 项 | 值 | 说明 |
|----|-----|------|
| 页面内边距 | `p-6`（24px） | 全站主内容区统一；`app/page.tsx` 由 `p-8` 改为 `p-6` |
| 分栏间隙 | `gap-4` / `gap-6` | 保持现有：向导主区与右栏 `gap-6`，编辑/知识库 `gap-4` |
| 区块间距 | `space-y-4` / `mb-6` | 不改，仅随容器限宽自然收敛 |

### 4.3 分栏宽度

| 组件 | 现状 | 目标 |
|------|------|------|
| Sidebar | `w-64` | 不变 |
| ExecutionPanel | `w-56` | `w-64`（256px） |
| 配置预览文案 | `max-w-[120px]` | `max-w-[160px]` |
| CaseEditor 左树 | `w-72` | 不变（可选 `w-80` 二期） |
| KnowledgeBase 左筛选 | `w-48` | `w-52`（208px，可选） |

### 4.4 响应式（本期最小集）

| 位置 | 改动 |
|------|------|
| Dashboard KPI | `grid-cols-4` → `grid-cols-2 lg:grid-cols-4` |
| Dashboard 图表行 | `grid-cols-3` → `grid-cols-1 lg:grid-cols-3` |
| 向导 Step 2 双列 | `grid-cols-2` → `grid-cols-1 lg:grid-cols-2` |
| 向导 Step 2 列表区 | `max-h-64` → `max-h-80`（筛选行占用高度后仍够显示条目） |

### 4.5 与 Tailwind Container 档位对照（skill 参考）

| 本项目约定 | Tailwind | 约 px | tailwind-design-system Container |
|------------|----------|-------|----------------------------------|
| 中 | `max-w-3xl` | 768 | ≈ `max-w-screen-md` |
| 中宽 | `max-w-5xl` | 1024 | ≈ `max-w-screen-lg` |
| 窄 | `max-w-4xl` | 896 | 介于 lg–xl |
| 宽 | `max-w-7xl` | 1280 | ≈ `max-w-screen-xl` |

本期不引入 `Container` 组件，仅用 className；二期可沉淀为 `components/layout/page-container.tsx`。

---

## 五、分页面方案

### 5.1 `app/usecase-gen/page.tsx`（页面容器）

**职责**：唯一滚动区 + 唯一 `p-6`。

```tsx
// 目标结构（示意 — v1.1）
<div className="flex-1 flex flex-col overflow-hidden">
  <div className="flex-1 overflow-auto p-6">
    {/* 按 Tab 选择容器宽度，见第十四章 */}
    {isWizardTab ? (
      <div className="w-full">{children}</div>
    ) : isHistoryList ? (
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    ) : (
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    )}
  </div>
</div>
```

**说明**：

- v1.0「全 Tab 包 `max-w-7xl`」在 Step 2 宽度验算下会溢出，v1.1 改为分 Tab 策略。  
- 历史详情（带「返回列表」+ `GenerateWizard`）走 `w-full` 向导容器。

---

### 5.2 `generate-wizard.tsx`（生成向导）

**结构**（保持）：`flex gap-6` → 左主区 + 右 `ExecutionPanel`。

**左主区按步骤限宽**（步骤条与步骤内容**同一包裹层**，动态 class）：

```tsx
// 示意：包在 flex-1 min-w-0 内，去掉左列 overflow-auto
const stepWidth =
  wizStep === 0 ? "max-w-3xl" :
  wizStep === 1 ? "max-w-5xl" :
  "max-w-7xl";

<div className={cn("w-full", stepWidth)}>
  {/* Step Bar */}
  {/* Step content */}
</div>
```

| wizStep | 步骤名 | 包裹 class | 说明 |
|---------|--------|------------|------|
| 0 | 输入物料 | `max-w-3xl w-full` | 步骤条 + 上传 + textarea + 底部按钮同宽 |
| 1 | 关联用例 | `max-w-5xl w-full` | 双列 `grid-cols-1 lg:grid-cols-2` + 搜索/筛选 |
| 2 | 生成并预览 | `max-w-7xl w-full` | KPI、模块表、AI 微调区 |

**滚动层级修正（v1.1 新增）**：

| 层级 | 现状 | 目标 |
|------|------|------|
| `usecase-gen/page` | `overflow-auto p-6` | **保留**（唯一页面级滚动） |
| `generate-wizard` 外层 | `overflow-auto min-h-0` | 改为 `min-h-0`（去掉 overflow-auto） |
| 向导左列 | `overflow-auto` | 去掉；内容随 page 滚动 |
| ExecutionPanel | `sticky top-20` | 保留（依赖 page 级滚动） |
| case-editor 树/详情 | `overflow-y-auto` | 保留（编辑区内局部滚动合理） |

**右侧面板决策（默认方案）**：

- Step 0/1/2：**保留** `ExecutionPanel`（配置预览 / 进度 / 快捷操作按现有逻辑切换）。  
- 宽度：`w-56` → `w-64`（在 `execution-panel.tsx` 统一修改）。

**Step 3 KPI 网格**：

- `grid-cols-4` → `grid-cols-2 xl:grid-cols-4`（在 `max-w-7xl` 内）。

**未配置 skill 空状态**：维持 `max-w-md` 居中，可去掉多余 `p-8`（由 page 提供 padding）。

---

### 5.3 `execution-panel.tsx`

| 模式 | 变更 |
|------|------|
| 所有 `w-56 flex-shrink-0` | 改为 `w-64 flex-shrink-0` |
| 配置项 value `max-w-[120px]` | 改为 `max-w-[160px]` |
| `sticky top-20` | 不变 |

---

### 5.4 `history-list.tsx`

| 项 | 现状 | 目标 |
|----|------|------|
| 根节点 | `flex-1 overflow-auto p-4` | 去掉 `overflow-auto p-4`，仅内容 |
| 列表容器 | 无 max-width | 包一层 `max-w-4xl mx-auto w-full` |
| 空状态 | `max-w-xs` | 保留 |

与 `app/page.tsx` 日志列表视觉对齐。

---

### 5.5 `dashboard.tsx`

| 项 | 变更 |
|----|------|
| 根节点 `flex-1 overflow-auto p-6` | 去掉，改为普通 `div` 或 fragment |
| 内容 | 依赖 page 的 `max-w-7xl`；或内部再包 `w-full` |
| KPI grid | `grid-cols-2 lg:grid-cols-4` |

---

### 5.6 `knowledge-base.tsx`

| 项 | 变更 |
|----|------|
| 根节点 `p-6` | 去掉 |
| 左筛选栏 | `w-48` → `w-52`（可选，评审时确认） |
| 整体 | 在 page `max-w-7xl` 内自然限宽 |

---

### 5.7 `case-editor.tsx`

| 项 | 变更 |
|----|------|
| 根布局 | 无额外 padding |
| 三栏区域 | 整体已在 `max-w-7xl` 内；左树 `w-72` 不变 |
| 底部保存栏 | 布局不变；窄屏时说明文案可用 `hidden lg:block`（可选） |

---

### 5.8 `app/page.tsx`（日志列表）

| 项 | 变更 |
|----|------|
| `p-8` | → `p-6` |
| `max-w-4xl mx-auto` | 保持 |

---

### 5.9 本期不改动页面

| 页面 | 原因 |
|------|------|
| `app/login/page.tsx`、`register` | 独立全屏，硬编码 gray 不影响主应用路径 |
| `app/tasks/[id]/execute`、`result` | 已有 `max-w-3xl` |
| `app/tasks/new/page.tsx` | 同上 |
| `components/sidebar.tsx` | 宽度合理 |
| `app/layout.tsx` | 骨架无需改 |

---

## 六、实施计划

### 阶段 A：容器与 padding 统一（低风险）

| # | 文件 | 操作 |
|---|------|------|
| A1 | `app/usecase-gen/page.tsx` | **按 Tab 分容器宽度**（见第十四章），统一 `p-6` |
| A2 | `dashboard.tsx` | 移除根 `p-6` / `overflow-auto` |
| A3 | `knowledge-base.tsx` | 移除根 `p-6` / `overflow-auto` |
| A4 | `history-list.tsx` | 移除根 `p-4` / `overflow-auto` |
| A5 | `app/page.tsx` | `p-8` → `p-6` |

**验收**：切换 5 个 Tab，边距视觉一致，无「双层白边」。

---

### 阶段 B：生成向导 + 右栏（高收益）

| # | 文件 | 操作 |
|---|------|------|
| B1 | `generate-wizard.tsx` | 动态 `max-w-*` 包裹步骤条+内容；去掉嵌套 `overflow-auto` |
| B2 | `generate-wizard.tsx` | Step 2 响应式 grid + `max-h-80`；Step 3 KPI 响应式 grid |
| B3 | `execution-panel.tsx` | `w-64`、`max-w-[160px]` |
| B4 | `generate-wizard.tsx` 等 | 空状态 `p-8` → `py-16`（history-list、case-editor 同步） |

**验收**：

- 1920px 宽屏：Step 1 表单宽约 768px，右侧配置可读。  
- Step 2 双列不挤、不溢出。  
- Step 3 表格与 KPI 在 1280px 容器内正常。

---

### 阶段 C：列表与看板细调

| # | 文件 | 操作 |
|---|------|------|
| C1 | `history-list.tsx` | `max-w-4xl mx-auto w-full` |
| C2 | `dashboard.tsx` | KPI / 图表响应式 grid |
| C3 | `knowledge-base.tsx` | 可选 `w-52` 左栏 |

**验收**：历史记录与日志列表宽度观感一致；看板 1280px 窗口 KPI 不换行错乱。

---

### 建议实施顺序

```
A1 → A2–A5 → B1–B3 → C1–C3
```

预估改动：**7 个文件**，约 **40–60 处 className**，无 API / 状态逻辑变更。

---

## 七、验收标准

### 7.1 视觉

- [ ] 用例生成 5 个 Tab 左右边距一致（24px）  
- [ ] 日志列表与历史记录列表最大宽度一致（`max-w-4xl`）  
- [ ] 生成向导 Step 1 在 1920×1080 下主表单区 ≤ 768px  
- [ ] 右侧面板物料来源名称截断明显减少  
- [ ] 向导 Step 2 在 1280px 内容区无横向溢出（page 层向导 Tab 用 `w-full`）  
- [ ] 切换 Tab 无嵌套双滚动条（尤其用例生成）  

### 7.2 功能回归

- [ ] 向导三步流转、上传、勾选知识库/历史、生成、预览不受影响  
- [ ] 历史记录点击、展开失败信息正常  
- [ ] 用例编辑树展开、选中、保存提示正常  
- [ ] 知识库 Tab 切换、上传、预览弹窗正常  

### 7.3 测试

- 无新增单元测试要求（纯样式）  
- 手动走查上述路径即可  

---

## 八、布局示意

### 8.1 生成向导 Step 1（1920px 视口）

```
┌─ Sidebar w-64 ─┬────────────────── Main (p-6) ──────────────────────────────┐
│                │  ┌──────────── max-w-7xl (page) ────────────────────────┐  │
│                │  │ ┌──── max-w-3xl ────────────┐  ┌── ExecutionPanel ─┐ │  │
│                │  │ │ Step bar                  │  │ w-64              │ │  │
│                │  │ │ Upload card               │  │ 当前配置预览       │ │  │
│                │  │ │ Textarea card             │  │                   │ │  │
│                │  │ │              [下一步 →]   │  │                   │ │  │
│                │  │ └───────────────────────────┘  └───────────────────┘ │  │
│                │  └──────────────────────────────────────────────────────┘  │
└────────────────┴──────────────────────────────────────────────────────────────┘
```

### 8.2 页面 padding 责任链（改后）

```
usecase-gen/page.tsx     →  overflow-auto + p-6  （唯一）
  ├─ w-full              →  GenerateWizard / 历史详情向导
  ├─ max-w-4xl mx-auto   →  HistoryList
  └─ max-w-7xl mx-auto   →  CaseEditor / Dashboard / KnowledgeBase
       └─ 各组件           →  无根节点 p-*
```

---

## 九、决策记录（默认方案 · 待你确认）

| ID | 议题 | 默认决策 | 备选 |
|----|------|----------|------|
| D1 | 内容对齐 | `mx-auto` 居中 | `mr-auto` 左对齐 |
| D2 | Step 0/1 右栏 | 保留，`w-64` | Step 0/1 隐藏右栏 |
| D3 | 实施范围 | 阶段 A + B + C 全做 | 仅 A + B |
| D4 | 日志列表宽度 | 维持 `max-w-4xl` | 改为 `max-w-5xl` |
| D5 | 知识库左栏 | `w-48` → `w-52` | 保持 `w-48` |
| D6 | page 容器策略 | **分 Tab 限宽**（第十四章） | 全 Tab 统一 `max-w-7xl` |

**确认方式**：评审本文件后回复，例如 `D1A D2A D3B D4A D5A D6A`，或直接在文档批注修改决策表。

---

## 十、风险与回滚

| 风险 | 缓解 |
|------|------|
| 去掉子组件 `overflow-auto` 导致双滚动条 | 保留 page 层单一 `overflow-auto`；向导去掉双层 overflow；改后逐 Tab 检查 |
| `max-w-7xl` 导致看板图表变窄 | Step 3 / 看板 intentionally 用宽档；图表 `ResponsiveContainer` 仍 100% |
| 历史详情嵌套向导布局异常 | 返回按钮 + 向导走 `w-full` 容器，不额外嵌套 padding |
| Step 2 主区+右栏宽度超出 page | 向导 Tab 不用 `max-w-7xl` 封顶（见第十四章验算） |

回滚：均为 className 改动，按文件 `git checkout` 即可。

---

## 十一、后续（二期，不在本期）

- 抽取 `PageContainer` / `layout-width.ts` 常量，避免 magic class 分散  
- 登录/注册页改用 design token（`bg-background` 等）  
- Sidebar 可折叠、`xl` 断点统一断点表  
- `app/skills/page.tsx` padding 与 `max-w-*` 与日志列表对齐  

---

## 十二、文件变更清单（汇总）

| 文件 | 阶段 | 变更摘要 |
|------|------|----------|
| `app/usecase-gen/page.tsx` | A | `max-w-7xl mx-auto w-full` |
| `app/page.tsx` | A | `p-8` → `p-6` |
| `components/usecase-gen/dashboard.tsx` | A,C | 去根 padding；响应式 grid |
| `components/usecase-gen/knowledge-base.tsx` | A,C | 去根 padding；可选 `w-52` |
| `components/usecase-gen/history-list.tsx` | A,C | 去根 padding；`max-w-4xl` |
| `components/usecase-gen/generate-wizard.tsx` | B | 分步骤 `max-w-*`；KPI grid |
| `components/usecase-gen/shared/execution-panel.tsx` | B | `w-64`、`max-w-[160px]` |
| `components/usecase-gen/case-editor.tsx` | C | 可选文案 `hidden lg:block` |

**不变**：`app/layout.tsx`、`sidebar.tsx`、任务相关页面、登录注册。

---

## 附录 A：复核命令（实施前可选）

```bash
# 确认 padding / max-w 分布
rg "overflow-auto p-|max-w-|w-56|w-72|w-48" app components/usecase-gen --glob "*.tsx"
```

---

## 十三、Skill 复核结论（v1.1）

> 复核依据：`ui-ux-pro-max`、`web-design-guidelines`（Vercel 布局/可读性原则）、`tailwind-design-system`（Container / 响应式 Grid 模式）

### 13.1 方案有效性 ✅

| 原方案项 | Skill 依据 | 结论 |
|----------|------------|------|
| 表单 Step 1 用 `max-w-3xl`（~768px） | 表单/正文理想阅读宽度 600–800px；与任务页 `max-w-3xl` 一致 | **维持** |
| 单一 `p-6` padding 源 | Container 模式：`mx-auto w-full px-*` 只在一层定义 | **维持** |
| 列表 `max-w-4xl` 居中 | 列表扫描型内容不宜过宽 | **维持** |
| 看板/编辑 `max-w-7xl` | 图表与双栏编辑需要更宽内容区 | **维持** |
| KPI / 图表响应式断点 | tailwind-design-system Grid `cols` variants | **维持，并扩展到 Step 2 双列** |

### 13.2 方案需补充 ⚠️ → 已写入 v1.1

| 发现 | 处理 |
|------|------|
| 向导三层 `overflow-auto` | 阶段 B 去掉 wizard 外层与左列 overflow，仅 page 滚动 |
| Step 2 新增筛选 UI | 双列加 `lg:` 断点；列表 `max-h-80` |
| 空状态仍 `p-8` | 阶段 B4 统一为 `py-16` |
| ExecutionPanel → `w-64` | 与 `tasks/execute` 右栏 `w-64` 对齐，**增强一致性** |
| 本期不建 Container 组件 | 符合「最小 diff」；二期再抽象 |

### 13.3 方案刻意不做 ❌（skill 未推翻）

| 项 | 原因 |
|----|------|
| 改 CSS 变量 / 语义色 | 超出布局 scope；tailwind-design-system token 层级留二期 |
| 登录页 token 化 | ui-ux 一致性问题存在，但非主路径 |
| `prose` 最大宽度 | 仅 markdown 预览区已有 `prose-sm max-w-none`，无需动 |
| 暗色模式 spacing | 不在本期 |

### 13.4 1920px 视口宽度验算

```
视口 1920px
− Sidebar w-64          256px
− main padding p-6×2     48px
= 内容区可用            1616px
→ page max-w-7xl 封顶   1280px

向导 Step 1（在 1280 内）:
  max-w-3xl 768 + gap-6 24 + ExecutionPanel w-64 256 = 1048px ✅ 有余量

向导 Step 2:
  max-w-5xl 1024 + gap-6 24 + w-64 256 = 1304px ⚠️ 略超 1280
```

**结论**：Step 2 在 `max-w-7xl` page 容器内，主区 `max-w-5xl` + 右栏 `w-64` 合计可能超出 page 上限约 24px。

**修正（v1.1）**：Step 2 主区改用 `max-w-4xl lg:max-w-5xl`，或 page 层对向导 Tab 不设 `max-w-7xl` 上限（仅 `w-full`），由向导内部按 step 控宽。推荐后者：

```tsx
// usecase-gen/page.tsx — Tab 分宽度策略
{activeTab === 0 || (activeTab === 1 && taskId) ? (
  <div className="w-full">{/* 向导：内部按 step 限宽 */}</div>
) : activeTab === 1 ? (
  <div className="mx-auto w-full max-w-4xl">{/* 历史列表 */}</div>
) : (
  <div className="mx-auto w-full max-w-7xl">{/* 编辑/看板/知识库 */}</div>
)}
```

---

## 十四、修订后的 page 容器策略（v1.1）

| Tab | 容器 class | 原因 |
|-----|------------|------|
| 用例生成（向导） | `w-full`（无限宽封顶） | Step 2 需容纳 `max-w-5xl + w-64 + gap` |
| 历史记录（列表） | `max-w-4xl mx-auto w-full` | 与日志列表一致 |
| 历史详情（向导） | `w-full` | 同用例生成 |
| 用例编辑 / 看板 / 知识库 | `max-w-7xl mx-auto w-full` | 宽内容区 |

**替代 v1.0**「全 Tab 统一 `max-w-7xl`」——避免 Step 2 宽度验算溢出。

---

*文档版本：v1.1 · 复核基于工作区最新代码 + 三份 layout skill · 2026-06-02*
