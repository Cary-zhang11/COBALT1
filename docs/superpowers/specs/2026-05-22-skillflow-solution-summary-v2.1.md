# SkillFlow 完整方案总结 v2.1

> 日期：2026-05-22（v2.1 修订）
> 状态：P0 决策已敲定，待实施
> 上一版：[v2.0](./2026-05-22-skillflow-solution-summary.md)（同目录原文件保留）
> 变更摘要：详见文末「附录 A：v2.0 → v2.1 变更清单」

---

## 一、项目定位

**SkillFlow** 是一个面向**内部团队**的 Web 平台，让用户通过浏览器使用 Skills（基于 `.claude/skills/*.md` 格式）完成从需求输入到结构化产出的全流程。

### 核心价值
- **零安装**：纯浏览器访问，无需安装 Claude Code
- **零迁移**：Claude Code Skill 原样可用（不修改 .md，自带脚本可执行）
- **标准化**：需求输入 → Skill 执行 → 产出交付的标准流程
- **可观测**：记录执行日志、用户反馈、使用统计，持续优化 Skill 质量
- **可扩展**：支持用户自制 Skill，平台统一管理

### 部署假设（重要边界条件）

> ⚠️ **SkillFlow MVP 仅供内部团队使用，不对外开放注册**。
> 该假设决定了以下设计选择：
>
> - **Skill 内嵌脚本默认信任**（仅做基础防呆，不做安全沙箱）
> - **任意成员可上传 Skill**，无管理员审核流程
> - **网络部署在内网/受信环境**，不暴露公网端口
>
> **如未来要对外开放注册或多租户化，必须**：
> 1. 重做内嵌脚本沙箱（Docker 容器 / seccomp / 进程级权限隔离）
> 2. 增加管理员审核机制
> 3. 重新评估资源配额与 DDoS 防护

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
    ↓ HTTP（轮询）
Next.js 14 App Router
    ├─ Web UI（React + Tailwind）
    ├─ API Routes（任务提交、状态查询、文件上传）
    ├─ Skill Registry（Skill 加载、解析、目录/zip/git 导入）
    ├─ Task Engine（任务编排、状态机、暂停/恢复）
    ├─ ┌──────────────────────────────────────┐
    │  │ IAgentRuntime 抽象层                   │
    │  ├──────────────────────────────────────┤
    │  │ ClaudeAgentSDKRuntime（MVP 实现）      │
    │  │ VercelAISDKRuntime（v2.1 stub，留口）  │
    │  └──────────────────────────────────────┘
    ├─ Tool Layer（Python 脚本执行、文件操作、路径变量注入）
    ├─ Model Capability Probe（模型能力探针）
    └─ Logger / Stats（日志、统计、反馈）
    ↕
PostgreSQL（数据持久化）
    ↕
LLM API
    ├─ Anthropic 官方（MVP 默认）
    └─ 第三方兼容接口（DeepSeek / Kimi 等，通过 ANTHROPIC_BASE_URL 切换）
```

---

## 四、执行引擎方案（v2.1 大改）

### 4.1 核心设计：以 Skill 为准

**平台是执行器，Skill 是导演。平台负责"手脚"（文件/脚本执行），LLM 负责"大脑"（分析/生成），Skill 定义"剧本"（执行流程）。**

```
用户提交任务
    ↓
SkillFlow 平台
    ├─ 加载 Skill（读取 SKILL.md 全文 + references/ + scripts/）
    ├─ 启动 Agent Runtime（默认 Claude Agent SDK）
    ├─ Skill body 作为 System Prompt 注入 → LLM 在 agent loop 中自主行动：
    │   ├─ 调用 tool（如 docx2text.py）
    │   ├─ 暂停（pause_for_user tool）等用户确认
    │   ├─ 继续推理 / 生成
    │   └─ 调用 tool（如 md2xmind.py）输出结果
    ├─ 每步记录日志（TaskLog）
    └─ 保存结果文件
    ↓
返回用户
```

> 📌 **重要澄清**：Skill `.md` body 里的"Step 1 → Step 2 → ..."只是 **Skill 作者写给 LLM 看的工作流程提示**，**平台不解析步骤结构**。平台只启动一次 agent loop，LLM 根据 prompt 自主决定调用工具的顺序与时机。

### 4.2 Agent Runtime 抽象层（v2.1 新增）

为了「MVP 先跑通、后期可切换」，引入抽象层：

```typescript
interface IAgentRuntime {
  start(skill: Skill, input: TaskInput): AsyncIterable<AgentEvent>;
  resume(sessionId: string, userInput: string): AsyncIterable<AgentEvent>;
  probe(): Promise<ModelCapability>;  // 模型能力探针
}
```

**Runtime 实现矩阵**：

| Runtime | MVP 状态 | 能力 | 用途 |
|---|---|---|---|
| `ClaudeCodeCLIRuntime` | ✅ **MVP 唯一实现** | CLI 内置全部 tool（Read/Write/Bash/Grep/Vision）+ 多模型 | 最快跑通，零 tool 开发 |
| `VercelAIRuntime` | 🚧 仅留 stub | 自定义 tool + 多模型 + 进程内执行（轻量） | 后续并发量上来时切换 |

> 📌 **MVP 选用 Claude Code CLI headless 模式**（`claude -p ... --output-format stream-json`）：
> - CLI 自带 Read（含图片 vision）、Write、Bash、Grep、Glob 等全部工具，**无需自行实现**
> - 已支持多模型切换（Anthropic / Kimi / DeepSeek，通过 CLI 配置）
> - `--resume` 命令天然支持暂停/恢复，session 文件磁盘持久化
> - `--cwd` 天然支持沙箱目录隔离
> - `--allowedTools` 天然支持工具白名单
>
> **后续升级路径**：当并发任务 > 20 个或需要更精细 tool 控制时，切换到 `VercelAIRuntime`（自行实现 tool + 进程内执行，内存开销小）。

**切换方式**：环境变量 `AGENT_RUNTIME=claude-cli | vercel-ai`，业务代码零改动。

### 4.3 模型与多 Provider（v2.1 调整）

**MVP 直接复用 Claude Code CLI 的模型配置**。CLI 本身已支持多模型切换（如截图所示已接 Kimi），无需平台额外实现。

```bash
# .env 配置示例

