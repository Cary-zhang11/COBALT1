# SkillFlow 平台设计文档

> 版本：v2.0
> 日期：2026-05-22
> 状态：确定实施

---

## 1. 产品概述

**平台名称**：SkillFlow

**核心定位**：多用户 Web 平台，用户通过浏览器使用 Skills 完成从需求输入到结构化产出的全流程。平台管理 Skill 生命周期、任务编排、执行日志和用户反馈。

**核心价值**：
- 降低 Skill 使用门槛：无需安装 Claude Code，浏览器即可使用
- 标准化流程：需求输入 → Skill 推荐 → 任务执行 → 产出交付
- 数据沉淀：记录用户会话、操作日志、满意度，持续优化 Skill 质量

---

## 2. 设计决策总览

| 维度 | 决策 | 理由 |
|------|------|------|
| **执行引擎** | Claude API / DeepSeek API + 平台自研工具层 | 稳定、可控、模型可切换；平台负责文件/脚本执行，LLM 负责分析生成 |
| **Skill 格式** | 复用 `.claude/skills/*.md` | 兼容现有生态，用户可自制 Skill |
| **用户模式** | 多用户（注册/登录） | 支持会话隔离、个人历史、使用统计 |
| **任务编排** | 支持单 Skill 执行 + 多 Skill 流水线 | 灵活应对不同场景 |
| **交互模式** | 快速执行（Web 实时）+ 暂停确认 | 简单 Skill 全自动，复杂 Skill 支持人工确认 |
| **部署** | Next.js + PostgreSQL，本地或服务器部署 | 轻量，无需 Docker |

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户浏览器                             │
│         （项目管理、Skill 选择、任务执行、结果查看）              │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                   SkillFlow Platform                        │
│  ┌──────────┐ ┌──────────────┐ ┌─────────────────────────┐ │
│  │  Web UI  │ │  API Routes  │ │    Skill Registry       │ │
│  └──────────┘ └──────────────┘ └─────────────────────────┘ │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │Task Engine   │ │  Tool Layer │ │    Logger / Stats   │ │
│  │（任务编排）   │ │（脚本/文件） │ │  （日志与统计）      │ │
│  └──────────────┘ └─────────────┘ └─────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌────────────┐ ┌────────┐ ┌──────────────┐
   │ PostgreSQL │ │ File   │ │ LLM API      │
   │（数据层）   │ │ System │ │ Claude/DeepSeek│
   └────────────┘ └────────┘ └──────────────┘
```

### 3.1 核心组件

| 组件 | 职责 |
|------|------|
| **Web UI** | 用户操作界面：项目管理、Skill 浏览、任务提交、实时监控、结果查看 |
| **API Routes** | REST API 入口：认证、任务提交、状态查询、结果获取 |
| **Skill Registry** | Skill 管理：加载 `.md` 文件、解析元数据、版本管理、用户上传 |
| **Task Engine** | 任务编排：单 Skill 执行、多 Skill 流水线、状态机管理、暂停/恢复 |
| **Tool Layer** | 平台工具层：执行 Python 脚本、文件读写、图片处理、外部命令 |
| **Logger / Stats** | 日志与统计：执行日志、用户操作记录、满意度收集、使用统计 |

---

## 4. Skill 系统

### 4.1 Skill 格式

复用 Claude Code Skills 的 `.md` 格式：

```markdown
---
name: prd-to-tests-new
description: 将业务需求文档转换为结构化测试用例
input:
  - name: requirement
    type: file
    format: docx
    required: true
output:
  type: file
  format: markdown
---

## 角色定位
你是资深 QA 测试专家...

## 工作流程
...
```

### 4.2 Skill 来源

| 来源 | 说明 | 权限 |
|------|------|------|
| **内置** | 平台自带，放在 `.claude/skills/` 目录 | 所有用户可用 |
| **用户上传** | 用户通过 Web 界面上传 `.md` 文件 | 仅上传者可用，可设为团队共享 |
| **Git 导入** | 从 Git 仓库批量导入 | 管理员配置 |

### 4.3 Skill 组合（流水线）

用户可选择预定义组合或自定义顺序：

```yaml
组合名称: 测试套件生成
步骤:
  - skill: brainstorming
    description: 梳理测试思路
  - skill: writing-plans
    description: 生成测试计划
  - skill: prd-to-tests-new
    description: 生成详细测试用例
