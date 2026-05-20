# SkillFlow — 基于 Skill 的问答式需求处理平台设计方案

> 版本：v2.0
> 日期：2026-05-19
> 状态：已复核优化

---

## 1. 产品概述

**平台名称**：SkillFlow

**核心定位**：用户上传需求文件，平台通过 AI 分析需求并推荐匹配的 Skills，用户选择 Skill 后，平台按照该 Skill 定义的流程自动执行，在关键环节通过交互确认确保质量，最终生成高质量产出。

**核心价值**：将"需求 → 产出"的复杂过程标准化、自动化，同时保留关键节点的人工把控。

**载体形式**：
- **核心**：Web 应用（浏览器访问，完整交互）
- **辅助**：Claude Code Skill（通过 REST API 调用平台能力，快捷入口）

### v1.0 MVP 边界

| 能力 | v1.0 | v1.1+ |
|------|------|-------|
| 单用户模式 | ✅ `Project.createdBy` 预留多用户字段 | 多用户 RBAC（Owner/Editor/Reviewer） |
| Skill 来源 | 仅内置 Skill | 外部 Skill 注册 + 审核 |
| 文件输入 | 上传文件 + 纯文本粘贴 | URL 导入、项目复制 |
| 确认策略 | 全部交互确认（默认）+ 可跳过可选项 | 智能加速模式（高置信度自动通过） |
| 产出管理 | 单次产出 + 下载 | 版本历史、产出对比、审核标注 |
| Skill 信任 | Skill 描述 + 匹配理由 | 评分、使用量、样例预览 |
| 部署 | 单 Worker 实例 | Worker 横向扩容 |

---

## 2. 核心用户流程

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  上传需求文件  │ ──→ │  AI 解析需求   │ ──→ │  匹配并推荐 Skills │
│  或粘贴文本   │     │  + 大文档分块   │     │  + 显示匹配理由    │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                       ↓
                                             ┌─────────────┐
                                             │  用户选择 Skill │
                                             │  （或浏览全部）  │
                                             └─────────────┘
                                                       ↓
                             ┌─────────────────────────────────────┐
                             │      按 Skill 定义执行工作流            │
                             │  ┌─────────┐    ┌──────────────┐    │
                             │  │ 解析输入  │ ─→ │ AI 处理/生成   │    │
                             │  └─────────┘    └──────────────┘    │
                             │                        ↓              │
                             │              ┌──────────────────┐    │
                             │              │ AI 置信度判断      │    │
                             │              │ 需要确认？是/否    │    │
                             │              └──────────────────┘    │
                             │                ↓          ↓           │
                             │           [是]        [否]           │
                             │             ↓            ↓           │
                             │     ┌────────────┐  ┌────────┐      │
                             │     │ 用户确认/回答 │  │ 自动继续 │      │
                             │     └────────────┘  └────────┘      │
                             │                        ↓              │
                             │              ┌──────────────────┐    │
                             │              │  继续 / 审核打回    │    │
                             │              └──────────────────┘    │
                             │                        ↓              │
                             │              ┌──────────────────┐    │
                             │              │  可随时取消工作流    │    │
                             │              └──────────────────┘    │
                             └─────────────────────────────────────┘
                                                       ↓
                                             ┌─────────────┐
                                             │   生成最终产出   │
                                             │  Markdown/JSON │
                                             └─────────────┘
