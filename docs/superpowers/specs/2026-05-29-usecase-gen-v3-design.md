# Usecase-Gen V3 设计文档

## 概述

优化用例生成页面布局，增加 AI 微调和用户评价功能。

### 背景

- Step 3（生成结果页）存在两个入口：wizard 逐步进入、历史记录直接加载
- 右侧 sidebar 从历史进入时展示执行轨迹无意义
- 模块用例概览表占空间大但用处有限
- 用户需要生成后微调用例 + 评价生成质量

---

## 架构

### 右侧 sidebar 三种状态

Sidebar 不消失，内容根据 `wizStep` 和 `generating` 状态切换。宽度从当前 `w-80` (320px) 缩窄为 `w-56` (224px) 或 `w-48` (192px)。

| 条件 | 内容 | 说明 |
|------|------|------|
| `wizStep < 2` | 当前配置预览 | 不变，已实现 |
| `wizStep === 2 && generating` | 轻量进度指示器 | 5 节点竖排，节点状态沿用现有 `deriveNodeStates(foundFiles, generating)` 逻辑，只改变渲染形式：去掉描述文字 + 日志流，改为纯圆点+名称 |
| `wizStep === 2 && !generating` | 快捷操作面板 | 6 个按钮（见下文），全部直接触发动作 |

历史记录入口直接进入 `wizStep=2, generating=false`，自然使用快捷操作面板，无执行轨迹。

### 主区 Step 3 布局顺序

```
KPI 卡片（4 列）
输出文件（仅 .md + .xmind，带下载）
AI 微调面板
评价面板
模块用例概览（默认折叠）
─────────────────
[重新配置]          [去编辑用例 →]
```

注：底部「重新配置」和「去编辑用例」与右侧快捷操作是**同一动作的多入口**，行为一致，不互斥。

### Step 3 主区渲染分支

当前代码在 Step 3 中先判断 `generating` 显示大 spinner，这会掩盖 tweak 期间已有的 `usecaseTree`。需要区分两种 generating 场景：

| 条件 | 渲染 | 说明 |
|------|------|------|
| `generating && !usecaseTree` | 大 spinner（现有逻辑） | 首次生成，还没有结果 |
| `generating && usecaseTree` | 已有结果 + 顶部「微调中...」banner | tweak 期间，保留结果可见 + 进度提示 |
| `!generating && usecaseTree` | 正常结果展示 | 生成/微调完成 |

右侧 sidebar 仅依赖 `wizStep` 和 `generating`，不依赖 `usecaseTree`，所以 tweak 期间自动切换到 Progress Dots 模式。

### 组件树

```
page.tsx
├── GenerateWizard
│   ├── StepBar（不变）
│   ├── Step 0/1（不变）
│   ├── Step 3
│   │   ├── KpiCards（不变）
│   │   ├── OutputFiles（提取为独立组件）
│   │   ├── AITweakPanel（新增）
│   │   ├── RatingPanel（新增）
│   │   ├── ModuleOverviewTable（改为可折叠）
│   │   └── ActionButtons（不变）
│   └── Sidebar (w-48 ~ w-56)
│       └── ExecutionPanel（改造：三种状态切换）
└── HistoryList（不变）
```

---

## 组件设计

### 1. OutputFiles（从 generate-wizard 抽离）

**Props**:
```ts
interface OutputFilesProps {
  taskId: string | null;
  files: string[];  // 已过滤 _source，保留 .md 和 .xmind 的实际文件名
}
```

**行为**:
- 仅显示匹配 `测试用例` 且扩展名为 `.md` 或 `.xmind` 的文件（过滤 _source.md）
- 每个文件带下载按钮，调用 `GET /api/tasks/:id/download?file=<实际文件名>`（已有 API）
- `taskId` 为 null 时按钮禁用
- 生成中（文件列表为空）显示「生成中...」占位文本
- 下载使用实际文件名而非硬编码

### 2. AITweakPanel（新增）

**Props**:
```ts
interface AITweakPanelProps {
  taskId: string | null;
  generating: boolean;
  modules: string[];  // 已生成模块名列表，用于 scope 选择。生成中为空数组
  onTweakStarted: () => void;  // 微调启动时通知父组件重新进入 generating 状态
}
```

**UI 结构**:
1. Quick chips 栏：补充边界场景 / 增加异常覆盖 / 精简步骤描述 / 提升P0覆盖率 / 增加安全场景 / 补充兼容测试
2. Scope 下拉：全部模块 + 各模块名。生成中（modules 为空）只显示「全部模块」且禁用下拉
3. 输入框 + 发送按钮
4. 对话历史（可滚动，max-h 限制）