```

---

## 5. 执行引擎（A+ 方案）

### 5.1 架构

```
任务提交
    ↓
Skill 加载（读取 .md，解析 frontmatter + body）
    ↓
输入预处理（平台 Tool Layer）
    ├─ 文件转换（docx → md、图片提取）
    ├─ 目录创建
    └─ 依赖检查（Python 环境、pip 包）
    ↓
LLM 调用（Vercel AI SDK）
    ├─ system prompt = Skill body
    ├─ user prompt = 处理后的输入
    └─ 支持多轮对话（暂停/恢复）
    ↓
输出后处理（平台 Tool Layer）
    ├─ 文件保存（.md、.xmind）
    ├─ 格式校验
    └─ 结果汇总
    ↓
返回用户
```

### 5.2 工具层（Tool Layer）

平台预置的工具能力：

| 工具 | 功能 | 实现 |
|------|------|------|
| `docx2text` | .docx 转 Markdown + 图片提取 | Python 脚本（标准库） |
| `md2xmind` | Markdown 转 XMind | Python 脚本 + `xmind` 库 |
| `file_read` | 读取文件内容 | Node.js `fs` |
| `file_write` | 写入文件 | Node.js `fs` |
| `dir_create` | 创建目录 | Node.js `fs` |
| `exec_python` | 执行 Python 脚本 | Node.js `child_process` |
| `exec_command` | 执行 shell 命令（受限） | Node.js `child_process` |

### 5.3 LLM 配置

通过环境变量配置，支持切换：

```bash
# 方案 1：Claude
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-6

# 方案 2：DeepSeek
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
LLM_MODEL=deepseek-chat

# 方案 3：OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o
```

---

## 6. 任务状态机

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ pending │ → │ running │ → │completed│
└────┬────┘    └────┬────┘    └─────────┘
     │              │
     │         ┌────┴────┐
     │         │ paused  │ ← 等待用户输入
     │         └────┬────┘
     │              │
     │         ┌────┴────┐
     └────────→│ failed  │
               └─────────┘
```

| 状态 | 说明 |
|------|------|
| `pending` | 任务已提交，等待执行 |
| `running` | 正在执行（LLM 调用或工具执行中） |
| `paused` | 暂停，等待用户输入（交互式 Skill） |
| `completed` | 执行完成，结果可用 |
| `failed` | 执行失败（错误信息记录到日志） |

---

## 7. 数据模型

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  avatar    String?
  tasks     Task[]
  skills    UserSkill[]
  createdAt DateTime @default(now())
}

model Skill {
  id          String   @id @default(cuid())
  name        String
  description String
  source      String   // builtin | upload | git
  filePath    String   // .md 文件路径
  config      Json?    // frontmatter 解析结果
  isPublic    Boolean  @default(false)
  createdBy   String?  // User ID
  tasks       Task[]
  createdAt   DateTime @default(now())
}

model UserSkill {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  skillId String
  skill   Skill  @relation(fields: [skillId], references: [id], onDelete: Cascade)
  useCount Int @default(0)
  createdAt DateTime @default(now())

  @@unique([userId, skillId])
}