```

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Web 前端 (Next.js App Router — Vercel 部署)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 文件上传   │ │ 需求预览   │ │ Skill 选择 │ │ 交互确认   │ │ 结果展示   │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↕ REST API
┌─────────────────────────────────────────────────────────────────────────────┐
│               Next.js API Routes (Vercel Serverless — 轻量控制器)              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────────┐    │
│  │ 文件接收/校验 │ │ Skill 查询   │ │  任务分发器   │ │  SSE 状态推送 endpoint │    │
│  │ (大小/类型)  │ │ (Registry)  │ │ (入队 Job)  │ │  (订阅 Redis Pub/Sub)  │    │
│  └────────────┘ └────────────┘ └─────┬──────┘ └──────────────────────┘    │
│                                      │                                       │
│                            Prisma (连接池) + PgBouncer                        │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       ↕ 入队 (Redis)
┌─────────────────────────────────────────────────────────────────────────────┐
│                    异步任务队列 (BullMQ + Redis)                                │
│  ┌──────────────────────┐   ┌──────────────────────────┐                    │
│  │ start-workflow 队列   │   │  resume-workflow 队列      │                    │
│  │ (新工作流启动)         │   │  (暂停后恢复执行)           │                    │
│  └──────────────────────┘   └──────────────────────────┘                    │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       ↕ 消费
┌─────────────────────────────────────────────────────────────────────────────┐
│                   LangGraph Worker (Docker 常驻进程 — 独立部署)                  │
│                                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     StateGraph (状态机驱动)                            │   │
│   │                                                                      │   │
│   │  ┌────────┐   ┌─────────┐   ┌────────┐   ┌────────┐                │   │
│   │  │ parse  │──→│ analyze │──→│ match  │──→│ select │                │   │
│   │  │ 解析输入│   │ AI 分析  │   │ 匹配Skill│   │ 等待选择 │                │   │
│   │  │+ 分块   │   │         │   │        │   │        │                │   │
│   │  └────────┘   └─────────┘   └────────┘   └────────┘                │   │
│   │                                                  │                    │   │
│   │  ┌────────┐   ┌─────────┐   ┌────────┐         │                    │   │
│   │  │clarify │←──│ question│←──│generate│←────────┘                    │   │
│   │  │ 澄清节点│   │ 提问节点 │   │ 生成节点 │                             │   │
│   │  └───┬────┘   └────┬────┘   └────────┘                             │   │
│   │      │             │                                                 │   │
│   │      └─────────────┘                                                 │   │
│   │            ↑ 用户回答后通过 resume-workflow Job 恢复                     │   │
│   │                                                                      │   │
│   │  ┌────────┐   ┌─────────┐                                           │   │
│   │  │review  │──→│ output  │                                           │   │
│   │  │ 审核节点│   │ 输出节点 │                                           │   │
│   │  └────────┘   └─────────┘                                           │   │
│   │                                                                      │   │
│   │  ◄─── PostgresSaver (checkpointer，仅保留最近 3 checkpoint) ───►    │   │
│   │  ◄─── Redis Pub/Sub (发布状态变更事件) ───►                          │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│   Worker 特性：                                                               │
│   • Docker 常驻进程（非 Serverless）                                           │
│   • 优雅关闭：SIGTERM → 完成当前 Step → 保存状态 → 退出                        │
│   • 健康检查：/health endpoint 供负载均衡                                      │
│   • 可横向扩容（BullMQ 多 Worker 消费不同 Job）                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                       ↕
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   数据层                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │  PostgreSQL  │ │    Redis    │ │ 文件存储(S3) │ │  PgBouncer  │          │
│  │ (主数据+状态) │ │  (队列+PubSub│ │  (上传+产出) │ │ (连接池代理) │          │
│  │             │ │   +分布式锁) │ │             │ │             │          │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**架构关键决策**：
- **API Route（Vercel Serverless）**：仅做请求接收、参数校验、任务入队、状态查询——每个请求 <10s 完成
- **Worker（Docker 常驻进程）**：执行 LangGraph 工作流，可运行数分钟到数小时——不受 Vercel 超时限制
- **Redis** 是 API Route 和 Worker 之间的唯一桥梁：队列传递 Job + Pub/Sub 推送状态

---

## 4. 核心模块详解

### 4.1 文件解析服务

#### 解析器接口

```typescript
interface IParser {
  readonly supportedTypes: string[];  // MIME types
  readonly extensions: string[];      // 文件扩展名
  parse(buffer: Buffer, filename: string): Promise<ParsedRequirement>;
}
```

#### 上传安全策略

```typescript
const UPLOAD_CONFIG = {
  maxFileSize: 20 * 1024 * 1024,    // 20MB 上限
  allowedMimeTypes: [
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/yaml',
    'text/plain',
  ],
  maxTextPasteLength: 100 * 1024,    // 粘贴文本上限 100KB
};
```

**校验流程**：
1. 检查文件扩展名 + MIME type 双重匹配
2. 检查文件大小（超限返回 413）
3. 解析器在独立 try-catch 中执行
4. 对 docx/pdf 等富格式文件，先提取文本再校验编码

#### 大文档分段策略

```typescript
interface ParsedRequirement {
  projectId: string;
  segments: TextSegment[];
  structure: {
    title?: string;
    sectionSummaries: SectionSummary[];
    estimatedTokens: number;
    totalSegmentCount: number;
  };
  metadata: {
    fileName: string;
    fileSize: number;
    encoding: string;
    parsedAt: Date;
  };
}

