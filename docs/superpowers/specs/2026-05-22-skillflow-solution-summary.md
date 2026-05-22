# SkillFlow 完整方案总结

> 日期：2026-05-22
> 状态：已确认，待实施

---

## 一、项目定位

**SkillFlow** 是一个多用户 Web 平台，让用户通过浏览器使用 Skills（基于 `.claude/skills/*.md` 格式）完成从需求输入到结构化产出的全流程。

### 核心价值
- **零安装**：纯浏览器访问，无需安装 Claude Code
- **标准化**：需求输入 → Skill 执行 → 产出交付的标准流程
- **可观测**：记录执行日志、用户反馈、使用统计，持续优化 Skill 质量
- **可扩展**：支持用户自制 Skill，平台统一管理

---

## 二、目标用户

| 角色 | 使用场景 |
|------|---------|
| 产品经理 | 上传 PRD，生成测试用例、测试计划 |
| QA 测试 | 使用 prd-to-tests-new 等 Skill 生成结构化测试文档 |
| 开发者 | 使用 writing-plans、test-code 等 Skill 辅助开发 |
| 团队管理员 | 管理团队共享 Skill、查看使用统计 |

---

## 三、系统架构

```
用户浏览器
    ↓ HTTP / WebSocket
Next.js 14 App Router
    ├─ Web UI（React + Tailwind）
    ├─ API Routes（任务提交、状态查询、文件上传）
    ├─ Skill Registry（Skill 加载、解析、管理）
    ├─ Task Engine（任务编排、状态机、暂停/恢复）
    ├─ Tool Layer（Python 脚本执行、文件操作）
    └─ Logger / Stats（日志、统计、反馈）
    ↕
PostgreSQL（数据持久化）
    ↕
LLM API（Claude / DeepSeek / OpenAI）
```

---

## 四、执行引擎方案（已确认：A+ 方案）

### 核心设计：以 Skill 为准

**平台是执行器，Skill 是导演。平台负责"手脚"（文件/脚本执行），LLM 负责"大脑"（分析/生成），Skill 定义"剧本"（执行流程）。**

```
用户提交任务
    ↓
SkillFlow 平台
    ├─ 加载 Skill（读取 .md 的 frontmatter + body）
    ├─ 按 Skill 定义的步骤执行：
    │   ├─ 步骤1：Tool Call（如 docx2text.py）
    │   ├─ 步骤2：LLM Call（AI 分析）
    │   ├─ 步骤3：PAUSE（等用户确认）← Skill 可定义暂停点
    │   ├─ 步骤4：LLM Call（继续生成）
    │   └─ 步骤5：Tool Call（如 md2xmind.py）
    ├─ 每步记录日志
    └─ 保存结果文件
    ↓
返回用户
```

### 与 v1.0 的关键区别

| | v1.0 | v2.0 |
|---|---|---|
| **流程定义** | 平台固定 6 步（解析→匹配→澄清→生成→审核→产出） | **Skill 自己定义流程**，平台只负责执行 |
| **Skill 角色** | 仅提供 Prompt 模板 | **提供完整执行剧本**（步骤顺序、工具调用、暂停点） |
| **灵活性** | 所有 Skill 走同一套流程 | 不同 Skill 可有完全不同的执行步骤 |

**示例对比**：

```
v1.0 执行 test-cases / test-plan / test-code：
都走同一流程：解析 → 匹配 → 澄清 → 生成 → 审核 → 产出
区别只在"生成"步骤用的 Prompt 不同

v2.0 执行 prd-to-tests-new：
Step 1: 读取规则文件（references/*.md）
Step 2: 调用 docx2text.py 转换 PRD
Step 3: AI 分析需求、模块划分
Step 4: AI 生成用例
Step 5: 调用 md2xmind.py 输出思维导图
（Skill 自己定义了 5 步，不需要"匹配"和"审核"步骤）
```

### 执行模型

Skill 的 `.md` body 作为 **System Prompt** 发给 LLM，LLM 按 Prompt 里的指示决定：
- 什么时候调用工具
- 什么时候暂停问用户
- 什么时候输出最终结果