model Task {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  skillId     String
  skill       Skill    @relation(fields: [skillId], references: [id])
  name        String   // 任务名称（自动或用户指定）
  status      String   // pending | running | paused | completed | failed
  input       Json?    // 输入参数（文件路径、文本等）
  output      String?  @db.Text // 最终输出
  outputFiles Json?    // 输出文件列表
  duration    Int?     // 执行耗时（ms）
  tokenUsed   Int?     // Token 消耗
  logs        TaskLog[]
  feedback    TaskFeedback?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model TaskLog {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  step      String   // 步骤标识（如 skill:prd-to-tests:step1）
  type      String   // llm_call | tool_call | user_input | pause | error | info
  input     String?  @db.Text
  output    String?  @db.Text
  duration  Int?     // 耗时（ms）
  createdAt DateTime @default(now())
}

model TaskFeedback {
  id        String   @id @default(cuid())
  taskId    String   @unique
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  rating    Int?     // 1-5 星
  comment   String?  @db.Text
  createdAt DateTime @default(now())
}
```

---

## 8. 用户流程

### 8.1 首次使用

1. 用户注册 / 登录
2. 进入 Skill 市场，浏览可用 Skills
3. 选择 Skill，上传输入文件（如 .docx PRD）
4. 点击执行，等待结果
5. 查看输出，评分反馈

### 8.2 流水线执行

1. 用户选择"新建流水线"
2. 选择 Skill 组合（预定义或自定义顺序）
3. 上传初始输入
4. 平台按顺序执行每个 Skill
5. 每个 Skill 完成后，用户可预览结果，确认后进入下一步
6. 最终汇总所有输出

---

## 9. 统计看板

### 9.1 用户维度

| 指标 | 说明 |
|------|------|
| 总任务数 | 用户累计提交的任务数 |
| 成功率 | completed / (completed + failed) |
| 常用 Skill | 使用次数 Top 5 |
| 平均耗时 | 任务执行平均耗时 |
| 满意度 | 平均评分 |

### 9.2 Skill 维度

| 指标 | 说明 |
|------|------|
| 使用次数 | 所有用户累计使用次数 |
| 平均评分 | 用户反馈平均分 |
| 失败率 | failed / total |
| 平均 Token 消耗 | 单次任务平均用量 |

### 9.3 平台维度

| 指标 | 说明 |
|------|------|
| 日活跃用户 | DAU |
| 任务吞吐量 | 每日任务数 |
| LLM 成本 | 按模型统计 Token 消耗和费用 |

---

## 10. 安全设计

### 10.1 工具层安全

| 限制 | 策略 |
|------|------|
| 命令执行 | 仅允许白名单命令（python、node、git），禁止 rm、sudo 等 |
| 文件访问 | 限制在任务临时目录内，禁止访问上级目录 |
| 网络访问 | 工具层禁止出站网络，仅 LLM 调用可访问 API |
| 资源限制 | 单任务超时 10 分钟，内存限制 512MB |

### 10.2 用户隔离

- 用户只能访问自己的任务和上传的文件
- Skill 可设为私有或公开
- 管理员可查看全局统计

---

## 11. 范围边界

### 11.1 MVP 范围内（v2.0）

- [ ] 用户注册/登录
- [ ] Skill 加载与展示（内置 + 用户上传）
- [ ] 单 Skill 执行（含暂停/恢复）
- [ ] 平台工具层（docx2text、file 操作）
- [ ] 任务状态管理与轮询
- [ ] 执行日志记录
- [ ] 满意度反馈
- [ ] 基础统计看板

### 11.2 MVP 范围外（后续迭代）

- [ ] Skill 组合流水线（多 Skill 串联）
- [ ] 实时 WebSocket 推送（替代轮询）
- [ ] 团队协作（共享 Skill、共享任务）
- [ ] 高级统计（成本分析、趋势图）
- [ ] 通知系统（邮件、IM）
- [ ] 多模型 A/B 测试

---

## 12. 部署方案

### 12.1 环境要求

| 组件 | 要求 |
|------|------|
| Node.js | 18+ |
| Python | 3.8+（用于工具脚本） |
| PostgreSQL | 14+ |
| 内存 | 2GB（平台）+ 512MB/任务 |

### 12.2 启动流程

```bash
# 1. 安装依赖
npm install
pip install -r requirements.txt  # xmind 等

# 2. 数据库迁移
npx prisma migrate dev

# 3. 环境变量配置
# .env
DATABASE_URL="postgresql://..."
LLM_PROVIDER="deepseek"
DEEPSEEK_API_KEY="sk-..."

# 4. 启动
npm run dev
```

---

## 13. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| LLM API 不可用 | 支持多模型切换，降级到备用模型 |
| 工具脚本执行失败 | 沙箱环境、超时控制、错误日志 |
| Skill 格式不兼容 | 严格解析 frontmatter，不兼容时给出明确错误 |
| 用户上传恶意文件 | 文件类型白名单、大小限制、沙箱执行 |
| Token 成本过高 | 任务级配额、使用审计、模型降级 |