interface TextSegment {
  index: number;
  title: string;
  content: string;         // ≤ 4000 chars
  summary: string;
  tokenEstimate: number;
}

interface SectionSummary {
  title: string;
  summary: string;
  segmentIndices: number[];
}
```

**分段流程**：
1. Parser 提取原始文本 → 按自然段落 + 标题层级切分
2. 为每段生成 200-500 字摘要
3. `structure` 中仅保留摘要 + 分段索引 → 进入 LangGraph 状态
4. LLM 需要详细上下文时，通过 `segmentIndices` 按需加载

#### 现有解析器

| 解析器 | 支持格式 | 新增能力 |
|--------|---------|---------|
| MarkdownParser | .md | 标题嵌套深度检测 |
| DocxParser | .docx | XXE 防护、编码自动检测 |
| PdfParser | .pdf | 扫描版 PDF 降级提示 |
| CsvParser | .csv/.xlsx | 行列数上限（1000 行） |
| OpenApiParser | .json/.yaml | Schema 循环引用检测 |
| TextPasteParser | 纯文本 | v2.0 新增 |

### 4.2 Skill Registry

#### Skill 定义结构

```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  source: 'built-in' | 'external';
  author?: string;
  input: {
    formats: string[];
    description: string;
    estimatedTokens: number;
  };
  workflow: {
    steps: WorkflowStep[];
  };
  keywords: string[];
  status: 'active' | 'deprecated' | 'beta';
  changelog?: string;
  minPlatformVersion: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  type: 'auto' | 'pause';
  promptTemplate: string;
  outputFormat?: string;
  pauseConfig?: {
    trigger: 'ai_decision' | 'always';
    aiConfidenceThreshold?: number;
    questionTemplate?: string;
    options?: string[];
    allowFreeText?: boolean;
    timeoutHours?: number;
  };
}
```

#### Skill 版本管理规则

1. **执行中冻结**：工作流启动后，使用的 Skill 版本被快照冻结
2. **新建默认最新**：新项目创建时使用 `status='active'` 的最新版本
3. **旧版本保留**：内置 Skill 保留最近 3 个 active 版本
4. **产出可追溯**：Output 记录 `skillId + skillVersion`

#### v1.0 内置 Skills

| Skill ID | 名称 | 输入 | 输出 | 预估 Token |
|----------|------|------|------|-----------|
| test-cases | 测试用例生成 | PRD、用户故事 | 测试用例文档 | 15K-50K |
| test-code | 测试代码生成 | PRD、API 规格 | 可执行测试代码 | 20K-80K |
| test-plan | 测试计划生成 | PRD | 测试计划文档 | 10K-30K |
| qa-checklist | QA 检查清单 | 任意需求 | 检查清单 | 5K-15K |

### 4.3 AI 需求匹配器

**匹配逻辑**：
- 关键词匹配：提取需求文本关键词，与 `Skill.keywords` 匹配
- 语义匹配：使用 LLM 判断需求描述与 Skill 描述的语义相似度
- 格式匹配：检查上传文件格式是否在 `Skill.input.formats` 中
- 综合排序：输出 Top 3-5 推荐

**逃生舱**：
- 用户可见"浏览所有 Skills"入口
- 匹配结果展示预估 token 消耗和典型产出格式
- 所有推荐分数 < 0.3 时自动提示"浏览全部"

### 4.4 工作流引擎 — LangGraph StateGraph

#### BullMQ + LangGraph 状态同步

```
JobType: 'start-workflow'     → Worker 执行 LangGraph 直到首次暂停
JobType: 'resume-workflow'    → Worker 用 thread_id 恢复，执行到下次暂停或完成

