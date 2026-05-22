# SkillFlow — 轻量版 v1.0 设计方案

> 版本：v1.0（轻量版）
> 日期：2026-05-21
> 状态：确定实施
> 目标：2 周内上线核心闭环

---

## 1. 产品概述

**平台名称**：SkillFlow

**核心定位**：用户上传需求文件，平台通过 AI 分析需求并推荐匹配的 Skills，用户选择 Skill 后，平台按照该 Skill 定义的流程自动执行，在关键环节通过交互确认确保质量，最终生成高质量产出。

**核心价值**：将"需求 → 产出"的复杂过程标准化、自动化，同时保留关键节点的人工把控。

### v1.0 MVP 边界（极简原则）

| 能力 | v1.0 | 明确不做 |
|------|------|---------|
| 用户模式 | 单用户（无登录，本地使用） | 多用户 RBAC |
| Skill 来源 | 仅内置 4 个 Skill（代码写死） | 外部 Skill 注册 |
| 文件输入 | 上传文件 + 纯文本粘贴 | URL 导入、大文档分块 |
| 确认策略 | 全部交互确认（默认） | 智能加速、自动跳过 |
| 产出管理 | 单次产出 + 页面展示 | 版本历史、下载、对比 |
| 工作流执行 | LangGraph 直接在 API Route 运行 | BullMQ 队列、Worker 分离 |
| 状态推送 | 前端轮询（5s 间隔） | SSE、Redis Pub/Sub |
| 部署 | 本地 `npm run dev` / `next start` | Docker、Vercel、多实例 |

---

## 2. 核心用户流程

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  上传需求文件  │ ──→ │  AI 解析需求   │ ──→ │  匹配并推荐 Skills │
│  或粘贴文本   │     │  （完整文本）   │     │  + 显示匹配理由    │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                       ↓
                                             ┌─────────────┐
                                             │  用户选择 Skill │
                                             └─────────────┘
                                                       ↓
                             ┌─────────────────────────────────────┐
                             │      按 Skill 定义执行工作流            │
                             │  ┌─────────┐    ┌──────────────┐    │
                             │  │ 解析输入  │ ─→ │ AI 处理/生成   │    │
                             │  └─────────┘    └──────────────┘    │
                             │                        ↓              │
                             │              ┌──────────────────┐    │
                             │              │ 暂停节点：等待用户 │    │
                             │              │ 确认或回答问题     │    │
                             │              └──────────────────┘    │
                             │                        ↓              │
                             │              ┌──────────────────┐    │
                             │              │  继续 / 审核打回    │    │
                             │              └──────────────────┘    │
                             └─────────────────────────────────────┘
                                                       ↓
                                             ┌─────────────┐
                                             │   生成最终产出   │
                                             │   Markdown   │
                                             └─────────────┘
```

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│              Next.js 14 App Router（全栈一体化）                   │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   React 页面   │  │  API Routes  │  │  LangGraph 工作流引擎 │ │
│  │  (6 个页面)    │  │  (REST API)  │  │  (在 API Route 内运行)│ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│                                                                 │
│  前端轮询：每 5s 调用 GET /api/projects/:id/status 刷新状态       │
│                                                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               ↕ Prisma
┌──────────────────────────────┴──────────────────────────────────┐
│                         PostgreSQL                               │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────────────────┐  │
│  │   Project   │ │ WorkflowState│ │      Output (产出)        │  │
│  │   (项目)    │ │  (工作流状态) │ │     (Markdown 文本)       │  │
│  └────────────┘ └──────────────┘ └──────────────────────────┘  │
│                                                                 │
│  LangGraph PostgresSaver：自动持久化 checkpoint                   │
└─────────────────────────────────────────────────────────────────┘
```

**架构关键决策**：
- **没有 Worker 分离**：LangGraph 直接在 Next.js API Route 中运行，调用完成后立即返回。暂停节点把状态存入 PostgresSaver，前端轮询发现状态为 `paused` 时弹出确认对话框。
- **没有 Redis/BullMQ**：所有执行同步在 API Route 内完成，暂停时直接返回，恢复时从 PostgresSaver 读取状态继续。
- **没有 SSE**：前端用 `setInterval(5000)` 轮询项目状态，v1.1 再考虑升级 SSE。