# === Agent Runtime ===
AGENT_RUNTIME=claude-cli

# === CLI 模型配置（由 Claude Code CLI 自身管理）===
# 通过 `claude config` 或 CLI 配置文件切换模型
# 当前已支持：Anthropic / Kimi / DeepSeek 等

# === 平台配置 ===
TASK_TIMEOUT=300000         # 单任务总超时 5 分钟
TASK_MAX_STEPS=30           # agent loop 最大轮次（--max-turns）
SANDBOX_ROOT=/sandbox       # 沙箱根目录
```

> 📌 **多模型切换**：CLI 已经内置了模型切换能力，平台不需要自己管 API Key 路由。
> 通过 CLI 的 `--model` 参数或全局配置即可切换，对平台代码透明。
>
> ⚠️ **多模型 Fallback** 留到后续：MVP 用单一模型，CLI 失败时直接标记任务 failed + 支持重试。

### 4.4 模型能力探针（v2.1 新增）

不同 Provider 的能力差异很大（特别是图片识别），必须在启动时检测：

```typescript
type ModelCapability = {
  toolCalling: boolean;        // 支持 tool calling
  vision: boolean;             // 支持图片多模态识别
  maxContextTokens: number;    // 上下文窗口
  parallelToolCalls: boolean;  // 支持并行 tool 调用
  streaming: boolean;          // 支持 streaming
};
```

**典型探测结果**：

| Provider | toolCalling | **vision** | maxContext | 备注 |
|---|---|---|---|---|
| Anthropic 官方 | ✅ | ✅ | 200K | MVP 默认，全功能 |
| DeepSeek 兼容接口 | ✅ | ❌ | 64K | 文本 Skill 可用，图片 Skill 半残 |
| Kimi 兼容接口 | ✅ | ❌ | 128K | 同上 |

**前端表现**：
- Skill 详情页根据当前模型探针结果，**对依赖 vision 的 Skill 顶部展示警告**："当前模型不支持图片识别，本 Skill 可能输出不完整结果。是否仍要启动？"
- 用户选择继续 / 取消，**允许启动但有知情提示**

### 4.5 Tool Layer

**MVP 方案：CLI 内置 tool，平台不实现**

| 工具 | 功能 | 实现方 | 平台要做的 |
|------|------|--------|-----------|
| `Read` | 文件读取（含图片 vision） | **CLI 内置** | 无 |
| `Write` | 文件写入 | **CLI 内置** | 无 |
| `Grep` / `Glob` | 文件搜索 | **CLI 内置** | 无 |
| `Bash` | shell 命令执行 | **CLI 内置** | 通过 `--allowedTools` 限制 |
| `docx2text` | Skill 自带 Python 脚本 | **CLI 执行 Bash** | Skill 自带，无需平台干预 |
| `md2xmind` | Skill 自带 Python 脚本 | **CLI 执行 Bash** | 同上 |

**工具限制**：通过 CLI 启动参数 `--allowedTools "Read,Write,Bash,Grep,Glob"` 控制可用工具白名单。

> 📌 **对比原方案**：v2.1 原方案需要平台自行实现所有 tool（~200 行代码/每个 tool）。
> CLI 方案下，**平台零 tool 开发**，全部由 CLI 内置处理。

### 4.6 暂停交互机制

**CLI 方案下的暂停**：LLM 在 Skill 执行中如果需要用户确认，会直接在输出中提问。平台通过解析 `stream-json` 检测到 LLM 输出了疑问句/选项后，暂停推送并等待用户回复。

**实现方式**：
1. CLI 输出包含选项（如"请确认：A/B/C"）→ 平台检测到后切换任务状态为 `paused`
2. 用户在前端回复 → 平台通过 `claude --resume <session-id> -p "用户回复：..."` 继续
3. CLI 自动加载对话历史，继续执行

> 📌 **与原方案 `pause_for_user` tool 的区别**：
> - 原方案：自定义 tool，LLM 主动调用，结构化参数
> - CLI 方案：LLM 自然语言提问，平台解析检测暂停点
>
> CLI 方案更简单（不需要注册自定义 tool），但暂停检测不够"精确"。
> MVP 可用正则/关键词检测（"请确认"、"是否继续"、选项列表格式），后续如需精确控制再切换到自定义 tool 方案。

### 4.7 基础防呆（不是安全沙箱）

> 📌 基于"仅内部使用"假设，**不做企业级安全沙箱**，但保留以下防呆措施防止无意失误：

| 维度 | MVP 实现 | 目的 |
|---|---|---|
| 进程隔离 | `child_process.spawn` 独立子进程 | 隔离崩溃，防止主进程挂掉 |
| 工作目录隔离 | 每任务独立 `/sandbox/{taskId}/` 目录 | 防止多任务文件互相覆盖 |
| 超时控制 | 单脚本 30s（SIGTERM → 5s → SIGKILL） | 防止死循环 |
| 运行身份 | 平台进程不以 root 运行 | 防止一次手抖把系统玩坏 |
| 路径校验 | 写文件前 `path.resolve` 校验前缀在沙箱内 | 防止路径穿越 |
| 数据清理 | 临时文件 7 天清理，可下载产物按用户保留 | 防止磁盘占满 |

**不实现**：网络阻断、seccomp、Docker 隔离、内存限制（这些等对外开放再做）。

### 4.8 暂停/恢复的上下文持久化（v2.1 新增）

**CLI 方案下，session 管理由 CLI 内置处理**：

```
暂停时：
├─ CLI session 文件保存在服务器 ~/.claude/sessions/{session-id}
├─ 平台 DB 记录 Task.sessionId（关联 CLI session）
├─ 平台 DB 记录 Task.pauseReason + Task.pausedAt
└─ 对话历史全在 CLI session 文件中，平台不用自己存 messages