#### 推荐方案：Vercel AI SDK Tool Use（结构化工具调用）

优先使用 Vercel AI SDK 的 `tool()` 函数实现工具调用，而非文本标记解析：

| 对比维度 | 文本标记 `<TOOL>` | Tool Use（推荐） |
|---------|-------------------|-----------------|
| 可靠性 | 依赖 LLM 输出格式正确（易出现遗漏闭合标签、空格误差） | SDK 保证结构化 JSON，无格式歧义 |
| 安全性 | LLM 可能"幻觉"不存在的工具名 | 平台预注册工具白名单，LLM 只能调用已定义工具 |
| 并行调用 | 难以处理多个工具同时调用 | SDK 原生支持并行 tool calls |
| 错误处理 | 需自行实现解析容错 | SDK 内置错误类型，处理标准化 |

```typescript
// Vercel AI SDK Tool Use 示例
const tools = {
  docx2text: tool({
    description: "将 .docx 文件转换为 Markdown",
    parameters: z.object({ filePath: z.string() }),
    execute: async ({ filePath }) => {
      return await execPython('docx2text.py', [filePath]);
    }
  }),
  pause_for_user: tool({
    description: "暂停执行，等待用户确认",
    parameters: z.object({ message: z.string() }),
    // 标记暂停点，由 Task Engine 接管状态切换
  })
};
```

#### 备用方案：文本标记解析（降级策略）

若因特殊原因无法使用 Tool Use，回退到文本标记解析，但必须增加容错逻辑：
- 正则宽松匹配（容忍多余空格、大小写差异）
- 工具名白名单校验（遇到未知工具名直接报错，不执行）
- 标记完整性检查（检测未闭合标签，超时自动中断）

平台解析 LLM 的输出，遇到标记就执行对应操作：
- 遇到 `<TOOL>` → 调用 Tool Layer → 结果返回给 LLM
- 遇到 `<PAUSE>` → 任务状态改为 `paused` → 前端显示确认框
- 用户回复后 → 继续对话 → LLM 继续执行

### LLM 配置
通过环境变量切换，不绑定任何模型，支持多级 Fallback：

```bash
# 主模型配置
LLM_PROVIDER=deepseek           # anthropic / openai / deepseek
DEEPSEEK_API_KEY=sk-...
LLM_MODEL=deepseek-chat

# Fallback 链（主模型不可用时自动切换）
LLM_FALLBACK_PROVIDER=openai    # 备用模型
OPENAI_API_KEY=sk-...
LLM_FALLBACK_MODEL=gpt-4o-mini

# 超时与重试
LLM_TIMEOUT=30000               # 单次调用超时 30s
LLM_MAX_RETRIES=2               # 每个模型最多重试 2 次
```

**Fallback 逻辑**：`deepseek-chat → 超时/失败 → 重试2次 → 仍失败 → gpt-4o-mini → 超时/失败 → 返回错误`

### 工具层（Tool Layer）

| 工具 | 功能 | 实现 | 超时 | 失败策略 |
|------|------|------|------|---------|
| `docx2text` | .docx → Markdown + 图片提取 | Python 标准库 | 60s | 保留已提取文本片段，标记失败页 |
| `md2xmind` | Markdown → XMind 思维导图 | Python + xmind 库 | 30s | 自动重试 1 次，失败则仅提供 .md 下载 |
| `file_read/write` | 文件读写 | Node.js fs | 10s | 返回详细 errno 错误信息 |
| `dir_create` | 目录创建 | Node.js fs | 5s | 已存在则跳过，权限不足则报错 |
| `exec_python` | 执行 Python 脚本 | Node.js child_process | 30s | SIGTERM → 5s → SIGKILL 渐进 kill，记录 stderr |
| `exec_command` | 受限 shell 命令（白名单制） | Node.js child_process | 15s | 非白名单命令直接拒绝，超时 kill |

### 安全沙箱

