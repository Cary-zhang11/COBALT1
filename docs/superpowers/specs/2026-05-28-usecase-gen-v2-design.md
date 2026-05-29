# 用例生成模块 v2 设计文档

## 概述

对「用例生成」模块进行两项增强：

1. **Output Scanner** — 将生成结果扫描从 task 状态/工作流中解耦，直接轮询 output 文件
2. **历史记录 Tab** — 新增「历史记录」Tab（共 5 个），展示用例生成 Skill 下的历史任务，点击回放 Step 3 预览界面

## 决策记录

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 结果检测 | 轮询 output 文件 + 文件大小稳定性 | Claude CLI 不保证走到 completed 状态 |
| 超时策略 | 不设超时 | 用例生成耗时不确定，用户主动取消或离开页面 |
| 产物策略 | 渐进式：`_测试用例.md` 稳定即展示，`.xmind` 单独解锁 | 不阻塞核心功能 |
| 历史记录位置 | 第 2 个 Tab（生成向导 / 历史记录 / 用例编辑器 / 数据看板 / 知识库） | 用户指定 |
| 历史详情 | 复用 Step 3「生成并预览」界面 | 零新 UI |
| SSE 日志流 | 保留，纯展示不做状态判断 | 不破坏现有过程可见性 |

## 功能 1：Output Scanner

### 问题

当前 `generate-wizard.tsx` 通过 `ExecutionPanel` 的 SSE `done` 事件 → `onComplete` 回调链来检测完成。但 Claude CLI 的执行可能不会触发 `done`（进程未正常退出、paused 后无法 resume 等），导致前端永远收不到完成信号。

### 方案

新建 `hooks/use-output-scanner.ts`，独立于 SSE 和工作流，直接轮询 task sandbox 的 output 目录。

### 数据流

```
用户点击「开始生成」
  → createTask + executeTask（照旧）
  → SSE 日志流继续在 ExecutionPanel 展示（纯 UI，不参与状态判断）
  → useOutputScanner 启动轮询

轮询逻辑：
  1. GET /api/tasks/{taskId}/download  列出 output 文件列表
  2. 匹配 *_测试用例.md 文件
  3. GET /api/tasks/{taskId}/download?file=xxx.md  读取内容
  4. 记录文件大小
  5. 下一次轮询：如果大小不变 → 认为写入完成 → 回调 onResult(content, files)
  6. 如果大小变化 → 继续轮询

取消：
  - 用户点击「取消生成」→ POST /api/tasks/{taskId}/cancel → scanner 停止
  - 组件卸载 → useEffect cleanup 停止
  - task status 变为 cancelled → scanner 停止，isScanning = false
  - task status 变为 failed → scanner 停止，回调 onError("任务执行失败")
```

### 接口

```ts
// hooks/use-output-scanner.ts

interface UseOutputScannerOptions {
  taskId: string;
  interval?: number;  // 默认 3000ms
  onResult?: (output: string, files: string[]) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

function useOutputScanner(options: UseOutputScannerOptions): {
  isScanning: boolean;
  foundFiles: string[];
  stop: () => void;
}
```

### 产物检测优先级

1. `*_测试用例.md` → onResult 触发，用例树展示 →「导出 Markdown」可用
2. `xmind/*.xmind` → 追加回调，「导出 XMind」可用

`.xmind` 文件出现后通过 `foundFiles` 列表暴露，前端据此解锁导出按钮。

### 边界情况

| 场景 | 处理 |
|------|------|
| output 目录为空 | 继续轮询 |
| 文件部分写入（大小变化中） | 连续 2 次大小不变才认为稳定 |
| 多个 md 文件 | 按修改时间取最新 |
| 用户切走再回来 | 传入 taskId 重新 scanner.start()，扫到已有文件立即返回 |
| task 已被 cancel | API 返回 status，scanner 停止 |
| 网络异常 | 静默重试下次轮询，不中断 |

---

## 功能 2：历史记录 Tab

### 布局

Tab 顺序调整为：

```
[生成向导] [历史记录] [用例编辑器] [数据看板] [知识库管理]
```

历史记录位于第 2 位，在生成向导和用例编辑器之间。