流程：
┌─ POST /api/workflow/start ───────────────────────────────────────┐
│  1. 校验 + 权限                                                 │
│  2. 创建 WorkflowInstance (status='queued')                     │
│  3. 入队 start-workflow Job { projectId, skillId, threadId }    │
│  4. 返回 { jobId, status: 'queued' }                            │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ Worker 消费 start-workflow Job ─────────────────────────────────┐
│  1. 更新 WorkflowInstance.status = 'running'                    │
│  2. app.invoke(initialState, { thread_id }) 开始执行            │
│  3. 遇到 pause 节点 → PostgresSaver 保存状态                     │
│  4. 更新 WorkflowInstance.status = 'paused' + 记录暂停步骤       │
│  5. BullMQ Job 标记为 completed（Worker 释放！）                 │
│  6. Redis Pub/Sub → 推送状态给前端                              │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 用户提交确认/回答 → POST /api/projects/:id/answer ──────────────┐
│  1. 获取 Redis 分布式锁 lock:workflow:{projectId}               │
│  2. 校验项目状态为 'paused'                                     │
│  3. 保存用户回答到 ConfirmationRequest                           │
│  4. 更新 WorkflowInstance.status = 'running'                    │
│  5. 入队 resume-workflow Job { projectId, threadId, answer }    │
│  6. 释放分布式锁                                                │
│  7. 返回 { accepted: true }                                     │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ Worker 消费 resume-workflow Job ────────────────────────────────┐
│  1. 构建 state update（包含用户回答）                            │
│  2. app.invoke(stateUpdate, { thread_id }) 从断点恢复           │
│  3. 继续执行到下一个 pause 或完成                                │
│  4. 如果又暂停 → 重复释放流程                                   │
│  5. 如果完成 → status='completed'，Redis Pub/Sub 推送            │
│  6. PostgresSaver 清理：仅保留最后 checkpoint + 近 3 个         │
└──────────────────────────────────────────────────────────────────┘
```

**关键保障**：
- 同一 projectId 的 resume-workflow Job 不会并发执行（分布式锁）
- Worker 崩溃不影响：PostgresSaver 持久化状态，新 Worker 通过 thread_id 恢复
- BullMQ Job 重试策略：指数退避（1s → 5s → 25s，最多 3 次）

#### StateGraph 定义

```typescript
import { StateGraph, Annotation } from '@langchain/langgraph';

const State = Annotation.Root({
  projectId: Annotation<string>,
  requirement: Annotation<{
    title?: string;
    sectionSummaries: SectionSummary[];
    estimatedTokens: number;
  }>,
  matchedSkills: Annotation<SkillRecommendation[]>,
  selectedSkill: Annotation<Skill | null>,
  selectedSkillSnapshot: Annotation<Skill | null>,
  currentStepIndex: Annotation<number>,
  clarifications: Annotation<Record<string, string>>,
  reviewResult: Annotation<'approved' | 'rejected' | 'rejected_with_notes' | null>,
  reviewNotes: Annotation<string | null>,
  outputs: Annotation<Output[]>,
  tokenUsage: Annotation<{
    totalPrompt: number;
    totalCompletion: number;
    budget: number;
  }>,
  error: Annotation<string | null>,
  lastResumeAt: Annotation<Date | null>,
});

