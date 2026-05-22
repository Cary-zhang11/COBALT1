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

### 核心设计
**平台负责"手脚"（文件/脚本执行），LLM 负责"大脑"（分析/生成）**

```
用户提交任务
    ↓
SkillFlow 平台
    ├─ Tool Layer：文件转换、目录创建、脚本执行
    ├─ 组装 Prompt（Skill body + 处理后的输入）
    └─ 调用 LLM API（Vercel AI SDK）
    ↓
LLM 生成结果
    ↓
平台保存结果文件
    ↓
返回用户
```

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

## 九、功能模块

### 9.1 用户端功能

| 模块 | 功能 |
|------|------|
| **Skill 市场** | 浏览内置 Skill、搜索、查看详情 |
| **任务提交** | 选择 Skill、上传文件/输入文本、提交执行 |
| **任务监控** | 实时查看执行状态、输出流、暂停时输入回复 |
| **结果查看** | 查看输出内容、下载结果文件（.md、.xmind） |
| **任务历史** | 查看过往任务、重新执行、删除 |
| **反馈评分** | 对任务结果打 1-5 星、写评论 |

### 9.2 管理端功能（MVP 简化）

| 模块 | 功能 |
|------|------|
| **个人中心** | 修改信息、查看使用统计 |
| **Skill 管理** | 上传自定义 Skill、查看我的 Skill |
| **统计看板** | 任务数、成功率、常用 Skill、平均耗时、满意度 |

### 9.3 平台端功能（内部）

| 模块 | 功能 |
|------|------|
| **Skill Registry** | 加载、解析、缓存 Skill 文件 |
| **Task Engine** | 任务状态机、执行编排、暂停/恢复 |
| **Tool Layer** | 脚本执行、文件操作、格式转换 |
| **Logger** | 记录每步执行的输入/输出/耗时 |
| **Stats** | 聚合统计指标 |

---

## 十、MVP 范围（v2.0）

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

## 十一、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 App Router、React 18、TypeScript、Tailwind CSS |
| 后端 | Next.js API Routes、Prisma ORM |
| 数据库 | PostgreSQL |
| AI SDK | Vercel AI SDK（支持 Claude / DeepSeek / OpenAI）|
| 工具脚本 | Python 3.8+（标准库 + xmind 库）|
| 部署 | Node.js 18+、本地或服务器部署 |

---

## 十二、部署方案

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

## 十三、关键设计决策回顾

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 执行引擎 | A+：Claude API + 平台工具层 | 稳定、模型可切换、平台可控 |
| Skill 格式 | `.claude/skills/*.md` | 兼容现有生态，用户可自制 |
| 用户系统 | 邮箱+密码（MVP） | 快速落地，后续支持 SSO |
| 任务模式 | 单 Skill（MVP） | 核心闭环先跑通，流水线后续迭代 |
| 部署方式 | 无 Docker | 轻量，降低运维成本 |
| 状态推送 | 前端轮询（5s） | MVP 简化，后续升级 WebSocket |

---

## 十四、风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| LLM API 不可用 | 支持多模型切换，降级到备用模型 |
| 工具脚本执行失败 | 沙箱环境、超时控制、详细错误日志 |
| Skill 格式不兼容 | 严格 frontmatter 解析，不兼容时明确报错 |
| Token 成本过高 | 任务级配额、使用审计、模型降级 |
| 用户上传恶意文件 | 文件类型白名单、大小限制、沙箱执行 |

---

**方案确认状态：✅ 已确认**

**下一步**：调用 `writing-plans` skill，创建详细实现计划。