### 组件

新建 `components/usecase-gen/history-list.tsx`，接收 `skillId` prop：

```ts
interface HistoryListProps {
  skillId: string | undefined;
  onLoadResult: (result: { tree: UsecaseModule[]; stats: object }) => void;
  onResumeTask: (taskId: string) => void;
}
```

### 数据来源

`GET /api/tasks?skillId={usecaseSkillId}`

API 改动：`GET /api/tasks` 新增可选查询参数 `skillId`，由 `searchParams.get("skillId")` 读取后加入 prisma where 条件。

```ts
// app/api/tasks/route.ts GET 函数改动
const skillId = searchParams.get("skillId");
const where = { userId, ...(status ? { status } : {}), ...(skillId ? { skillId } : {}) };
```

### 列表展示

每条记录显示：

- **需求名**：从 `task.input` 提取，截取前 30 字
- **时间**：`task.createdAt`，格式化展示
- **用例数**：从 `task.output` 解析或显示 `task.outputFiles` 文件列表
- **状态标签**：completed（绿色）/ running（蓝色）/ paused（黄色）/ failed（红色）/ cancelled（灰色）

### 交互

**点击已完成任务**：
```
parseUsecaseOutput(task.output)
  → usecaseTree + genStats
  → page.tsx setPreloadedResult({ tree, stats })
  → setActiveTab(0) 跳转「生成向导」
  → GenerateWizard 检测到 preloadedResult → 直接渲染 Step 3 预览
  → 用户可在 Step 3 点击「查看用例详情」→ setActiveTab(2) 切到「用例编辑器」
```

**点击进行中任务**：
```
→ setActiveTab(0) 跳转「生成向导」
  → setTaskId(task.id)
  → 启动 Scanner + SSE 日志流
  → 恢复执行进度展示
  → 扫到文件后自动展示结果
```

### 空状态

```
暂无历史记录
使用「生成向导」创建第一个用例生成任务
```

### 边界情况

| 场景 | 处理 |
|------|------|
| output 解析失败 | Toast 提示 "无法解析结果"，展示原始文本 |
| 任务列表为空 | 显示空状态提示 |
| API 请求失败 | 组件级 error 状态 + 重试按钮 |
| 多个 running 任务 | 仅展示，点击可恢复查看 |
| completed 任务无 output | 显示 "无输出" 占位 |

---

## 改动文件总览

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `hooks/use-output-scanner.ts` | output 文件轮询扫描 hook |
| 新建 | `components/usecase-gen/history-list.tsx` | 历史记录 Tab 组件 |
| 修改 | `app/api/tasks/route.ts` | GET 加 `skillId` 查询参数 |
| 修改 | `app/usecase-gen/page.tsx` | Tab 数组插入「历史记录」；新增 `preloadedResult`、`currentTaskId` 状态 |
| 修改 | `components/usecase-gen/generate-wizard.tsx` | 集成 useOutputScanner 替换回调链；生成中加「取消生成」按钮；接收 `preloadedResult` prop 跳转 Step 3 |

## 状态架构变更

page.tsx 新增状态：

| 状态 | 类型 | 用途 |
|------|------|------|
| `currentTaskId` | `string \| null` | 当前正在执行/查看的 taskId，跨 Tab 共享 |
| `preloadedResult` | `{ tree: UsecaseModule[]; stats: object } \| null` | 历史记录触发的结果预加载，传给 GenerateWizard 直接渲染 Step 3 |

### preloadedResult 数据流

```
用户点击历史记录中已完成任务
  → parseUsecaseOutput(task.output) → { tree, summary }
  → setPreloadedResult({ tree, stats: summary })
  → setActiveTab(0)  // 切到生成向导
  → GenerateWizard 的 useEffect 检测到 preloadedResult
    → setWizStep(2)
    → setGenStats(stats)
    → 渲染 Step 3 预览界面（KPI 卡片 + 导出按钮）
```

## 不在范围内

- 历史记录的搜索/筛选 UI（本次仅列表展示）
- 历史记录分页
- 从历史记录删除任务
- `.xmind` 文件的在线预览（仅提供下载导出）
