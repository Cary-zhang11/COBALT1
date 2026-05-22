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
- 什么时候调用工具（`<TOOL>docx2text</TOOL>`）
- 什么时候暂停问用户（`<PAUSE>请确认以上模块划分</PAUSE>`）
- 什么时候输出最终结果

平台解析 LLM 的输出，遇到标记就执行对应操作：
- 遇到 `<TOOL>` → 调用 Tool Layer → 结果返回给 LLM
- 遇到 `<PAUSE>` → 任务状态改为 `paused` → 前端显示确认框
- 用户回复后 → 继续对话 → LLM 继续执行

### LLM 配置
通过环境变量切换，不绑定任何模型：

```bash
# 可选方案
LLM_PROVIDER=deepseek      # 或 anthropic / openai
DEEPSEEK_API_KEY=sk-...
LLM_MODEL=deepseek-chat
```

### 工具层（Tool Layer）

| 工具 | 功能 | 实现 |
|------|------|------|
| `docx2text` | .docx → Markdown + 图片提取 | Python 标准库 |
| `md2xmind` | Markdown → XMind 思维导图 | Python + xmind 库 |
| `file_read/write` | 文件读写 | Node.js fs |
| `dir_create` | 目录创建 | Node.js fs |
| `exec_python` | 执行 Python 脚本 | Node.js child_process |
| `exec_command` | 受限 shell 命令 | Node.js child_process |

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

---

## 八、数据模型

### 核心实体

| 实体 | 说明 |
|------|------|
| **User** | 用户（邮箱、姓名、头像） |
| **Skill** | 技能（名称、描述、来源、文件路径、配置） |
| **Task** | 任务（用户、Skill、状态、输入、输出、耗时、Token） |
| **TaskLog** | 执行日志（步骤、类型、输入、输出、耗时） |
| **TaskFeedback** | 用户反馈（评分、评论） |

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

**方案确认状态：✅ 已确认**

**方案确认状态：✅ 已确认（v2.0）**

**下一步**：等待用户确认后，调用 `writing-plans` skill 创建详细实现计划。