恢复时：
├─ 平台从 DB 查到 sessionId
├─ spawn('claude', ['--resume', sessionId, '-p', userReply])
└─ CLI 自动加载完整对话历史，继续 agent loop
```

**与原方案的对比**：
| | 原方案（自己存 messages） | CLI 方案 |
|---|---|---|
| 对话历史存储 | 平台 DB（JSONB） | CLI session 文件（磁盘） |
| 恢复方式 | 重建 messages 数组 + streamText | `--resume` 一个参数搞定 |
| 实现量 | ~100 行持久化/恢复代码 | ~5 行 spawn 代码 |
| 限制 | 无 | 单服务器（session 文件在本地磁盘） |

**超时清理**：暂停 7 天未恢复的任务自动标记为 `cancelled`，清理对应 session 文件。

---

## 五、Skill 系统（v2.1 大改）

### 5.1 Skill 格式（完全兼容 Claude Code）

**Skill 文件 `.md` 零修改**。平台不在 frontmatter 加任何字段，所有平台元数据走 DB。

```markdown
---
name: prd-to-tests-new
description: 将业务需求文档（PRD）转换为结构化测试用例文档...
---

# PRD → 测试用例生成
...（Skill body，作为 System Prompt 注入 LLM）
```

### 5.2 Skill 单元：目录或 zip 包

> ⚠️ Skill 不是单文件，而是 **目录**（可含 `references/`、`scripts/`、`assets/` 等）。

**Skill 目录典型结构**：
```
prd-to-tests-new/
  ├─ SKILL.md            ← 入口，必须存在
  ├─ references/         ← 可选，Skill body 引用的规则文件
  │   ├─ test_dimensions.md
  │   └─ ...
  ├─ scripts/            ← 可选，Skill 自带的可执行脚本
  │   ├─ docx2text.py
  │   └─ md2xmind.py
  └─ assets/             ← 可选，静态资源