const graph = new StateGraph(State)
  .addNode('parse', parseNode)
  .addNode('analyze', analyzeNode)
  .addNode('matchSkills', matchSkillsNode)
  .addNode('waitForSkillSelection', pauseNode)
  .addNode('clarify', clarifyNode)
  .addNode('waitForClarification', pauseNode)
  .addNode('generate', generateNode)
  .addNode('waitForReview', pauseNode)
  .addNode('output', outputNode)
  .addEdge('__start__', 'parse')
  .addEdge('parse', 'analyze')
  .addEdge('analyze', 'matchSkills')
  .addEdge('matchSkills', 'waitForSkillSelection')
  .addEdge('waitForSkillSelection', 'clarify')
  .addConditionalEdges('clarify', shouldAskQuestion, {
    needClarify: 'waitForClarification',
    enoughInfo: 'generate',
  })
  .addEdge('waitForClarification', 'clarify')
  .addEdge('generate', 'waitForReview')
  .addConditionalEdges('waitForReview', reviewDecision, {
    approved: 'output',
    rejected: 'generate',
  })
  .addEdge('output', '__end__');
```

#### Token 消耗控制

```typescript
const TOKEN_BUDGET_PER_PROJECT = 100_000;

async function checkTokenBudget(state: State): Promise<boolean> {
  const used = state.tokenUsage.totalPrompt + state.tokenUsage.totalCompletion;
  if (used > state.tokenUsage.budget * 0.9) {
    throw new TokenBudgetWarning(
      `已使用 ${used}/${state.tokenUsage.budget} tokens，是否继续？`
    );
  }
  return true;
}
```

#### 状态清理策略

```typescript
async function cleanupCheckpoints(threadId: string) {
  const checkpoints = await postgresSaver.list(threadId);
  const toKeep = checkpoints.slice(-4);
  const toDelete = checkpoints.slice(0, -4);
  for (const cp of toDelete) {
    await postgresSaver.delete(threadId, cp.checkpointId);
  }
}
```

### 4.5 异步任务架构

#### 队列设计

| 队列 | Job Type | 触发场景 | 超时 |
|------|----------|---------|------|
| `workflow-start` | `start-workflow` | 用户选择 Skill 后首次启动 | 无超时 |
| `workflow-resume` | `resume-workflow` | 用户回答澄清/提交审核后恢复 | 无超时 |

#### SSE 状态推送（Redis Pub/Sub）

```typescript
// Worker 侧
async function publishStateChange(projectId: string, state: WorkflowState) {
  await redis.publish(
    `workflow:${projectId}:state`,
    JSON.stringify({
      type: 'state_change',
      projectId,
      status: state.status,
      currentStep: state.currentStep,
      totalSteps: state.totalSteps,
      message: state.message,
      timestamp: Date.now(),
    })
  );
}

