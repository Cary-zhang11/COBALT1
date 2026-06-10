# Wizard 优化设计文档

> 日期：2026-06-01

---

## 概述

对用例生成向导（GenerateWizard）进行全面体验优化，涵盖右侧执行面板、工作区布局、文件预览、质量评分时序等维度。

---

## 一、右侧 ExecutionPanel 优化

### 1.1 进度推导逻辑优化

**文件**：`components/usecase-gen/shared/execution-panel.tsx`

**当前问题**：`deriveNodeStates` 每个节点独立判断状态，只看对应文件是否出现。当后续节点（如导出格式）先于前面节点完成时，中间节点仍显示 wait，不符合直觉。

**修改**：两步算法——
1. 先按现有独立判断逻辑算出每个节点的初始状态
2. 从左到右扫描：找到最右侧状态为 `done` 或 `running` 的节点，将其左侧所有节点（无论 `wait` 还是 `running`）强制改为 `done`

```
示例 1（最右侧 done/running 是 done）：
  独立判断: wait, running, wait, done, wait
  层叠后:   done, done,    done, done, wait
  ↑ 节点 3 是 done → 节点 0/1/2 全部强制 done；节点 4 在右侧不受影响

示例 2（最右侧 done/running 是 running）：
  独立判断: wait, running, wait, wait, wait
  层叠后:   done, running, wait, wait, wait
  ↑ 节点 1 是 running → 节点 0 强制 done；节点 1 自身保持 running
```

### 1.2 宽度调整

- 三种模式（配置预览 / 进度节点 / 快捷操作）容器从 `w-48`(192px) → `w-56`(224px)
- 配置预览的「输出格式」值列加 `whitespace-nowrap`，防止「XMind + Markdown」折行

### 1.3 快捷操作按钮调整

去掉 2 个按钮：
- ~~评价~~（删除）
- ~~重新配置~~（删除）

保留 4 个：
1. 下载 Markdown（最新版本文件 — 按 `_v{N}.md` 版本号排序取最高版本）
2. 下载 XMind（最新版本文件 — 按 `_v{N}.xmind` 版本号排序取最高版本）
3. AI 微调（→ `onScrollToAITweak`）
4. 去编辑用例（→ `onNavigateToEditor`）

**最新版本查找**：复用 `hooks/use-output-scanner.ts` 中已有的 `maxXmindVersion` 逻辑，MD 文件同样按 `_v{N}.md` 模式排序。取 `foundFiles` 中版本号最高的文件，而非 `.find()` 返回的第一个。

**同步清理**：
- `ExecutionPanelProps` 接口删除 `onScrollToRating`、`onReconfigure` 字段
- `generate-wizard.tsx` 中删除向 ExecutionPanel 传递这两个回调的代码

---

## 二、工作区布局调整

**文件**：`components/usecase-gen/generate-wizard.tsx`

### 2.1 组件排列顺序（Step 2 结果区）

```
KPI 卡片（4 列）
输出文件（带预览入口）
[去编辑用例 →]                     ← 从底部搬到这里
AI 微调面板
模块用例概览（默认展开）
```

### 2.2 删除

- `RatingPanel` 组件引用（组件文件保留不动，后续可能复用）
- 底部「重新配置」按钮
- 底部整个 `flex justify-between` 按钮区（两个按钮都移走后 div 为空，整体移除）

### 2.3 修改

- `ModuleOverviewTable` 默认 `collapsed = false`（展开，`useState(false)` → `useState(true)`）
- 「去编辑用例」按钮移到 `OutputFiles` 和 `AITweakPanel` 之间，样式不变
- `OutputFiles` 改动：文件名变为可点击按钮（`cursor-pointer`），点击打开 `FilePreviewModal`；Modal 状态（`selectedFile`）由 OutputFiles 内部 `useState` 管理

### 2.4 耗时修复

`onResult` 回调中 `duration` 字段从写死的 `0` 改为读取 `data.duration`（report API 已返回 `task.duration`）。

---

## 三、文件预览功能

### 3.1 交互方式

**Modal 弹窗预览**：点击文件名 → 弹出居中 Modal（`fixed` 遮罩层 + 居中浮层），大窗口预览内容。支持 `Esc` 键关闭，点击遮罩层或 ✕ 按钮关闭。

### 3.2 预览范围

OutputFiles 过滤逻辑调整：**所有 `.md` 和 `.xmind` 文件**均显示并可预览/下载（排除 `_source.md` 中间产物）。

### 3.3 MD 预览