#### 4.1 Python 脚本隔离
- 使用 `child_process.spawn` 启动独立子进程，非主进程内执行
- 每个任务分配独立临时工作目录（`/tmp/skillflow/{taskId}/`）
- 30 秒超时自动 kill（先 SIGTERM，5 秒后 SIGKILL）
- 禁止网络访问（环境变量 `HTTP_PROXY=""`、`no_proxy="*"`）

#### 4.2 exec_command 白名单
仅允许以下命令，其余直接拒绝执行：
- `python` / `python3` — 执行脚本
- `pip` — 安装依赖（仅限 requirements.txt 内声明）
- `node` — 执行 JS 脚本
- 明确禁止：`rm`、`curl`、`wget`、`sh`、`bash` 及任何网络操作命令

#### 4.3 用户上传安全

| 上传类型 | 安全措施 |
|---------|---------|
| Skill `.md` 文件 | Frontmatter 严格 YAML 解析；Body 仅作为 Prompt 文本发送给 LLM，不执行任何代码 |
| 需求文件（.docx/.txt） | 文件类型白名单校验（魔数检测，非扩展名判断）；最大 20MB |
| 输出文件（.xmind/.md） | 写入前校验路径在沙箱目录内，防止路径穿越 |

#### 4.4 数据清理
- 任务完成后 7 天自动清理临时文件
- 用户上传的 Skill 文件保留至用户删除
- 日志数据保留 90 天（可配置）

---

## 五、Skill 系统

### Skill 格式
复用 Claude Code Skills 的 `.md` 格式，完全兼容：

```markdown
---
name: prd-to-tests-new
description: 将 PRD 转换为测试用例
input:
  - name: requirement
    type: file
    format: docx
---

## 工作流程
...
```

### Skill 来源

| 来源 | 说明 | 权限 |
|------|------|------|
| **内置** | 平台自带，放在 `.claude/skills/` | 所有用户可用 |
| **用户上传** | 通过 Web 上传 `.md` 文件 | 仅上传者可用，可设团队共享 |
| **Git 导入** | 从 Git 仓库批量导入 | 管理员配置 |

### Skill 扩展能力
- 用户可自制 Skill，上传后即可使用
- 平台解析 frontmatter，自动提取输入参数、输出格式
- Skill 可设置是否支持暂停交互（interactive: true/false）

### 流水线（后续迭代）
支持多 Skill 串联执行，前置 Skill 的输出作为后置 Skill 的输入。MVP 不做，已记录待后续开发。

---

## 六、用户系统

### MVP（v2.0）
- 邮箱 + 密码注册登录
- 个人任务历史
- 个人 Skill 管理（上传、查看）

### 后续迭代
- 公司 SSO / OAuth 对接
- 团队协作（共享 Skill、共享任务）
- 角色权限（管理员、普通用户）

---

## 七、任务状态机

```
pending → running → completed
             ↓
          paused（等待用户输入）
             ↓
          failed
```

| 状态 | 说明 |
|------|------|
| `pending` | 任务已提交，等待执行 |
| `running` | 执行中（LLM 调用或工具执行） |
| `paused` | 暂停，等待用户确认/输入 |
| `completed` | 执行完成，结果可用 |
| `failed` | 执行失败，记录错误日志 |

### 前端轮询策略

MVP 阶段使用前端轮询获取任务状态，后续升级 WebSocket 实时推送：

| 任务状态 | 轮询间隔 | 理由 |
|---------|---------|------|
| `pending` | 5s | 排队等待，低频即可 |
| `running` | 2s | 用户正在查看实时日志流 |
| `paused` → `running`（恢复后前 30s） | 1s | 用户刚提交确认，期望即时响应 |
| `completed` / `failed` | 停止轮询 | 终态无需轮询 |

---

## 八、数据模型

### 核心实体