// API Route 侧
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const stream = new ReadableStream({
    async start(controller) {
      const subscriber = redis.duplicate();
      await subscriber.subscribe(`workflow:${id}:state`);
      subscriber.on('message', (channel, message) => {
        controller.enqueue(`data: ${message}\n\n`);
        const data = JSON.parse(message);
        if (data.status === 'completed' || data.status === 'failed') {
          subscriber.unsubscribe();
          controller.close();
        }
      });
      req.signal.addEventListener('abort', () => {
        subscriber.unsubscribe();
        subscriber.quit();
      });
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

#### 工作流取消

```typescript
async function cancelWorkflow(projectId: string) {
  const lockKey = `lock:workflow:${projectId}`;
  const locked = await redis.set(lockKey, '1', 'NX', 'EX', 10);
  if (!locked) throw new ConflictError('操作进行中');

  try {
    const instance = await db.workflowInstance.findUnique({ where: { projectId } });
    await db.workflowInstance.update({
      where: { projectId },
      data: { status: 'cancelled' },
    });
    await redis.publish(`workflow:${projectId}:state`, JSON.stringify({
      type: 'state_change',
      projectId,
      status: 'cancelled',
      timestamp: Date.now(),
    }));
  } finally {
    await redis.del(lockKey);
  }
}
```

### 4.6 API 设计

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/projects` | 创建项目 |
| POST | `/api/projects/:id/upload` | 上传需求文件 |
| POST | `/api/projects/:id/paste` | 粘贴纯文本需求 |
| GET | `/api/projects/:id/skills` | 获取推荐的 Skills |
| POST | `/api/projects/:id/select-skill` | 选择 Skill 启动工作流 |
| POST | `/api/projects/:id/answer` | 回答澄清问题 |
| POST | `/api/projects/:id/review` | 提交审核结果 |
| POST | `/api/projects/:id/cancel` | 取消工作流 |
| GET | `/api/projects/:id/outputs` | 获取最终产出 |
| GET | `/api/projects/:id/stream` | SSE 实时状态流 |
| GET | `/api/skills` | 浏览所有 Skill |

### 4.7 可观测性

#### 结构化日志

```typescript
logger.info({
  event: 'workflow.step.completed',
  projectId,
  threadId,
  stepName: 'analyze',
  duration: 15.2,
  tokenUsage: { prompt: 1200, completion: 800 },
  traceId,
}, 'Step completed successfully');
```

#### 关键指标

| 指标 | 告警阈值 |
|------|---------|
| workflow.completion_rate | < 80% |
| workflow.avg_duration_seconds | > 600s |
| workflow.pause_avg_duration_hours | > 48h |
| llm.call_latency_p95_ms | > 60000ms |
| llm.token_usage_per_project | > 80000 |
| bullmq.waiting_jobs | > 100 |
| bullmq.failed_jobs_rate | > 5% |
| db.connection_pool_usage | > 80% |

---

## 5. 数据模型

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  status: 'created' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
}

interface ParsedRequirement {
  projectId: string;
  segments: TextSegment[];
  structure: {
    title?: string;
    sectionSummaries: SectionSummary[];
    estimatedTokens: number;
    totalSegmentCount: number;
  };
  metadata: {
    fileName: string;
    fileSize: number;
    encoding: string;
    parsedAt: Date;
  };
}

interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  source: 'built-in' | 'external';
  author?: string;
  input: { formats: string[]; description: string; estimatedTokens: number };
  workflow: { steps: WorkflowStep[] };
  keywords: string[];
  status: 'active' | 'deprecated' | 'beta';
  changelog?: string;
  minPlatformVersion: string;
}

interface WorkflowInstance {
  id: string;
  projectId: string;
  skillId: string;
  skillVersion: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  currentStepId?: string;
  threadId: string;
  tokenUsage: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    budget: number;
  };
  outputs: Output[];
  createdAt: Date;
  updatedAt: Date;
  lastResumeAt?: Date;
}

interface ConfirmationRequest {
  id: string;
  projectId: string;
  stepId: string;
  trigger: 'ai_decision' | 'always';
  question: string;
  options?: string[];
  allowFreeText?: boolean;
  context: any;
  status: 'pending' | 'answered' | 'timed_out';
  response?: ConfirmationResponse;
  timeoutAt: Date;
  createdAt: Date;
}

interface ConfirmationResponse {
  answer: string;
  notes?: string;
  respondedAt: Date;
}

interface Output {
  id: string;
  projectId: string;
  skillId: string;
  skillVersion: string;
  type: string;
  format: 'markdown' | 'excel' | 'typescript' | 'json';
  content: string;
  metadata: any;
  createdAt: Date;
}
```

---

## 6. 技术栈

| 层级 | 技术 | 部署环境 |
|------|------|---------|
| 前端框架 | Next.js 14+ (App Router) | Vercel |
| UI 组件 | shadcn/ui + Tailwind CSS | Vercel |
| API Routes | Next.js API Routes | Vercel Serverless |
| 数据库 | PostgreSQL 15+ | 独立实例（Supabase/RDS） |
| 连接池代理 | PgBouncer | 与 DB 同区 |
| ORM | Prisma | Vercel + Worker |
| 缓存/队列/PubSub | Redis 7+ | 独立实例 |
| 工作流引擎 | LangGraph (StateGraph) | Docker 常驻进程 |
| Worker 运行时 | Node.js 20+ (Docker) | Railway/Render/ECS |
| AI SDK | Vercel AI SDK | Worker 内 |
| LLM | OpenAI GPT-4 / Claude | API 调用 |
| 文件存储 | S3 兼容存储（R2/S3） | 独立 |
| 日志 | pino | Worker + API |
| 监控 | Prometheus + Grafana | - |
| 容器化 | Docker + Docker Compose | Worker |

**部署拓扑**：

```
                         ┌──────────────────┐
       用户浏览器 ───────→│  Vercel (Next.js) │
                         │  • SSR 页面       │
                         │  • API Routes    │
                         │  • SSE endpoint  │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ↓             ↓             ↓
           ┌───────────┐  ┌───────────┐  ┌───────────┐
           │ PostgreSQL │  │   Redis   │  │  S3/R2    │
           │ +PgBouncer │  │           │  │           │
           └───────────┘  └─────┬─────┘  └───────────┘
                                │
                    ┌───────────┴───────────┐
                    ↓                       ↓
           ┌──────────────┐        ┌──────────────┐
           │  Worker #1   │        │  Worker #2   │
           │  (Docker)    │        │  (Docker)    │
           │  BullMQ消费   │        │  BullMQ消费   │
           │  LangGraph   │        │  LangGraph   │
           └──────────────┘        └──────────────┘
```

---

## 7. 前端关键页面

| 页面 | 功能 |
|------|------|
| 首页/项目列表 | 创建新项目，查看历史项目及状态，取消运行中项目 |
| 上传页面 | 拖拽上传 + 纯文本粘贴，实时预览解析结果，大文档分段进度 |
| Skill 推荐页 | AI 匹配 Skills + 预估 token + 匹配理由，浏览全部 Skills 逃生舱 |
| 工作流执行页 | 步骤状态视图（✅🔄⏳），弹出确认对话框 |
| 结果页 | 产出展示、下载、复制、重新生成，Skill 版本信息 |
| Skill 管理页 | 查看内置 Skills，版本历史 |

---

## 8. 错误处理

| 场景 | 处理策略 |
|------|---------|
| 文件格式不支持 | 返回明确错误 + 支持的格式列表 |
| 文件过大 | 返回 413 + 大小限制说明 |
| 文件损坏/编码异常 | 解析器隔离错误，编码自动回退（GBK→UTF-8） |
| 大文档（>50K tokens） | 自动分段 + 摘要 |
| AI 调用失败 | 指数退避重试（1s→5s→25s，最多 3 次） |
| AI 输出格式错误 | 重试 2 次，仍失败则暂停让用户选择 |
| Token 预算超 90% | 暂停工作流，提示用户确认是否继续 |
| 用户长时间未响应 | 72h 超时自动取消，保留中间产物 |
| Worker 崩溃 | PostgresSaver 持久化 + BullMQ 自动重试 |
| 数据库连接失败 | 返回 503 + PgBouncer 自动重连 |
| 并发操作冲突 | API 层分布式锁返回 409 Conflict |
| Skill 定义错误 | 执行前 Schema 校验，失败拒绝启动 |
| 工作流死循环检测 | 同一 Step 重复执行 > 10 次自动暂停 |
| Redis 不可用 | 降级：API 返回 503，Worker 停止消费 |

---

## 9. 扩展性设计

| 扩展点 | 方式 |
|--------|------|
| 新文件格式 | 实现 `IParser` 并注册 |
| 新 Skill | JSON Schema 定义上传到 Registry |
| 新 LLM 提供商 | AI SDK 抽象层 + 配置切换 |
| 外部集成 | Webhook 接口 + Outbox Pattern |
| Worker 扩容 | BullMQ 多 Worker 消费 |
| 数据迁移 | Prisma Migration |

---

## 10. 安全考虑

| 安全域 | 措施 |
|--------|------|
| 文件上传 | MIME 伪装检测（扩展名+MIME 双重校验） |
| 外部 Skill | v1.1 隔离执行、独立上下文 |
| Prompt 注入 | 用户输入清理 + `<user_input>` 标签包裹 |
| LLM 数据隔离 | 每次调用独立 context，不跨项目共享 |
| 数据库 | 环境变量管理，PgBouncer 连接池代理 |
| API 鉴权 | JWT（Web） + API Key（Skill），CORS 白名单 + Rate Limiting |
| 敏感信息 | 可选：产出文件敏感信息扫描 |
| XSS | 前端输出转义 + CSP Header |
| CSRF | SameSite Cookie + CSRF Token |
| 文件解析安全 | DocxParser XXE 防护、PDF JS 沙箱 |

---

## 11. MVP 范围与版本路线图

### v1.0 — 核心闭环（6-8 周）

- ✅ 4 个内置 Skill
- ✅ 文件上传 + 纯文本粘贴
- ✅ 5 种格式解析
- ✅ 大文档自动分段 + 摘要
- ✅ AI Skill 匹配 + 浏览全部 Skills
- ✅ LangGraph + BullMQ 双队列工作流
- ✅ SSE 状态推送（Redis Pub/Sub）
- ✅ Token 预算控制（默认 100K/项目）
- ✅ 单用户模式
- ✅ API Key 鉴权
- ✅ Docker Compose 一键部署
- ✅ 结构化日志 + 基本监控

### v1.1 — 协作与信任（+4 周）

- 多用户 RBAC
- 外部 Skill 注册 + 审核
- Skill 评分 + 样例预览
- 项目分享链接
- 邮件/Webhook 通知

### v1.2 — 质量与效率（+4 周）

- 智能加速模式
- 产出版本历史 + Diff 对比
- URL 导入需求
- 外部集成 Webhook

### v2.0 — 平台化（待定）

- Skill 市场
- 自定义 Skill 可视化编辑器
- 团队空间 + 项目模板
- API 调用计量计费
- 多 LLM 提供商动态路由

---

## 附录 A：修订记录

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v1.0 | 2026-05-19 | 初始方案 |
| v2.0 | 2026-05-19 | 修复 BullMQ/LangGraph 状态同步、API/Worker 部署分离、大文档分段、SSE 改为 Redis Pub/Sub、新增可观测性、MVP 路线图 |

## 附录 B：待验证的技术风险

| # | 风险 | 验证方式 | 优先级 |
|---|------|---------|--------|
| 1 | `@langchain/langgraph-checkpoint-postgres` JS 版并发安全性 | 并发写入测试 | 🔴 P0 |
| 2 | LangGraph JS 版 API 稳定性 | 原型验证 | 🔴 P0 |
| 3 | BullMQ stall 检测与长时间暂停兼容性 | 模拟 2h+ 暂停后恢复 | 🟡 P1 |
| 4 | 大文档分段摘要语义保真度 | 对比分段前后 LLM 输出 | 🟡 P1 |
| 5 | PgBouncer + Prisma 在 Vercel Serverless 下表现 | 100 并发压测 | 🟡 P1 |
| 6 | Redis Pub/Sub 大量 SSE 连接性能 | 500+ SSE 连接压测 | 🟢 P2 |