- 通过已有 download API 获取原始内容：`GET /api/tasks/:id/download?file=xxx.md`
- 客户端用 `react-markdown` 渲染为富文本（标题、表格、代码块、列表）
- Modal 内预览区域 `max-h-[70vh]`，超出滚动

### 3.4 XMind 预览

- XMind 文件本质是 ZIP 包，内含 `content.xml`
- 新增轻量 API：`GET /api/tasks/:id/xmind-preview?file=xxx.xmind`
  - 服务端读取 XMind 文件 → 解压 ZIP（`adm-zip`，已有依赖）→ 解析 `content.xml` → 提取 topic 树 → 返回 JSON
- API 返回格式：
  ```json
  {
    "sheets": [
      {
        "title": "Sheet 1",
        "rootTopic": {
          "title": "根节点",
          "children": [
            { "title": "模块1 (5 cases)", "children": [
                { "title": "tc-001 场景A", "children": [] }
              ]}
          ]
        }
      }
    ]
  }
  ```
- 前端渲染为可折叠树形结构（纯 CSS `details`/`summary` 或 Tailwind，不引入额外 UI 库）

### 3.5 组件设计

**FilePreviewModal Props**：

```ts
interface FilePreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;      // 文件名，扩展名决定渲染方式：.md → Markdown，.xmind → 树形结构
  taskId: string | null; // 用于构造 API URL
}
```

Modal 内部根据 `fileName` 扩展名自动判断调用哪个 API：
- `.md` → `GET /api/tasks/:id/download?file=xxx.md` → 原始文本 → `react-markdown` 渲染
- `.xmind` → `GET /api/tasks/:id/xmind-preview?file=xxx.xmind` → JSON 树 → 折叠树渲染

**状态管理**：预览 Modal 的状态（`selectedFile: string | null`）由 `OutputFiles` 组件内部管理。OutputFiles 点击文件名时设置 `selectedFile`，FilePreviewModal 关闭时清空。

---

## 四、质量评分修复

**文件**：`.claude/skills/prd-to-tests-new/references/output_template.md`

**根因**：模板中「10. 生成质量评估」只有定性通过/不通过检查项，无数值评分。前端 `parseSummarySection` 正则 `/质量评[分估].*?(\d+)\s*分/` 匹配不到任何内容，`qualityScore` 始终为 0。

**修复**：在输出模板的「10. 生成质量评估」中添加数值评分行和计算规则：

```markdown
**质量评分：XX分**

> 评分规则：以下 4 项各 25 分，满分 100 分。该项通过得 25 分，不通过得 0 分。

- 步骤数一致性：通过（25分） / 不通过（0分）
- 重复性用例检查：通过（25分） / 不通过（0分）
- 格式规范性检查：通过（25分） / 不通过（0分）
- 术语一致性检查：通过（25分） / 不通过（0分）
```

（✅ 已完成）

---

## 五、改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `components/usecase-gen/shared/execution-panel.tsx` | 修改 | 宽度 w-56 + nowrap；进度层叠 done；快捷操作去评价/重新配置 |
| `components/usecase-gen/generate-wizard.tsx` | 修改 | 去 RatingPanel；模块表默认展开；按钮迁移；duration 修复 |
| `components/usecase-gen/shared/output-files.tsx` | 修改 | 全量 md/xmind 显示；集成预览弹窗入口 |
| `components/usecase-gen/shared/file-preview.tsx` | **新增** | Modal 预览容器 + MD 渲染 + XMind 树 |
| `app/api/tasks/[id]/xmind-preview/route.ts` | **新增** | XMind ZIP 解析 → JSON 树 API |
| `package.json` | 修改 | 新增 `react-markdown` 依赖 |
| `.claude/skills/prd-to-tests-new/references/output_template.md` | ✅ 已完成 | 质量评分模板 |

**不改动**：
- `ai-tweak-panel.tsx`、`rating-panel.tsx`（保留文件，不再引用）、`module-overview-table.tsx`
- `history-list.tsx`、`dashboard.tsx`、`knowledge-base.tsx`、`page.tsx`
- 所有现有 API 路由、hooks、stores

---

## 六、Scope 边界

**本次包含**：
- ExecutionPanel 宽度/进度/快捷操作优化
- 工作区 RatingPanel 移除 + 模块表展开 + 按钮位置调整
- 文件预览 Modal（MD + XMind）
- 质量评分 Prompt 模板修复
- 耗时字段对接

**本次不包含**：
- Step 1 数据对接（最近需求/few-shot 接入真实数据）
- Step 0/1 UI 改动
- AI 微调 / 历史列表 / 用例编辑器 / 数据看板改动
- XMind 交互式思维导图渲染（仅树形结构预览）