| 实体 | 关键字段 | 说明 |
|------|---------|------|
| **User** | email, name, avatar, passwordHash | 用户（邮箱、姓名、头像、密码哈希） |
| **Skill** | name, description, source, filePath, version, updatedAt | 技能（名称、描述、来源、文件路径、版本号追踪） |
| **Task** | userId, skillId, skillVersion, status, input, output, duration, tokens, retryCount | 任务（用户、Skill、Skill版本快照、状态、输入、输出、耗时、Token、重试次数） |
| **TaskLog** | taskId, sequence, type, input, output, duration, parentLogId | 执行日志（任务、步骤序号、类型、输入、输出、耗时、父日志ID支持嵌套） |
| **TaskFeedback** | taskId, rating, comment | 用户反馈（评分 1-5、评论） |

### 数据存储
- **PostgreSQL**：用户、任务、日志、反馈等结构化数据
- **文件系统**：Skill 文件（.md）、用户上传文件、任务输出文件

---

## 九、前端交互流程（基于现有页面改造）

### 页面清单

| 页面 | 来源 | 改造内容 |
|------|------|---------|
| `/login` | **新增** | 邮箱+密码登录 |
| `/register` | **新增** | 邮箱+密码注册 |
| `/`（首页） | 现有 `app/page.tsx` | "项目"改为"任务"，接真实 Task API |
| `/tasks/new` | 现有 `app/projects/new/page.tsx` | 改为任务创建流程，对接 Skill API |
| `/tasks/[id]/skills` | 现有 `app/projects/[id]/skills/page.tsx` | 动态加载 Skill，AI 推荐匹配 |
| `/tasks/[id]/execute` | 现有 `app/projects/[id]/workflow/page.tsx` | 任务执行监控，支持暂停交互 |
| `/tasks/[id]/result` | 现有 `app/projects/[id]/results/page.tsx` | 结果展示 + 满意度评分 |
| `/skills` | 现有 `app/skills/page.tsx` | Skill 管理，支持上传自定义 Skill |
| `/stats` | **新增** | 个人统计看板 |

### 核心交互流程

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  登录/注册   │ ──→ │   任务列表    │ ──→ │   新建任务       │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                    ↓
                                          ┌─────────────┐
                                          │ 上传需求文件 │
                                          │ 或粘贴文本   │
                                          └──────┬──────┘
                                                 ↓
                                          ┌─────────────┐
                                          │ AI 分析需求  │
                                          │ 推荐 Skill   │
                                          └──────┬──────┘
                                                 ↓
                                          ┌─────────────┐
                                          │ 用户选择 Skill│
                                          └──────┬──────┘
                                                 ↓
                                          ┌─────────────┐
                                          │  执行任务    │
                                          │ 实时显示日志 │
                                          └──────┬──────┘
                                                 ↓
                                    ┌────────────┴────────────┐
                                    ↓                         ↓
                              ┌─────────┐              ┌─────────┐
                              │ 遇到暂停 │              │ 执行完成 │
                              │ 弹出确认框│              │ 显示结果 │
                              └────┬────┘              └────┬────┘
                                   ↓                        ↓
                              ┌─────────┐              ┌─────────┐
                              │ 用户回复 │              │ 满意度  │
                              │ 继续执行 │              │ 评分    │
                              └─────────┘              └─────────┘
