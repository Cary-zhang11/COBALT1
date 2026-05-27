# 用例生成模块设计文档

## 概述

在 COBALT 平台新增「用例生成」功能模块，参考 `docs/usecase-gen-prototype.html` 原型设计，实现简版测试用例生成平台。该模块以独立路由 `/usecase-gen` 挂载，底层复用现有 Skill → Task 执行引擎，不修改任何现有业务代码。

## 决策记录

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 覆盖范围 | 4 Tab 全做 | 用户明确要求 |
| 交互流程 | 一键直达，内置专用 Skill | 简化流程，不走问答 |
| 生成方案 | 仅方案 B（工作流） | 与现有 task-engine 自然对接 |
| 数据策略 | 前端 mock + 真实生成按钮 | 核心闭环可用 |
| 架构模式 | 单路由多组件 | 最小改动 + 可维护性 |
| 状态管理 | page.tsx useState | 不引入 Zustand |
| 图表库 | recharts | React 原生、轻量、声明式 |

## 架构

### 文件清单

```
🆕 app/usecase-gen/page.tsx                             ← 路由 + Tab 容器 + 共享状态
🆕 components/usecase-gen/generate-wizard.tsx           ← Tab 1: 生成向导
🆕 components/usecase-gen/case-editor.tsx               ← Tab 2: 用例预览编辑
🆕 components/usecase-gen/dashboard.tsx                 ← Tab 3: 数据看板
🆕 components/usecase-gen/knowledge-base.tsx            ← Tab 4: 知识库管理
🆕 components/usecase-gen/shared/execution-panel.tsx    ← 共用 SSE 执行轨迹面板
🆕 components/usecase-gen/shared/parse-usecase-output.ts ← output 文本 → 树结构解析
🆕 components/usecase-gen/shared/mock-data.ts           ← 统一 mock 数据源
📝 components/sidebar.tsx                                ← +1 navItem（2 行改动）
```

### 依赖变更

```bash
npm install recharts
```

### Sidebar 改动

```ts
// import 追加 FileText
import { LayoutDashboard, PlusCircle, Wand2, LogOut, Cpu, FileText } from "lucide-react";

// navItems 追加一条
{ href: "/usecase-gen", label: "用例生成", icon: FileText },
```

### 状态架构

page.tsx 只管理 3 个状态：

| 状态 | 类型 | 用途 |
|------|------|------|
| `activeTab` | `number` | 当前 Tab 索引 |
| `usecaseTree` | `UsecaseModule[] \| null` | Tab 1 生成 → Tab 2 编辑 |
| `tweakHistory` | `TweakEntry[]` | 微调迭代记录（跨 Tab 共享） |

各 Tab 组件内部自治其余 UI 状态。

### 类型定义

```ts
interface UsecaseCase {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  precondition: string;
  steps: string;
  expected: string;
  tags: string;
}

interface UsecaseModule {
  name: string;
  open: boolean;
  cases: UsecaseCase[];
}

interface TweakEntry {
  round: number;
  instruction: string;
  time: string;
  delta: string; // 如 "+5 个用例，质量分 94"
}
```

## 数据流

```
用户上传需求/粘贴文本
       ↓
点击「开始生成」
       ↓
createTask(skillId, input, files)    ← 复用 useCreateTask
       ↓
executeTask(taskId)                  ← 复用 useExecuteTask
       ↓
useTaskEvents(taskId)               ← 复用 SSE hook → execution-panel 实时展示
       ↓
[可选] 追加指令                      ← 调用 useResumeTask({ taskId, userReply })
       ↓
完成 → parseUsecaseOutput(task.output)
       ↓
解析成功 → usecaseTree → case-editor 渲染
解析失败 → fallback 纯文本展示
       ↓
微调 → createTask(skillId, originalInput + tweak) → 重新执行
```

### Skill ID 配置

环境变量 `NEXT_PUBLIC_USECASE_SKILL_ID` 指向预置的「测试用例生成」Skill。缺失时显示错误提示卡片。

### 输出解析策略

`parseUsecaseOutput(output: string)` 解析步骤：

1. `JSON.parse(output)` — 直接解析
2. 提取 ```json ... ``` 代码块 — 正则匹配
3. 查找首个 `{` 到末尾 `}` — 宽松提取
4. 返回 `null` — fallback 到纯文本展示

期望的 JSON 结构：

```json
{
  "modules": [
    {
      "name": "1. 登录模块",
      "cases": [
        {
          "id": "c1",
          "title": "正常登录（手机号+密码）",
          "priority": "P0",
          "precondition": "用户已注册",
          "steps": "1. 打开登录页\n2. 输入手机号\n3. 输入密码\n4. 点击登录",
          "expected": "登录成功，跳转首页",
          "tags": "功能,冒烟"
        }
      ]
    }
  ],
  "summary": {
    "totalCases": 48,
    "qualityScore": 92,
    "modules": 6
  }
}
```