---

## 4. 核心模块详解

### 4.1 文件解析服务（极简版）

```typescript
const UPLOAD_CONFIG = {
  maxFileSize: 5 * 1024 * 1024,    // 5MB 上限
  maxTextLength: 50_000,           // 文本上限 5 万字符
  allowedExtensions: ['.md', '.txt', '.docx', '.pdf', '.json', '.yaml', '.yml'],
};
```

**解析器（仅保留基础格式）**：

| 解析器 | 支持格式 | 实现方式 |
|--------|---------|---------|
| TextParser | .md, .txt | 直接读取 |
| DocxParser | .docx | `mammoth` 库提取纯文本 |
| PdfParser | .pdf | `pdf-parse` 库提取文本 |
| JsonYamlParser | .json, .yaml, .yml | JSON.parse / js-yaml |

**不做**：大文档分块、自动摘要、编码自动检测（统一要求 UTF-8）。

### 4.2 Skill Registry（内置硬编码）

v1.0 不做动态 Skill 注册，4 个 Skill 直接写死在代码里：

```typescript
const BUILT_IN_SKILLS: Skill[] = [
  {
    id: 'test-cases',
    name: '测试用例生成',
    description: '根据 PRD 或用户故事生成结构化测试用例文档',
    inputFormats: ['.md', '.txt', '.docx', '.pdf'],
    estimatedTokens: 15000,
    keywords: ['测试', '用例', 'PRD', '需求', '验证', '验收标准'],
    workflow: [/* ... */],
  },
  {
    id: 'test-code',
    name: '测试代码生成',
    description: '根据 API 规格生成可执行的单元测试/集成测试代码',
    inputFormats: ['.md', '.txt', '.json', '.yaml'],
    estimatedTokens: 25000,
    keywords: ['测试代码', '单元测试', '集成测试', 'API', '自动化'],
    workflow: [/* ... */],
  },
  {
    id: 'test-plan',
    name: '测试计划生成',
    description: '根据需求文档生成完整的测试计划，包括范围、策略、排期',
    inputFormats: ['.md', '.txt', '.docx', '.pdf'],
    estimatedTokens: 12000,
    keywords: ['测试计划', '策略', '排期', '范围', '资源'],
    workflow: [/* ... */],
  },
  {
    id: 'qa-checklist',
    name: 'QA 检查清单',
    description: '根据需求生成 QA 验收检查清单',
    inputFormats: ['.md', '.txt', '.docx', '.pdf', '.json'],
    estimatedTokens: 8000,
    keywords: ['检查清单', '验收', 'QA', '评审', 'checklist'],
    workflow: [/* ... */],
  },
];
```

### 4.3 AI 需求匹配器

**匹配逻辑**（纯 LLM 调用，无 Embedding）：

```typescript
async function matchSkills(requirementText: string): Promise<SkillRecommendation[]> {
  const prompt = `根据以下需求内容，从给定的 Skills 中推荐最匹配的 3 个。

需求内容：
${requirementText.slice(0, 8000)}

可选 Skills：
${BUILT_IN_SKILLS.map(s => `- ${s.name}: ${s.description}`).join('\n')}

请以 JSON 格式返回推荐结果，包含 skillId、匹配分数（0-1）、匹配理由。`;

  const response = await callLLM(prompt);
  return parseRecommendations(response);
}
```

### 4.4 工作流引擎 — LangGraph StateGraph（轻量版）