```

### 5.3 Skill 来源（v2.1 调整）

| 来源 | 上传方式 | 权限 |
|------|---------|------|
| **内置** | 平台部署时随 `.claude/skills/` 提供 | 所有用户可用 |
| **用户上传（zip）** | Web 上传 zip 包，平台解压保留目录结构 | MVP：仅上传者可用 |
| **Git 导入** | 管理员配置 Git 仓库 URL，平台定时同步 | 团队共享（v2.1 完整支持） |

> 📌 MVP 阶段团队共享能力延迟到 v2.1（详见「六、用户系统」），但 Git 导入接口先实现。

### 5.4 Claude Code 兼容性矩阵（v2.1 新增）

**Skill 导入时，平台扫描 SKILL.md 引用的工具，对不支持的工具明确标红**：

| Claude Code 原生 Tool | SkillFlow 支持度 | 说明 |
|---|---|---|
| `Read` | ✅ 完整支持 | 含图片多模态（视模型能力） |
| `Write` | ✅ 完整支持 | 限制写入路径在沙箱内 |
| `Grep` / `Glob` | ✅ 完整支持 | |
| `Bash` | ⚠️ 受限支持 | 白名单（python/pip/node/mkdir 等） |
| `Edit` / `MultiEdit` | ✅ 完整支持 | 复用 Write 逻辑 |
| `WebSearch` / `WebFetch` | ❌ MVP 不支持 | v2.1 评估 |
| `Task`（子 agent） | ❌ MVP 不支持 | 单 agent loop，v2.1 评估 |
| `BashOutput` / `KillBash` | ❌ MVP 不支持 | 不暴露交互式 shell |
| MCP 工具 | ❌ MVP 不支持 | v2.2+ 评估 |

**导入时不兼容警告**：
- Skill 导入时静态扫描内容，发现引用了不支持的 tool（如 `WebSearch`），在 Skill 详情页打红标：「⚠️ 此 Skill 使用了 WebSearch，本平台暂不支持，执行时可能跳过该步骤」

### 5.5 平台元数据表（v2.1 新增）

> Skill .md 文件零修改，所有平台限制信息全在 DB：

```sql
Skill {
  id            uuid
  name          string      -- 来自 frontmatter
  description   string      -- 来自 frontmatter（给 LLM 看的）
  source        enum        -- builtin / user_upload / git
  filePath      string      -- Skill 目录路径
  version       string      -- 内容 hash 或语义版本

  -- 平台元数据（与 .md 解耦）
  allowedTools  string[]    -- 平台覆盖的 tool 白名单（默认全开）
  maxSteps      int         -- agent loop 最大轮次（防失控）
  tokenBudget   int         -- 单任务 token 上限
  visibility    enum        -- private / team（v2.1）
  requires      string[]    -- 能力声明：['vision', 'tool_calling']

  -- displayMeta（给 PM/QA 看的友好展示）
  displayMeta jsonb {
    tagline       string    -- 一句话简介（人话）
    useCase       string    -- 适用场景
    inputSample   string    -- 输入示例
    outputSample  string    -- 输出示例（链接或截图）
  }

  uploadedBy   uuid (FK → User)
  createdAt    timestamp
  updatedAt    timestamp
}
```

### 5.6 Skill 路径变量约定（v2.1 新增）

`prd-to-tests-new` 等 Skill 在 body 里硬编码了路径推导（如 `{技能目录}/../../../`）。Web 平台没有"项目根目录"概念，平台必须注入虚拟变量：

| 变量名 | 含义 | 实际值（示例） |
|---|---|---|
| `{SKILL_DIR}` | 当前 Skill 目录 | `/var/skillflow/skills/prd-to-tests-new/` |
| `{WORKSPACE_ROOT}` | 任务工作区根目录（替代"项目根目录"） | `/sandbox/{taskId}/workspace/` |
| `{TASK_OUTPUT_DIR}` | 任务输出目录 | `/sandbox/{taskId}/output/` |
| `{TASK_TEMP_DIR}` | 任务临时目录 | `/sandbox/{taskId}/tmp/` |
| `{TASK_ID}` | 任务 ID | `task_abc123` |

**实现方式**：
- 平台启动 Agent Runtime 时把这些变量注入子进程环境变量 + Skill body 注入时做 placeholder 替换
- Skill 作者文档要求：路径优先用 `{WORKSPACE_ROOT}` 而非硬编码 `../../../`

### 5.7 内嵌脚本权限（v2.1 调整）

> 📌 基于"仅内部使用"假设：**信任所有 Skill 内嵌脚本**，平台不审核。

- 用户上传 Skill 自带的 Python 脚本可直接执行
- 仅做基础防呆（见 4.7），不做安全沙箱
- **未来对外开放前必须重做**（参见「一、部署假设」）

### 5.8 Skill 扩展能力

- 用户可自制 Skill，zip 上传后即可使用
- 平台解析 frontmatter，自动提取 name / description
- displayMeta 在 Skill 详情页支持作者后续手动编辑
- Skill 支持版本快照：每次 .md 内容变化生成新 version_id，旧任务关联旧版本

---

## 六、用户系统

### 6.1 MVP（v2.1）— 纯个人模式

- 邮箱 + 密码注册登录
- 个人任务历史
- 个人 Skill 上传与管理
- **暂无团队/共享功能**（visibility 字段已预留）

### 6.2 v2.1 之后迭代

- 单团队共享：Skill visibility 字段启用 team 选项，任务列表加「我的任务 / 团队任务」Tab
- 公司 SSO / OAuth 对接
- 完整团队协作（多团队、邀请成员、角色权限）

> 📌 **宗旨保留为"Claude Skills 的 Web 化团队版"**，MVP 阶段以"纯个人"形态先跑通闭环，团队能力按用户决策延迟到 v2.1 之后处理。

---

## 七、任务状态机

```
pending → running → completed
             ↓
          paused（等待用户输入）
             ↓
          failed / cancelled
