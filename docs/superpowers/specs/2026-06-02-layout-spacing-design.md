# COBALT 布局与间距优化 · 设计文档

> 日期：2026-06-02  
> 状态：待评审  
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

## 二、现状复核（2026-06-02 代码扫描）

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
| `generate-wizard.tsx` | 无（继承 page） | **无**（主区 `flex-1`） | 左主区 + 右 `ExecutionPanel` `w-56` |
| `history-list.tsx` | 根节点 `p-4` | **无** | 与 page `p-6` 叠加 → 实际边距不均 |
| `case-editor.tsx` | 无 | **无** | 左树 `w-72` + 右详情 `flex-1` |
| `dashboard.tsx` | 根节点 `p-6` | **无** | KPI `grid-cols-4` 全宽 |
| `knowledge-base.tsx` | 根节点 `p-6` | **无** | 左筛选 `w-48` + 右内容 |
| `app/page.tsx`（日志列表） | `p-8` | `max-w-4xl mx-auto` | 已有限宽，padding 与全站不一致 |
| `app/skills/page.tsx` | `p-8` | `max-w-4xl mx-auto` | 工具库页，本期可选对齐 |
| `app/tasks/.../execute` | `p-6` | `max-w-3xl mx-auto` | 已合理，本期不动 |
| `app/tasks/.../result` | `p-8` | `max-w-3xl mx-auto` | 本期不动 |
| `execution-panel.tsx` | — | 固定 `w-56` | 预览值 `max-w-[120px] truncate` |

### 2.3 已识别问题

1. **双边距**：`usecase-gen/page` 有 `p-6`，`dashboard` / `knowledge-base` 再有 `p-6`，`history-list` 为 `p-4`。  
2. **宽度策略分裂**：日志列表 `max-w-4xl`，生成向导/看板无上限 → 同产品在宽屏表现不一致。  
3. **表单可读性**：Step 1 `textarea` `w-full` 在超宽主区可达 1000px+。  
4. **右栏过窄**：`w-56`（224px）+ 文案 `max-w-[120px]`，物料来源文件名几乎必截断。  
5. **看板响应式**：KPI `grid-cols-4` 在 ~1280px 内容区易挤压。

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
| Dashboard 图表行 | `grid-cols-3` → `grid-cols-1 lg:grid-cols-3`（可选，视实现时图表高度） |

---

## 五、分页面方案

### 5.1 `app/usecase-gen/page.tsx`（页面容器）

**职责**：唯一滚动区 + 唯一 `p-6`。

```tsx
// 目标结构（示意）
<div className="flex-1 flex flex-col overflow-hidden">
  <div className="flex-1 overflow-auto p-6">
    <div className="mx-auto w-full max-w-7xl">
      {/* Tab 内容 */}
    </div>
  </div>
</div>
```

**说明**：

- 外层 `max-w-7xl` 作为默认上限；子组件可在内部再收紧（见向导）。  
- 历史详情（带「返回列表」+ `GenerateWizard`）同样在该容器内，不额外包 padding。

---

### 5.2 `generate-wizard.tsx`（生成向导）

**结构**（保持）：`flex gap-6` → 左主区 + 右 `ExecutionPanel`。

**左主区按步骤限宽**（在 `flex-1 min-w-0` 内增加包裹层）：

| wizStep | 步骤名 | 包裹 class | 说明 |
|---------|--------|------------|------|
| 0 | 输入物料 | `max-w-3xl w-full` | 步骤条 + 上传 + textarea + 底部按钮同宽 |
| 1 | 关联用例 | `max-w-5xl w-full` | 双列 `grid-cols-2` |
| 2 | 生成并预览 | `max-w-7xl w-full` | KPI 四列、模块表、AI 微调区 |

**步骤条**：与当前步骤内容放在同一 `max-w-*` 容器内，避免步骤条全宽、表单窄宽的不一致。

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
| A1 | `app/usecase-gen/page.tsx` | 增加 `max-w-7xl mx-auto w-full` 包裹层 |
| A2 | `dashboard.tsx` | 移除根 `p-6` / `overflow-auto` |
| A3 | `knowledge-base.tsx` | 移除根 `p-6` / `overflow-auto` |
| A4 | `history-list.tsx` | 移除根 `p-4` / `overflow-auto` |
| A5 | `app/page.tsx` | `p-8` → `p-6` |

**验收**：切换 5 个 Tab，边距视觉一致，无「双层白边」。

---

### 阶段 B：生成向导 + 右栏（高收益）

| # | 文件 | 操作 |
|---|------|------|
| B1 | `generate-wizard.tsx` | 按步骤包裹 `max-w-3xl` / `max-w-5xl` / `max-w-7xl` |
| B2 | `generate-wizard.tsx` | Step 3 KPI 响应式 grid |
| B3 | `execution-panel.tsx` | `w-64`、`max-w-[160px]` |

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
- [ ] 看板 KPI 在 1280px 内容宽度下 2×2 或 1×4 排列正常  

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
  └─ max-w-7xl wrapper
       ├─ GenerateWizard      → 无 p-*
       ├─ HistoryList          → 无 p-*
       ├─ CaseEditor           → 无 p-*
       ├─ Dashboard            → 无 p-*
       └─ KnowledgeBase      → 无 p-*
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

**确认方式**：评审本文件后回复，例如 `D1A D2A D3B D4A D5A`，或直接在文档批注修改决策表。

---

## 十、风险与回滚

| 风险 | 缓解 |
|------|------|
| 去掉子组件 `overflow-auto` 导致双滚动条 | 保留 page 层单一 `overflow-auto`；改后逐 Tab 检查 |
| `max-w-7xl` 导致看板图表变窄 | Step 3 / 看板 intentionally 用宽档；图表 `ResponsiveContainer` 仍 100% |
| 历史详情嵌套向导布局异常 | 返回按钮 + 向导同在 `max-w-7xl` 内，不额外嵌套 padding |

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

*文档版本：v1.0 · 复核基于仓库 main 工作区 2026-06-02*