```typescript
import { StateGraph, Annotation } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

const State = Annotation.Root({
  projectId: Annotation<string>,
  requirementText: Annotation<string>,
  matchedSkills: Annotation<SkillRecommendation[]>,
  selectedSkillId: Annotation<string | null>,
  currentStep: Annotation<string>,
  messages: Annotation<{ role: 'ai' | 'user'; content: string; type?: string }[]>,
  output: Annotation<string | null>,
  status: Annotation<'running' | 'paused' | 'completed' | 'failed'>,
});

const checkpointer = new PostgresSaver({
  connectionString: process.env.DATABASE_URL!,
});

const graph = new StateGraph(State)
  .addNode('parse', parseNode)
  .addNode('match', matchNode)
  .addNode('waitSkillSelect', pauseNode('请选择一个 Skill 开始执行'))
  .addNode('clarify', clarifyNode)
  .addNode('waitClarify', pauseNode('请回答澄清问题'))
  .addNode('generate', generateNode)
  .addNode('waitReview', pauseNode('请审核生成的内容'))
  .addNode('output', outputNode)
  .addEdge('__start__', 'parse')
  .addEdge('parse', 'match')
  .addEdge('match', 'waitSkillSelect')
  .addEdge('waitSkillSelect', 'clarify')
  .addEdge('clarify', 'generate')
  .addEdge('generate', 'waitReview')
  .addEdge('waitReview', 'output')
  .addEdge('output', '__end__');

const app = graph.compile({ checkpointer });
```

**暂停节点实现**：

```typescript
function pauseNode(message: string) {
  return async (state: typeof State.State) => {
    return {
      status: 'paused' as const,
      messages: [...state.messages, { role: 'ai' as const, content: message, type: 'pause' }],
    };
  };
}
```

**API 执行流程**：

```
POST /api/projects/:id/start-workflow
  1. 读取项目需求文本
  2. app.invoke(initialState, { configurable: { thread_id: projectId } })
  3. LangGraph 执行到第一个 pause 节点
  4. PostgresSaver 自动保存状态
  5. 返回 { status: 'paused', currentStep: 'waitSkillSelect', message: '...' }

POST /api/projects/:id/resume
  body: { answer: string }
  1. 从请求中获取用户回答
  2. app.invoke({ messages: [...] }, { configurable: { thread_id: projectId } })
  3. LangGraph 从 PostgresSaver 恢复状态，继续执行
  4. 执行到下一个 pause 或 __end__
  5. 返回新的状态
```

### 4.5 API 设计

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/projects` | 获取项目列表 |
| POST | `/api/projects` | 创建项目 |
| PUT | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |
| POST | `/api/projects/:id/upload` | 上传需求文件 |
| POST | `/api/projects/:id/paste` | 粘贴纯文本需求 |
| GET | `/api/projects/:id/status` | 获取工作流状态（轮询用） |
| POST | `/api/projects/:id/start-workflow` | 启动工作流 |
| POST | `/api/projects/:id/resume` | 提交回答/确认，恢复工作流 |
| GET | `/api/skills` | 获取所有内置 Skills |

### 4.6 状态轮询（前端）

```typescript
// 前端每 5 秒轮询一次
useEffect(() => {
  const interval = setInterval(async () => {
    const res = await fetch(`/api/projects/${projectId}/status`);
    const data = await res.json();
    setWorkflowState(data);
    if (data.status === 'completed' || data.status === 'failed') {
      clearInterval(interval);
    }
  }, 5000);
  return () => clearInterval(interval);
}, [projectId]);
```

---

## 5. 数据模型（Prisma Schema）

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  status      String   @default("created") // created, running, paused, completed, failed
  requirement String?  @db.Text
  fileName    String?
  fileSize    Int?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // LangGraph 状态由 PostgresSaver 自动管理，不在这里存储
}

model SkillExecution {
  id            String   @id @default(cuid())
  projectId     String   @unique
  skillId       String
  currentStep   String   @default("parse")
  status        String   @default("created") // created, running, paused, completed, failed
  messages      Json     @default("[]")
  output        String?  @db.Text
  tokenUsage    Int      @default(0)
  startedAt     DateTime @default(now())
  completedAt   DateTime?
}
```

**注意**：LangGraph 的 `PostgresSaver` 会用自己的表结构存储 checkpoint，与 Prisma 模型分开。

---

## 6. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Next.js 14 (App Router) | 已搭建完成 |
| UI | Tailwind CSS + lucide-react | 已搭建完成 |
| 数据库 | PostgreSQL 15+ | 本地或 Docker 启动 |
| ORM | Prisma | 数据访问 |
| 工作流引擎 | LangGraph + PostgresSaver | 状态自动持久化 |
| AI SDK | Vercel AI SDK | 统一 LLM 调用 |
| LLM | OpenAI GPT-4 / Claude | 环境变量配置 API Key |
| 部署 | `next start` | 单机运行 |