```

| 状态 | 说明 |
|------|------|
| `pending` | 任务已提交，等待执行 |
| `running` | 执行中（LLM 调用或工具执行） |
| `paused` | 暂停，等待用户确认/输入（executionContext 持久化到 DB） |
| `completed` | 执行完成，结果可用 |
| `failed` | 执行失败，记录错误日志 |
| `cancelled` | 用户主动取消 / 暂停超时自动取消（默认 7 天） |

### 7.1 前端轮询策略

| 任务状态 | 轮询间隔 | 理由 |
|---------|---------|------|
| `pending` | 5s | 排队等待 |
| `running` | 2s | 用户查看实时日志流 |
| `paused` → `running`（恢复后前 30s） | 1s | 用户期望即时响应 |
| `completed` / `failed` / `cancelled` | 停止轮询 | 终态 |

---

## 八、数据模型（v2.1 扩展）

### 核心实体

| 实体 | 关键字段 |
|------|---------|
| **User** | id, email, name, avatar, passwordHash, createdAt |
| **Skill** | 见 5.5 完整定义（含 allowedTools / maxSteps / tokenBudget / visibility / requires / displayMeta） |
| **SkillVersion** | id, skillId, versionHash, contentSnapshot, createdAt（每次 .md 内容变更生成） |
| **Task** | id, userId, skillId, **skillVersionId**, status, input, output, duration, **agentRuntime**, **modelProvider**, **tokenUsage**, **executionContext**, retryCount, createdAt |
| **TaskLog** | id, taskId, sequence, type（`llm_call`/`tool_call`/`pause`/`error`/`system`）, input, output, duration, errorCode, errorMessage, stack, parentLogId |
| **TaskFeedback** | id, taskId, rating（1-5）, comment, createdAt |
| **SkillFeedbackAggregate**（v2.1）| skillId, version, avgRating, commentKeywords, failureTopErrors（定时任务聚合） |

### 数据存储
- **PostgreSQL**：用户、任务、日志、反馈、Skill 元数据
- **文件系统**：Skill 目录（含 .md / scripts / references）、用户上传文件、任务输出文件
- **持久化策略**：
  - **临时产物**（沙箱工作目录）：7 天清理
  - **可下载产物**（用户最终下载的 .md / .xmind）：按用户保留，单独存储目录
  - 单实例部署即可，多实例后续接 S3/MinIO

---

## 九、前端交互流程

### 9.1 页面清单

| 页面 | 来源 | 改造内容 |
|------|------|---------|
| `/login` | **新增** | 邮箱+密码登录 |
| `/register` | **新增** | 邮箱+密码注册 |
| `/`（首页） | 现有 `app/page.tsx` | 任务列表，含「试用示例任务」入口 |
| `/tasks/new` | 现有 `app/projects/new/page.tsx` | 任务创建，Skill 推荐 |
| `/tasks/[id]/skills` | 现有 `app/projects/[id]/skills/page.tsx` | Skill 选择，含模型探针兼容性提示 |
| `/tasks/[id]/execute` | 现有 `app/projects/[id]/workflow/page.tsx` | 任务执行监控，支持暂停交互 |
| `/tasks/[id]/result` | 现有 `app/projects/[id]/results/page.tsx` | 结果展示 + 满意度评分 |
| `/skills` | 现有 `app/skills/page.tsx` | Skill 市场（含上传） |
| `/skills/[id]` | **新增** | Skill 详情页（聚合反馈/版本/统计/displayMeta） |
| `/stats` | **新增** | 个人统计看板 |
| `/settings/model` | **新增** | 模型 Provider 切换 + 能力探针展示（管理员） |

### 9.2 关键页面改造说明

**任务执行页（`/tasks/[id]/execute`）**：
- 左侧：执行步骤进度（由 LLM 自主决定，不固定）
- 右侧：实时日志流（每步的 LLM 调用 / tool 调用 / 输入输出）
- 暂停时：弹出确认对话框，展示 `userMessage`（不展示 `aiContext`）
- 错误展示双层：默认显示中文友好语，「查看技术详情」可展开 stack trace

**Skill 详情页（`/skills/[id]`）**（v2.1 新增）：
- 标题 + tagline（人话）
- 适用场景 / 输入示例 / 输出示例（截图）
- 平均耗时 / 满意度 / 成功率（按版本对比）
- 所有反馈列表（评分 + 评论 + AI 提取关键词）
- 兼容性标记：✅ 完全兼容 / ⚠️ 部分受限（如当前模型不支持图片）/ ❌ 不兼容
- 版本历史（每次 .md 修改的 diff）
- 「试一次」入口（用平台预置 sample input）

**新建任务页（`/tasks/new`）**：
- 保留聊天式交互
- AI 推荐 Skill 时，**结合模型能力探针** 标注每个推荐项是否可用
- 对依赖 vision 但当前模型不支持的 Skill：标红 + 顶部警告 + 允许继续

> 📌 **Skill 推荐机制**（预留接口，实现策略待定）：
>
> 推荐逻辑以 `ISkillRecommender` 接口封装，MVP 先实现最简版本，后续可无缝替换：
>
> ```typescript
> interface ISkillRecommender {
>   recommend(userInput: string, availableSkills: Skill[]): Promise<SkillRecommendation[]>;
> }
> ```
>
> | 策略 | 实现复杂度 | 推荐质量 | 计划 |
> |---|---|---|---|
> | **关键词匹配**（MVP 默认） | 低 | 中 | 先用这个，0 额外依赖 |
> | LLM 语义匹配（用 description 拼 prompt） | 中 | 高 | 需要一次 LLM call，v2.1 考虑 |
> | Embedding + 向量相似度（pgvector） | 高 | 最高 | 引入新依赖，v2.2+ |
>
> MVP 使用关键词匹配：用户输入 + Skill `name`/`description`/`displayMeta.useCase` 做 TF-IDF 或简单包含匹配，不引入向量数据库。

### 9.3 前端状态管理

| 方案 | 职责 | 推荐度 |
|------|------|--------|
| **TanStack Query** | API 数据缓存、轮询管理（`refetchInterval`） | ⭐⭐⭐ |
| **React Context + useReducer** | 任务执行会话状态（步骤、暂停、日志流） | ⭐⭐⭐ |
| **Zustand** | 跨页面全局状态（用户、模型探针） | ⭐⭐ |

---

## 十、功能模块

### 10.1 用户端功能

| 模块 | 功能 |
|------|------|
| **登录/注册** | 邮箱+密码，JWT 会话 |
| **任务列表** | 按状态筛选，含「试用示例任务」 |
| **新建任务** | 上传文件/粘贴文本，AI 推荐 Skill（带兼容性标记） |
| **任务执行** | 实时监控、步骤进度、暂停交互、错误友好化 |
| **结果查看** | Markdown 渲染、文件下载 |
| **满意度反馈** | 1-5 星评分 + 评论 |
| **Skill 市场** | 浏览内置/上传的 Skill |
| **Skill 详情页** | 反馈聚合、版本对比、兼容性、试用入口 |
| **统计看板** | 个人使用统计 |

### 10.2 平台端功能

| 模块 | 功能 |
|------|------|
| **Auth Service** | 注册、登录、JWT、密码哈希 |
| **Skill Registry** | 加载 zip/Git/内置 Skill，解析 frontmatter，扫描兼容性 |
| **Task Engine** | 状态机、执行编排、暂停态持久化 |
| **Agent Runtime** | IAgentRuntime 抽象层 + ClaudeAgentSDKRuntime |
| **Tool Layer** | Bash 白名单、文件操作、路径变量注入 |
| **Model Capability Probe** | 启动时探测当前 Provider 能力 |
| **Logger** | 每步执行记录 |
| **Stats** | 聚合统计 + 反馈关键词提取（定时任务） |

---

## 十一、MVP 范围（v2.1 重写）

### 范围内
- [ ] 用户注册/登录（邮箱+密码，纯个人模式）
- [ ] Skill 加载（内置 + zip 上传 + Git 导入接口）
- [ ] Skill 平台元数据表（allowedTools / maxSteps / tokenBudget / requires / displayMeta）
- [ ] Claude Code 兼容性矩阵 + 不兼容静态扫描标红
- [ ] Skill 路径变量注入（`--cwd` 沙箱目录）
- [ ] **IAgentRuntime 抽象层** + ClaudeCodeCLIRuntime 实现
- [ ] Claude Code CLI headless 集成（spawn + stream-json 解析 + --resume）
- [ ] 模型能力探针（基于 CLI 当前模型配置）
- [ ] 单 Skill 执行（含暂停/恢复，基于 CLI session）
- [ ] 暂停态 sessionId 持久化到 DB + session 文件保留磁盘
- [ ] **纯会话式执行界面**（去掉固定步骤栏，agent 输出实时 stream 为 chat）
- [ ] 任务状态机与前端 SSE 推送
- [ ] 执行日志（stream-json 解析存 TaskLog）
- [ ] 用户满意度反馈（1-5 星 + 评论）
- [ ] Skill 详情页（反馈聚合、版本快照对比）
- [ ] AI 反馈关键词聚合（定时任务）
- [ ] 基础统计看板（个人维度）
- [ ] 试用示例任务入口

### 范围外（v2.1+ 迭代）
- [ ] VercelAIRuntime 实现（自行实现 tool + 进程内执行，适合高并发）
- [ ] LLM Fallback 链
- [ ] 单团队共享（visibility = team 启用）
- [ ] Skill 组合流水线（多 Skill 串联）
- [ ] WebSocket 实时推送（替代轮询）
- [ ] 完整团队协作（多团队、邀请、权限）
- [ ] 高级统计（成本分析、趋势图）
- [ ] 通知系统（邮件、IM）
- [ ] SSO / OAuth
- [ ] WebSearch / Task / MCP 支持

---

## 十二、技术栈（v2.1 调整）

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 App Router、React 18、TypeScript、Tailwind CSS |
| 后端 | Next.js API Routes（standalone Node 部署）、Prisma ORM |
| 数据库 | PostgreSQL |
| **Agent 执行** | **Claude Code CLI headless（MVP）/ Vercel AI SDK（后续）** |
| 工具脚本 | Python 3.8+（标准库 + xmind 库等，由 CLI 内 Bash tool 执行） |
| 状态管理 | TanStack Query + React Context |
| 部署 | Node.js 18+ standalone server，**非 Vercel Serverless** |

> ⚠️ **部署模式重要约束**：必须使用 `next start` 长进程部署，**不能用 Vercel Serverless**。
> 理由：Skill 执行是长任务（30s ~ 数分钟，含暂停可达数小时），Serverless 10-60s 超时限制不适用，且 `child_process.spawn` 在多数 Serverless 环境受限。

---

## 十三、部署方案

### 13.1 环境要求

- Node.js 18+
- **Claude Code CLI**（`npm install -g @anthropic-ai/claude-code`）
- Python 3.8+（含 xmind、python-docx 等 Skill 依赖）
- PostgreSQL 14+
- 4GB 内存（平台 2GB + 每并发任务 ~200MB CLI 子进程）
- **运行身份**：专用 non-root 用户（如 `skillflow:skillflow`）
- **网络**：内网部署；outbound 放行 LLM API 域名（Anthropic / Kimi 等）

### 13.2 启动流程

```bash
# 1. 安装平台依赖
npm install
pip install -r requirements.txt