## 各 Tab 详细设计

### Tab 1：生成向导

参考 prototype Page 1，3 步 Wizard + 右侧执行面板。

**Step 1：输入物料**
- 拖拽/点击上传文档（复用 `/api/upload`）
- 粘贴需求文本（textarea，2000 字限制）
- 最近需求快速复用（mock 列表）
- Few-shot 用例选择（mock 复选框）

**Step 2：选择平台能力**
- 知识库增强（能力勾选：业务域知识库、用例规范库、优先级模型、相似用例推荐）
- 覆盖维度（功能/异常/边界/兼容/性能/安全）
- 生成参数（输出格式、用例粒度、优先级策略）

**Step 3：生成结果**
- 生成动画（工作流节点：解析→检索→生成→校验→导出）
- 追加指令输入框（调用 `useResumeTask`，注入当前执行上下文）
- 完成后：统计卡片（总用例数/质量评分/功能模块/耗时）
- 导出按钮（disabled + tooltip「即将支持」）
- 微调面板（快捷芯片 + 自定义指令 + 迭代历史）

**右侧执行面板**
- 基于 `useTaskEvents` 实时展示 SSE 日志
- 映射为工作流节点状态（done/running/wait）
- 生成前：配置预览摘要
- 生成后：完成提示

### Tab 2：用例预览编辑

参考 prototype Page 2。

**布局**：左侧树（272px）+ 中部详情/微调

**用例树**
- 模块展开/收起
- 优先级彩色标记（P0 红/P1 橙/P2 灰）
- 悬停显示模块重新生成按钮
- 优先级统计（P0/P1/P2 数量）

**用例详情 Tab**
- 可编辑字段：前置条件、测试步骤、预期结果、优先级、标签
- AI 微调入口按钮

**AI 微调 Tab**
- 范围选择：当前用例/当前模块/全部用例
- 快捷操作芯片（补充边界/增加异常/精简步骤/提升P0/增加安全/补充兼容）
- 自定义指令输入
- 迭代轨迹时间线（v1 初始 → v2 微调 → ...）

**工具栏**
- 版本对比按钮（延后实现）
- 导出 XMind / Excel（disabled + tooltip）
- AI 优化选中节点按钮

**底部保存栏**
- 保存 / 放弃修改
- 保存成功 toast

### Tab 3：数据看板

参考 prototype Page 3。

**KPI 卡片**（4 列 grid）
- 累计生成用例数
- 本月活跃用户
- 平均质量分
- 平均生成耗时

**图表**（recharts）
- 折线图：每日生成量 + 质量分（双 Y 轴）
- 饼图：需求类型分布
- 饼图：覆盖维度分布
- 横向柱状图：人员使用 Top 10

**效率统计卡片**
- 生成效率统计（平均质量分/平均耗时/平均 Token/用例编辑率），纯 HTML，无图表依赖

**记录表格**
- 最近生成记录（时间/用户/需求名/用例数/质量分/Token/方案/操作）

**全部 mock 数据**，从 mock-data.ts 统一取。

### Tab 4：知识库管理

参考 prototype Page 4。

**4 子 Tab**
- 业务知识
- 历史用例
- 用例规范
- Prompt 模板

**左侧筛选**
- 搜索输入框
- 标签复选框筛选

**右侧内容**
- 条目卡片列表（名称/日期/标签/引用次数/预览/删除）
- 添加新条目虚线按钮

**Prompt 模板子 Tab**
- 模板卡片（名称/版本/线上状态/内容预览）
- 上线/回滚/编辑/复制按钮
- 使用次数、平均质量分统计

**全部 mock 数据**，CRUD 按钮 UI 存在但无真实 API 调用。

## 边界与错误处理

| 场景 | 处理 |
|------|------|
| Skill ID 未配置 | 显示提示卡片，生成按钮不可用 |
| createTask 失败 | Toast 提示错误信息 |
| executeTask 失败 | 执行面板显示 error 状态 |
| output 解析失败 | fallback 纯文本展示，不显示树 |
| SSE 断线 | useTaskEvents 自动重连（最多 5 次） |
| 导出按钮点击 | disabled + tooltip「即将支持」 |

## 不在范围内

- 版本对比 diff 视图（Tab 2 工具栏）
- 真实导出 XMind / Excel
- 知识库真实 CRUD API
- 数据看板真实数据源
- 自动化测试