**环境变量**：
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/skillflow"
OPENAI_API_KEY="sk-..."
# 或 ANTHROPIC_API_KEY="sk-ant-..."
```

---

## 7. 前端页面（已实现）

| 页面 | 路径 | 功能 |
|------|------|------|
| 项目列表 | `/` | 增删改查项目 |
| 新建项目 | `/projects/new` | 问答式 AI 交互创建项目 |
| Skill 推荐 | `/projects/[id]/skills` | AI 匹配 Skills + 用户选择 |
| 工作流执行 | `/projects/[id]/workflow` | 步骤进度 + 聊天式确认交互 |
| 结果展示 | `/projects/[id]/results` | 最终产出展示 |
| Skill 管理 | `/skills` | 查看内置 Skills |

---

## 8. 错误处理

| 场景 | 处理策略 |
|------|---------|
| 文件格式不支持 | 返回明确错误 + 支持的格式列表 |
| 文件过大 | 返回 413，提示 5MB 限制 |
| 需求文本过长 | 提示超过 5 万字符，建议精简 |
| AI 调用失败 | 指数退避重试 3 次，仍失败则标记项目状态为 `failed` |
| AI 输出格式错误 | 重试 1 次，失败暂停让用户选择 |
| LangGraph 状态丢失 | PostgresSaver 保障，异常时返回 `failed` |
| 数据库连接失败 | 返回 503，记录错误日志 |
| 用户长时间未响应 | 不做超时处理，状态保持 `paused` |

---

## 9. 实施计划（2 周）

### Week 1 — 基础设施 + 核心工作流

- [ ] Day 1: PostgreSQL + Prisma 初始化，Project CRUD API
- [ ] Day 2: 文件上传/粘贴 API，文本解析
- [ ] Day 3: LangGraph 基础工作流搭建，PostgresSaver 配置
- [ ] Day 4: AI Skill 匹配（LLM 调用）
- [ ] Day 5: 工作流启动/暂停/恢复 API，前端轮询对接

### Week 2 — 完善 + 联调

- [ ] Day 6: 4 个内置 Skill 的 prompt 模板编写
- [ ] Day 7: 工作流执行页面联调（聊天式确认交互）
- [ ] Day 8: 结果展示页面
- [ ] Day 9: 端到端测试，Bug 修复
- [ ] Day 10: 文档整理，准备上线

---

## 10. v1.0 vs v2.0 对比

| 维度 | v1.0（本方案） | v2.0（原方案） |
|------|---------------|---------------|
| 架构 | Next.js 全栈一体 | API + Worker 分离 |
| 队列 | 无（同步执行） | BullMQ + Redis |
| 状态推送 | 前端轮询 5s | SSE + Redis Pub/Sub |
| 数据库连接 | Prisma 直连 | Prisma + PgBouncer |
| 大文档处理 | 直接传完整文本（5万字符限制） | 自动分段 + 摘要 |
| Skill 管理 | 4 个内置硬编码 | 动态注册 + 版本管理 |
| 用户系统 | 单用户无登录 | JWT + RBAC |
| 部署 | 单机 `next start` | Vercel + Docker + 多 Worker |
| Token 预算 | 简单记录 | 精细化控制 + 告警 |
| 产出管理 | 页面展示 | 下载 + 版本历史 + Diff |
| 预估工期 | 2 周 | 6-8 周 |

---

## 附录：待验证的技术风险

| # | 风险 | 验证方式 | 优先级 |
|---|------|---------|--------|
| 1 | `@langchain/langgraph-checkpoint-postgres` JS 版是否可用 | Day 3 原型验证 | 🔴 P0 |
| 2 | LangGraph 在 Next.js API Route 中的长时间运行是否稳定 | Day 5 压测 | 🔴 P0 |
| 3 | 5 万字符需求文本的 LLM 处理效果 | Day 4 实际测试 | 🟡 P1 |