# 2. 安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 3. 配置 CLI 模型（首次）
claude config  # 选择 model provider，配置 API key

# 4. 数据库迁移
npx prisma migrate dev

# 5. 平台环境变量
# .env
# DATABASE_URL="postgresql://..."
# AGENT_RUNTIME=claude-cli
# SANDBOX_ROOT=/sandbox
# TASK_TIMEOUT=300000

# 6. 启动
npm run build
npm run start  # standalone Node 长进程
```

### 13.3 部署假设回顾

> 🔒 **本部署方案基于"仅内部团队使用"假设**：
> - 不实现安全沙箱（仅基础防呆）
> - 不限制网络（除非企业内网策略要求）
> - 不审核用户上传的 Skill
>
> **对外开放前必须重做**：Docker 容器化 / seccomp / 管理员审核 / 资源配额。

---

## 十四、关键设计决策回顾（v2.1 追加 9 条）

| 决策点 | v2.0 选择 | v2.1 选择 |
|--------|----------|----------|
| **执行引擎** | A+：自建工具层 | **Claude Code CLI headless + IAgentRuntime 抽象层** |
| **执行模型** | 以 Skill 为准 | 以 Skill 为准（LLM Agent Loop，由 CLI 内部驱动） |
| **执行界面** | 固定 6 步进度 | **纯会话界面**（agent 输出实时 stream 为 chat） |
| **Skill 格式** | `.md` 文件 | **目录/zip 包**（含 references/scripts） |
| **Skill 文件修改** | （未明确） | **完全零修改**，限制信息走 DB 元数据 |
| **Tool 实现** | 平台自行实现 | **CLI 内置全部 tool**，平台零 tool 开发 |
| **Skill 反馈闭环** | 仅采集 | **作者可见 + 版本快照 + AI 关键词汇总** |
| **MVP 团队形态** | （未明确） | **纯个人**（团队 v2.1+ 处理；宗旨表述不变） |
| **Agent 运行时** | Vercel AI SDK | **CLI headless（MVP）+ Vercel AI SDK（后续 stub）** |
| **MVP 默认模型** | DeepSeek + Fallback | **CLI 配置的当前模型**（Anthropic / Kimi / 等） |
| **图片依赖 Skill 策略** | （未明确） | **顶部警告 + 允许启动**（不阻断） |
| **Skill 上传单元** | .md 文件 | **zip 包 + Git 导入双轨** |
| **内嵌脚本权限** | （未明确） | **信任所有 + 基础防呆 + 明示"仅内部使用"** |
| **暂停/恢复** | 自己存 messages 到 DB | **CLI `--resume` + session 文件磁盘持久化** |
| 用户系统 | 邮箱+密码 | 邮箱+密码（不变） |
| 任务模式 | 单 Skill | 单 Skill（不变） |
| 前端 | 基于现有页面改造 | 现有页面改造 + **纯会话 UI** + Skill 详情页 |
| 部署方式 | 无 Docker | 无 Docker，standalone Node + **Claude Code CLI** |
| 状态推送 | 前端轮询 | SSE 实时推送（CLI stream-json → SSE） |

---

## 十五、风险与缓解（v2.1 调整）

| 风险 | v2.1 缓解措施 |
|------|---------|
| LLM API 不可用 | MVP 支持单 Provider + 重试；v2.1 启用 Fallback |
| 工具脚本执行失败 | 基础防呆（超时/进程隔离/工作目录）、详细错误日志 |
| Skill 格式不兼容 | 严格 frontmatter 解析；导入时静态扫描 tool 引用，不兼容标红 |
| Token 成本过高 | Skill 级 `tokenBudget` + 任务级 `--max-turns` 限制 |
| **内部用户误操作** | 文件类型白名单、大小限制（20MB）、`--cwd` 独立工作目录 |
| **图片识别能力缺失** | 模型探针检测 + Skill 详情页顶部警告 + 允许用户知情启动 |
| **暂停超时占用资源** | 暂停 7 天未恢复自动 cancelled，清理 session 文件 |
| **未来对外开放风险** | 在部署假设章节明确标注"重做沙箱"清单 |
| Agent Loop 失控（无限 tool call） | CLI `--max-turns 30` + 平台超时 kill |
| **CLI 子进程内存占用** | 每任务 ~200MB；MVP 内部用 5-10 并发足够（4GB 服务器） |
| **CLI 版本升级改 stream-json 格式** | 锁定 CLI 版本；升级前回归测试解析逻辑 |
| **单服务器 session 文件限制** | MVP 单实例部署即可；后续如需多实例，切 VercelAIRuntime + DB 方案 |

---

## 十六、统计看板指标

### 16.1 使用行为与交互维度

| 指标 | 定义 | 采集方式 |
|------|------|---------|
| **调用量（PV）** | Skill 被调用的总次数 | 每次 Task 创建时 +1 |
| **调用用户数（UV）** | 使用 Skill 的去重用户数 | 按 userId 去重统计 |
| **人均使用次数** | PV / UV | 计算指标 |
| **使用时长/耗时** | 单次任务从提交到完成的耗时 | Task.duration |
| **使用频率分布** | 日均/周均调用次数 | 按 createdAt 聚合 |
| **输入参数词云** | 高频输入关键词 | 分析 Task.input |
| **中断/跳出点** | 用户在哪个环节取消 | 记录 cancelled 触发点 |

### 16.2 结果与效果维度

| 指标 | 定义 | 采集方式 |
|------|------|---------|
| **调用成功率** | completed / (completed + failed + timeout) | 按 Task.status |
| **错误详情分布** | 失败原因分类统计 | TaskLog.type='error' 聚合 |
| **用户满意度** | 1-5 星平均分 | TaskFeedback.rating |
| **转化贡献** | 产出文件被下载次数 | Task.outputFiles 下载统计 |
| **新增用户数（按 Skill）** | 首次使用某 Skill 的用户数 | Skill + userId 去重 |
| **Token 消耗** | 单 Skill / 单任务 Token 用量 | Task.tokenUsage |

### 16.3 意见收集与反馈闭环维度（v2.1 强化）

| 指标 | 定义 | 采集方式 |
|------|------|---------|
| **高频关键词** | 反馈文本中的痛点/赞扬点 | NLP 分析 TaskFeedback.comment（定时任务聚合到 SkillFeedbackAggregate）|
| **反馈关联技能** | 指向哪个 Skill 或环节 | TaskFeedback → Task → Skill + skillVersionId |
| **版本效果对比** | 新版本 vs 旧版本满意度/成功率 | 按 skillVersionId 分组对比 |
| **反馈解决率** | 已回复/已解决反馈占比 | Skill 作者后台标记处理状态 |
| **反馈渠道** | 反馈提交来源页面 | 前端埋点 |

---

## 附录 A：v2.0 → v2.1 变更清单

### A.1 新增章节
- **一、部署假设**：明确"仅内部使用"边界条件
- **四.2 Agent Runtime 抽象层**：IAgentRuntime 接口定义 + Runtime 实现矩阵
- **四.4 模型能力探针**：Provider 能力检测 + 图片依赖 Skill 处理策略
- **四.6 pause_for_user Tool 定义**：userMessage / aiContext 拆分
- **四.7 基础防呆**：替代原"安全沙箱"，明确边界
- **四.8 暂停/恢复的上下文持久化**：Agent Loop 模式下的 executionContext 设计
- **五.2 Skill 单元：目录或 zip 包**：澄清 Skill 是目录不是文件
- **五.4 Claude Code 兼容性矩阵**：明确支持哪些原生 tool
- **五.5 平台元数据表**：Skill DB schema 完整定义
- **五.6 Skill 路径变量约定**：`{SKILL_DIR}` / `{WORKSPACE_ROOT}` 等
- **五.7 内嵌脚本权限**：信任策略 + 边界声明
- **九.2 Skill 详情页**：反馈聚合/版本对比/兼容性标记
- **九.2 错误展示双层**：用户友好语 + 技术详情折叠
- **九.2 试用示例任务入口**：新用户 onboarding
- **十六.3 反馈闭环维度**：版本效果对比、关键词聚合

### A.2 重大调整
- **四、执行引擎**：Vercel AI SDK 改为 v2.1 stub，MVP 默认 Claude Agent SDK
- **四.3 模型配置**：MVP 默认 Anthropic 官方，Fallback 移至 v2.1
- **四.4 沙箱**：改名为"基础防呆"，移除 seccomp/Docker 等企业级措施
- **五、Skill 系统**：所有限制信息脱离 .md 文件，搬到平台元数据表
- **十一、MVP 范围**：按 9 项 P0 决策完整重写
- **十二、技术栈**：明确 standalone Node 部署，非 Serverless
- **十四、决策回顾**：追加 9 条 v2.1 P0 决策

### A.3 关键术语澄清
- **"流程"**：原文容易误读为"平台编排步骤"，v2.1 明确为"Skill body 给 LLM 看的工作流程提示，平台只跑一次 agent loop"
- **"沙箱"**：原文表述模糊，v2.1 区分"基础防呆"（防无意失误）与"安全沙箱"（防恶意攻击，对外开放时实现）
- **"Skill"**：原文偶尔指 .md 文件，v2.1 统一指"目录"（含 SKILL.md + references + scripts）

---

**方案确认状态**：✅ v2.1 已确认（基于 9 项 P0 决策）

**下一步**：调用 `writing-plans` skill 生成详细实现计划，按 MVP 范围拆解开发任务。