**交互**:
| 时机 | 点击 chip | 发送自定义指令 |
|------|----------|--------------|
| 生成中 | 填入输入框 | `POST /api/tasks/:id/inject` → 注入到 CLI stdin |
| 完成后 | 填入输入框 | `POST /api/tasks/:id/tweak` → 在已有用例上开对话会话修改，同一 taskId |

**注入 API**（生成中）:
```
POST /api/tasks/:id/inject
Body: { instruction: string, scope?: string }
→ 向 Claude CLI session stdin 写入指令文本
→ 200 { accepted: true }
→ 前端在对话历史追加 "You: <instruction>" + 等待 AI 响应（通过 SSE 日志流显示）
```

**微调 API**（完成后）:
```
POST /api/tasks/:id/tweak
Body: { instruction: string, scope?: string }
→ 后端启动一个基于已有用例的对话会话（非重新生成）
→ CLI 上下文包含：原需求 input + 已生成的测试用例 + 微调指令
→ AI 在已有用例基础上修改，更新输出文件
→ 200 { accepted: true }
→ 前端调用 onTweakStarted()，父组件 setGenerating(true)（taskId 不变）
→ scanner 继续轮询同一 taskId，检测到文件变化后触发 onResult，更新 tree + stats
```

**微调完整闭环**（在已有用例基础上对话修改，taskId 不变）:
```
用户发送指令（如「给登录模块补充异常场景」）
  → POST /api/tasks/:id/tweak
  → 后端启动 CLI 会话，上下文 = 原需求 + 已有测试用例 + 用户指令
  → AI 在已有用例基础上修改，更新 output 文件
  → generate-wizard: setGenerating(true)
  → scanner 轮询检测到文件更新 → onResult → 更新 usecaseTree + genStats
  → 用户可继续发送第二条微调指令，多轮对话逐步优化
```

**Scope 的作用**:
- 全部模块：指令直接发送
- 单个模块（如「登录模块」）：指令拼接 `仅针对"登录模块"`

**Quick chips**:
- 点击不直接发送，填入输入框
- 用户可编辑后手动发送

### 3. RatingPanel（新增）

**Props**:
```ts
interface RatingPanelProps {
  taskId: string | null;
}
```

**UI**:
- 5 颗星星可点击选择
- 提交按钮
- 提交后显示「已提交」状态，无法再次提交

**状态逻辑**:
- `taskId` 为 null → 不渲染面板（没有必要 ID 无法提交评价）
- `taskId` 有效 + 未评分 → 星星空心可点击 + 提交按钮
- `taskId` 有效 + 已评分 → 星星实心 + 「已提交」

**API**（已有，只需 UI 对接）:
```
POST /api/tasks/:id/feedback
Body: { rating: 1-5, comment?: string }
→ 201 { feedback: { id, taskId, userId, rating, comment } }
```

### 4. ModuleOverviewTable（改造）

**Props**（不变）:
```ts
interface ModuleOverviewTableProps {
  modules: UsecaseModule[];
  totalCases: number;
}
```

**改动**:
- 默认 `collapsed`，只显示标题栏「模块用例概览 (X 模块 · Y 用例) ▼」
- 点击标题栏展开表格内容
- 再次点击/点击外部折叠
- 内部表格内容不变

### 5. ExecutionPanel（改造）

**Props**（新增快捷操作回调）:
```ts
interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  wizStep: number;
  hasResult: boolean;
  configSummary: { source: string; capabilities: string; dimensions: string; fewShot: string; };
  foundFiles: string[];
  // 快捷操作回调（仅 Quick Actions 模式使用）
  onDownloadFile: (fileName: string) => void;
  onScrollToAITweak: () => void;
  onScrollToRating: () => void;
  onNavigateToEditor: () => void;
  onReconfigure: () => void;
}
```

**三种渲染模式**:

1. **Config Preview** (`wizStep < 2`):
   - 与当前一致

2. **Progress Dots** (`wizStep === 2 && generating`):
   - 标题：脉冲圆点 + "生成中"
   - 5 节点竖排，节点状态沿用 `deriveNodeStates(foundFiles, generating)`
   - 渲染改为轻量形式：每节点 6px 圆点 + 10px 名称，节点间虚线
   - 已完成：绿色圆点；当前：紫色圆点+光晕+加粗；等待：灰色圆点+opacity
   - **去掉**描述文字（desc）、去掉 SSE 日志流区域