```

### 关键页面改造说明

**任务列表页（`/`）**：
- 现有项目卡片改为任务卡片
- 状态标签：待开始 / 执行中 / 已暂停 / 已完成 / 失败
- 操作按钮根据状态变化：选择技能 / 查看进度 / 继续处理 / 查看结果 / 重新执行

**新建任务页（`/tasks/new`）**：
- 保留聊天式交互界面
- AI 问候后，用户描述需求或上传文件
- 平台分析后推荐 Skill（从 Skill Registry 动态加载）
- 用户选择 Skill 后进入执行

**任务执行页（`/tasks/[id]/execute`）**：
- 左侧：执行步骤进度（由 Skill 定义，非固定 6 步）
- 右侧：实时日志流（每步的输入/输出）
- 暂停时：弹出确认对话框或输入框
- 底部：用户输入区（暂停时可用，执行中时禁用）

**结果页（`/tasks/[id]/result`）**：
- 显示最终输出内容（Markdown 渲染）
- 下载结果文件（.md / .xmind）
- 统计信息：处理时间、Token 用量、输出规模
- 满意度评分：1-5 星 + 评论

### 前端状态管理策略

MVP 推荐使用 **TanStack Query + React Context** 组合方案：

| 方案 | 职责 | 推荐度 |
|------|------|--------|
| **TanStack Query** | 服务端状态缓存、轮询管理（`refetchInterval`）、自动重取 | ⭐⭐⭐ 强烈推荐 |
| **React Context + useReducer** | 任务执行会话状态（当前步骤、暂停/运行切换、实时日志流） | ⭐⭐⭐ MVP 推荐 |
| **Zustand** | 跨页面全局状态（后续迭代考虑） | ⭐⭐ 后续迭代 |

**职责划分**：
- **TanStack Query** 管理所有 API 数据（任务列表、Skill 列表、统计），内置 `refetchInterval` 替代手写 `setInterval` 轮询
- **React Context** 管理单次任务执行会话（WebSocket/轮询结果流、暂停状态、用户输入），任务完成后销毁，避免跨页面污染
- **页面级状态**（表单输入、UI 开关）使用组件内部 `useState`，不上提

---

## 十、功能模块

### 10.1 用户端功能

| 模块 | 功能 |
|------|------|
| **登录/注册** | 邮箱+密码，JWT 会话管理 |
| **任务列表** | 查看所有任务，按状态筛选 |
| **新建任务** | 上传文件/粘贴文本，AI 推荐 Skill |
| **任务执行** | 实时监控、步骤进度、暂停交互 |
| **结果查看** | Markdown 渲染、文件下载 |
| **满意度反馈** | 1-5 星评分 + 评论 |
| **Skill 市场** | 浏览内置/上传的 Skill |
| **统计看板** | 个人使用统计 |

### 10.2 平台端功能（内部）

| 模块 | 功能 |
|------|------|
| **Auth Service** | 注册、登录、JWT、密码哈希 |
| **Skill Registry** | 加载 `.claude/skills/*.md`、解析 frontmatter、用户上传管理 |
| **Task Engine** | 状态机（pending→running→paused→completed/failed）、执行编排 |
| **LLM Service** | Vercel AI SDK 封装，支持多模型切换 |
| **Tool Layer** | Python 脚本执行、文件操作、格式转换 |
| **Logger** | 每步执行记录（输入、输出、耗时、Token） |
| **Stats** | 聚合统计（使用次数、满意度、成功率） |

---

## 十一、MVP 范围（v2.0）

### 范围内
- [ ] 用户注册/登录（邮箱+密码）
- [ ] Skill 加载与展示（内置 + 用户上传）
- [ ] 单 Skill 执行（含暂停/恢复交互）
- [ ] 平台工具层（docx2text、file 操作、Python 执行）
- [ ] 任务状态管理与前端轮询
- [ ] 执行日志记录（每步输入/输出/耗时）
- [ ] 用户满意度反馈（1-5 星评分）
- [ ] 基础统计看板（个人维度）

### 范围外（后续迭代）
- [ ] Skill 组合流水线（多 Skill 串联）
- [ ] WebSocket 实时推送（替代轮询）
- [ ] 团队协作（共享、评论、审批）
- [ ] 高级统计（成本分析、趋势图）
- [ ] 通知系统（邮件、IM）
- [ ] 多模型 A/B 测试
- [ ] SSO / OAuth 登录

---

## 十二、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 App Router、React 18、TypeScript、Tailwind CSS |
| 后端 | Next.js API Routes、Prisma ORM |
| 数据库 | PostgreSQL |
| AI SDK | Vercel AI SDK（支持 Claude / DeepSeek / OpenAI）|
| 工具脚本 | Python 3.8+（标准库 + xmind 库）|
| 部署 | Node.js 18+、本地或服务器部署 |

---

## 十三、部署方案

### 环境要求
- Node.js 18+
- Python 3.8+
- PostgreSQL 14+
- 2GB 内存（平台）+ 512MB/并发任务

### 启动流程
```bash
# 1. 安装依赖
npm install
pip install -r requirements.txt

# 2. 数据库迁移
npx prisma migrate dev

# 3. 配置环境变量
# .env
DATABASE_URL="postgresql://..."
LLM_PROVIDER="deepseek"
DEEPSEEK_API_KEY="sk-..."

# 4. 启动
npm run dev
```

---

## 十四、关键设计决策回顾

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 执行引擎 | A+：Claude API + 平台工具层 | 稳定、模型可切换、平台可控 |
| **执行模型** | **以 Skill 为准** | **Skill 定义自己的执行流程，平台只负责执行** |
| Skill 格式 | `.claude/skills/*.md` | 兼容现有生态，用户可自制 |
| 用户系统 | 邮箱+密码（MVP） | 快速落地，后续支持 SSO |
| 任务模式 | 单 Skill（MVP） | 核心闭环先跑通，流水线后续迭代 |
| **前端** | **基于现有 Next.js 页面改造** | **复用现有 UI，对接真实 API** |
| 部署方式 | 无 Docker | 轻量，降低运维成本 |
| 状态推送 | 前端轮询（5s） | MVP 简化，后续升级 WebSocket |

---

## 十五、风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| LLM API 不可用 | 支持多模型切换，降级到备用模型 |
| 工具脚本执行失败 | 沙箱环境、超时控制、详细错误日志 |
| Skill 格式不兼容 | 严格 frontmatter 解析，不兼容时明确报错 |
| Token 成本过高 | 任务级配额、使用审计、模型降级 |
| 用户上传恶意文件 | 文件类型白名单、大小限制、沙箱执行 |

---

## 十六、统计看板指标

### 16.1 使用行为与交互维度

| 指标 | 定义 | 采集方式 |
|------|------|---------|
| **调用量（PV）** | Skill 被调用的总次数 | 每次 Task 创建时 +1 |
| **调用用户数（UV）** | 使用 Skill 的去重用户数 | 按 userId 去重统计 |
| **人均使用次数** | PV / UV | 计算指标 |
| **使用时长/耗时** | 单次任务从提交到完成的耗时（ms） | Task.duration 字段 |
| **使用频率分布** | 日均/周均调用次数 | 按 createdAt 聚合 |
| **输入参数词云** | 用户高频输入的关键词提取 | 分析 Task.input 文本，提取高频词 |
| **中断/跳出点** | 用户在哪个环节取消或退出 | 记录 Task 状态变更到 cancelled 的触发点 |

### 16.2 结果与效果维度

| 指标 | 定义 | 采集方式 |
|------|------|---------|
| **调用成功率** | completed / (completed + failed + timeout) | 按 Task.status 统计 |
| **错误详情分布** | 失败原因的分类统计 | TaskLog.type = 'error' 的分类聚合 |
| **用户满意度** | 1-5 星评分平均分 | TaskFeedback.rating 聚合 |
| **转化贡献** | 核心目标完成率（如：产出文件被下载） | Task.outputFiles 下载次数统计 |
| **技能新增用户数** | 首次使用某 Skill 的用户数 | 按 Skill + userId 去重统计 |

### 16.3 意见收集维度

| 指标 | 定义 | 采集方式 |
|------|------|---------|
| **高频关键词** | 从反馈文本中提取的痛点或赞扬点 | NLP 分析 TaskFeedback.comment |
| **反馈关联技能** | 具体指向哪个 Skill 或功能环节 | TaskFeedback 关联 Task → Skill |
| **反馈解决率** | 已回复/已解决反馈的占比 | 后台标记反馈处理状态 |
| **反馈渠道** | 用户提交反馈的入口来源 | 前端埋点记录来源页面 |

---

**方案确认状态：✅ 已确认**

**方案确认状态：✅ 已确认（v2.0）**

**下一步**：等待用户确认后，调用 `writing-plans` skill 创建详细实现计划。