3. **Quick Actions** (`wizStep === 2 && !generating`):
   - 6 个竖排按钮：
     1. ⬇ 下载测试用例.md（取 foundFiles 中匹配 .md 的）
     2. ⬇ 下载测试用例.xmind（取 foundFiles 中匹配 .xmind 的）
     3. 🤖 AI 微调（→ `onScrollToAITweak`，滚动到主区 AITweakPanel）
     4. ⭐ 评价（→ `onScrollToRating`，滚动到主区 RatingPanel）
     5. ✏️ 去编辑用例（→ `onNavigateToEditor`）
     6. 🔧 重新配置（→ `onReconfigure`）
   - 所有按钮直接触发动作，无需二次确认

---

## 数据流

```
generate-wizard 持有：
  taskId, generating, usecaseTree, loadedFiles, scanner.foundFiles

ExecutionPanel：
  接收 wizStep, generating, hasResult, configSummary, foundFiles + 5 个回调
  节点状态由 deriveNodeStates(foundFiles, generating) 推导（已有逻辑）
  下载回调传入实际文件名：onDownloadFile(actualFileName)

AITweakPanel：
  接收 taskId, generating, modules(=usecaseTree 的模块名列表，生成中为空)
  微调发送 → POST /api/tasks/:id/tweak → onTweakStarted()
  父组件 setGenerating(true)，taskId 不变 → scanner 继续轮询同一 taskId

RatingPanel：
  接收 taskId
  taskId 为 null → 不渲染
  taskId 有效 → POST /api/tasks/:id/feedback

OutputFiles：
  接收 taskId, files（合并 scanner.foundFiles + loadedFiles，过滤 _source 和格式）
  下载 URL 使用实际文件名拼接
```

### 回调实现（GenerateWizard 内部）

```ts
const actualMdFile = [...scanner.foundFiles, ...loadedFiles]
  .find(f => f.includes("测试用例") && f.endsWith(".md"));
const actualXmindFile = [...scanner.foundFiles, ...loadedFiles]
  .find(f => f.endsWith(".xmind"));

const handleDownloadFile = (fileName: string) => {
  if (!taskId) return;
  window.open(`/api/tasks/${taskId}/download?file=${encodeURIComponent(fileName)}`);
};

const handleTweakStarted = () => {
  setGenerating(true);
  setGenStatus("正在微调用例...");
  // taskId 不变，scanner 自动检测到输出文件更新后触发 onResult
};
```

**关键**: `useOutputScanner` 通过 `taskId` prop 绑定轮询目标。tweak 不换 taskId，仅将 generating 切回 true，scanner 继续轮询同一 taskId，检测到输出文件变化后触发 onResult。

---

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `components/usecase-gen/generate-wizard.tsx` | 重构 | Step 3 布局重排；抽离组件；传递回调；微调 taskId 接管 |
| `components/usecase-gen/shared/execution-panel.tsx` | 重构 | 三种渲染模式；进度精简；新增快捷操作面板 |
| `components/usecase-gen/shared/output-files.tsx` | **新增** | 输出文件展示+下载 |
| `components/usecase-gen/shared/ai-tweak-panel.tsx` | **新增** | quick chips + scope + 聊天 + inject/tweak |
| `components/usecase-gen/shared/rating-panel.tsx` | **新增** | 5 星评分对接已有 feedback API |
| `app/api/tasks/[id]/inject/route.ts` | **新增** | 运行时注入 CLI stdin |
| `app/api/tasks/[id]/tweak/route.ts` | **新增** | 在已有用例上启动对话会话，修改原 task 的 output |
| `components/usecase-gen/shared/execution-panel.test.tsx` | 更新 | 适配新模式 + 新回调 |

**不变文件**: `hooks/use-output-scanner.ts`、`app/usecase-gen/page.tsx`、`history-list.tsx`

---

## 测试策略

1. **ExecutionPanel**: config preview / progress dots / quick actions 三种模式 render 测试；回调触发测试
2. **OutputFiles**: _source 过滤 + 实际文件名链接 + taskId null 时禁用
3. **AITweakPanel**: chip 填入输入框 + scope 选择 + 发送调 API + 对话追加 + onTweakStarted 触发
4. **RatingPanel**: taskId null 不渲染 + 点击星星 + 提交 + 已提交状态
5. **ModuleOverviewTable**: 默认折叠 + 点击展开 + 再次折叠

---

## Scope 边界

**本次包含**:
- Step 3 布局重排
- 右侧 sidebar 三种状态（宽度缩窄）
- 输出文件组件（使用实际文件名下载）
- AI 微调面板（quick chips + inject/tweak API + 完整闭环）
- 评价面板（对接已有 feedback API）
- 模块表默认折叠
- inject / tweak 两个新 API

**本次不包含**:
- Step 0/1 改动
- 历史列表改动
- 用例预览编辑 Tab 改动
- 数据看板 / 知识库改动
- AI 微调逐条 diff 展示（后续迭代）
- 逐用例评价（后续迭代）
