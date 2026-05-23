# SkillForge 平台设计文档

## 1. 概述

SkillForge 是一个面向 QA 人员和开发人员的远程 Skill 使用平台。用户通过纯浏览器访问，无需在本地安装任何软件，即可调用部署在公司私有服务器上的 Skill 完成日常工作。

**核心定位**：Claude Code 的 Web 包装层 + 多用户任务编排系统。平台不自己执行 Skill 逻辑，而是管理 Claude Code 容器实例的生命周期，将用户请求和 Skill 内容注入 Claude Code，由 Claude Code 作为执行引擎完成任务。

**核心价值**：
- 本地零安装：纯浏览器访问，降低使用门槛
- 多用户共享：团队共用私有服务器上的 Claude Code 资源
- Skill 统一管理：集中存储、版本控制、权限管理
- 任务编排：支持快速执行、后台执行、工作流组合

## 2. 设计决策总览

| 维度 | 决策 | 理由 |
|------|------|------|
| **执行引擎** | Claude Code 容器实例 | 复用成熟的 Skill 生态和工具链，用户熟悉 |
| **隔离模型** | 一任务一容器 | 进程、文件、上下文完全隔离，避免多用户串台 |
| **启动策略** | 冷启动（MVP 阶段） | 简单安全，用完即毁，避免状态清理的复杂性 |
| **交互模式** | 用户手动选择快速/后台 | 明确用户预期，后台任务不支持 Interactive Skill |
| **Skill 注入** | 复制到 `.claude/skills/` 目录 | 利用 Claude Code 原生加载机制，完全兼容现有 Skill 格式 |
| **通信方式** | WebSocket 桥接（快速任务） | 实时流式输出，支持交互式提问和回复 |
| **通知方式** | 可选浏览器/邮件/IM 通知 | 后台任务完成后主动通知用户 |

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户浏览器                             │
│         （选 Skill、传文件、看实时输出、回答交互提问）            │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket（快速任务）/ HTTP（后台任务）
┌──────────────────────▼──────────────────────────────────────┐
│                   SkillForge Hub                            │
│  ┌──────────┐ ┌──────────────┐ ┌─────────────────────────┐ │
│  │  Web UI  │ │  API Gateway │ │    Skill Registry       │ │
│  └──────────┘ └──────────────┘ └─────────────────────────┘ │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │Task Orchestrator│ │ File Service│ │   Agent Pool Mgr    │ │
│  │  （任务编排）    │ │ （文件中转） │ │  （容器生命周期管理）  │ │
│  └──────────────┘ └─────────────┘ └─────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │ Docker API / containerd
┌──────────────────────▼──────────────────────────────────────┐
│              公司私有服务器 / Docker 运行时                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐ │
│  │ Container #1    │ │ Container #2    │ │ Container #3  │ │
│  │ （Claude Code   │ │ （Claude Code   │ │ （Claude Code │ │
│  │  + Skill X      │ │  + Skill Y      │ │  + Skill Z）  │ │
│  │  + 用户A文件）   │ │  + 用户B文件）   │               │ │
│  └─────────────────┘ └─────────────────┘ └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 部署拓扑

- **Hub**：部署在公司内网可访问区域（或 DMZ），提供 Web 界面和 API
- **Docker 运行时**：部署在私有服务器上，运行 Claude Code 容器
- **LLM API**：Claude Code 容器直接访问 Anthropic API（或其他 LLM 提供商），网络出口需做白名单限制

## 4. 核心组件

### 4.1 Web UI

**职责**：提供用户操作界面。

**功能**：
- Skill 浏览器：查看、搜索、选择 Skill
- 任务提交表单：上传文件、输入文字、选择执行模式（快速/后台）
- 实时输出面板：流式显示 Claude Code 的执行过程和输出
- 交互提问弹窗：处理 Interactive Skill 的用户输入请求
- 任务历史：查看过往任务和结果下载

### 4.2 API Gateway

**职责**：请求入口，认证授权，限流。

**功能**：
- 用户认证（对接公司 SSO/OAuth）
- 请求校验和限流
- 文件上传大小限制（前置拦截）
- 路由分发到各服务

### 4.3 Skill Registry

**职责**：管理 Skill 的生命周期和元数据。

**功能**：
- 存储 Skill 包（`SKILL.md` + 可选脚本 + `skill.yaml` 配置）
- 解析 Skill 元数据：名称、描述、输入参数、是否 `interactive`、所需能力
- 版本管理：支持多版本共存，用户可选择版本
- 来源支持：平台内置、用户上传、Git 仓库导入
- 自然语言路由：根据用户描述推荐匹配 Skill

**Skill 配置示例（skill.yaml）**：
```yaml
name: test-case-generator
description: 根据需求生成测试用例
version: 1.2.0
interactive: false
input:
  - name: requirement
    type: text
    required: true
    description: 需求描述
  - name: format
    type: select
    options: [excel, markdown, csv]
    default: markdown
output:
  type: file
  format: "${format}"
```

### 4.4 Task Orchestrator

**职责**：任务的全生命周期管理。

**功能**：
- 接收任务提交（用户 ID、Skill ID、输入、执行模式）
- 验证任务参数
- 管理任务状态机：
  ```
  pending → queued → preparing → running → [awaiting_input] → completed
                                      ↓
                                  failed / cancelled / timeout
  ```
- 快速任务：保持 WebSocket 连接，实时推输出
- 后台任务：入队异步执行，完成后发通知
- 任务超时控制（默认 30 分钟，可配置）
- 任务取消：用户可主动取消正在执行的任务

**状态说明**：
- `pending`：任务已提交，等待资源
- `queued`：系统并发满载，任务排队中
- `preparing`：正在创建容器、注入 Skill、挂载文件
- `running`：Claude Code 正在执行任务
- `awaiting_input`：Interactive Skill 暂停等待用户回复（仅快速任务）
- `completed`：任务完成，结果可下载
- `failed`：任务失败（包含错误原因）
- `cancelled`：用户主动取消
- `timeout`：任务执行超时

### 4.5 File Service

**职责**：输入输出文件的中转存储。

**功能**：
- 接收用户上传文件，临时存储
- 任务启动时将文件挂载到容器
- 任务完成后从容器提取结果文件
- 提供结果文件下载链接
- 自动清理策略：默认保留 7 天，用户可手动收藏永久保留
- 文件大小限制和类型白名单

### 4.6 Agent Pool Manager

**职责**：Claude Code 容器的生命周期管理。

**功能**：
- 接收任务分配请求
- 创建临时工作目录
- 复制 Skill 到 `.claude/skills/` 目录
- 复制用户文件到工作目录
- 启动/停止/销毁容器
- 容器健康检查（心跳监控）
- 并发控制：限制同时运行的容器数量，超限任务排队
- 资源监控：CPU、内存使用率跟踪

**容器启动流程**：
```
1. 创建临时目录 /tmp/task-<task-id>/
2. 创建 /tmp/task-<task-id>/.claude/skills/<skill-name>/
3. 复制 SKILL.md 到上述目录
4. 复制用户上传文件到 /tmp/task-<task-id>/workspace/
5. 启动容器，挂载 /tmp/task-<task-id>/workspace/ 为 /workspace
6. 设置环境变量（如 ANTHROPIC_API_KEY）
7. 启动 Claude Code 进程（工作目录设为 /workspace）
```

**容器销毁流程**：
```
1. 停止 Claude Code 进程（SIGTERM，超时后 SIGKILL）
2. 从容器复制结果文件到 File Service
3. 停止容器
4. 删除容器
5. 删除临时工作目录
```

## 5. 数据流

### 5.1 快速任务（Fast Execution）

```
用户浏览器
  │ ① 选择 Skill + 上传文件 + 输入参数 + 选"快速执行"
  ▼
API Gateway
  │ ② 认证 + 参数校验
  ▼
Task Orchestrator
  │ ③ 创建任务（状态：pending）
  │ ④ 请求容器资源
  ▼
Agent Pool Manager
  │ ⑤ 创建临时目录
  │ ⑥ 注入 Skill（复制到 .claude/skills/）
  │ ⑦ 准备用户文件
  │ ⑧ 启动 Claude Code 容器
  │ ⑨ 建立 WebSocket/PTY 连接
  ▼
Claude Code 容器
  │ ⑩ 加载 Skill
  │ ⑪ 接收用户输入（初始消息）
  │ ⑫ 处理任务...
  │     （如需交互：输出提问 → 等待回复）
  │ ⑬ 输出结果
  │
  │ ⑫a 交互场景：
  │     Claude Code 输出提问
  │     → Hub 标记状态 awaiting_input
  │     → WebSocket 推送提问到浏览器
  │     → 用户回复
  │     → WebSocket 转发回复到容器
  │     → Claude Code 继续处理
  │
  ▼
Agent Pool Manager
  │ ⑭ 提取结果文件
  │ ⑮ 销毁容器
  ▼
Task Orchestrator
  │ ⑯ 更新任务状态 completed / failed
  │ ⑰ 通知 File Service 保存结果
  ▼
用户浏览器 ← WebSocket
  │ ⑱ 显示完成状态 + 结果下载链接
```

### 5.2 后台任务（Background Execution）

```
用户浏览器
  │ ① 选择 Skill + 上传文件 + 输入参数 + 选"后台执行"
  │     （如选择 interactive Skill，提示"不支持后台执行"）
  ▼
...（同快速任务 ②~⑪）...
  ▼
Claude Code 容器
  │ ⑫ 加载 Skill
  │ ⑬ 接收用户输入（初始消息）
  │ ⑭ 自动处理任务（无需交互）
  │
  │ （Hub 断开 WebSocket，但监控容器状态）
  │
  │ ⑮ 任务完成或超时
  ▼
Agent Pool Manager
  │ ⑯ 提取结果文件
  │ ⑰ 销毁容器
  ▼
Task Orchestrator
  │ ⑱ 更新任务状态
  │ ⑲ 触发通知（浏览器/邮件/IM）
  ▼
用户浏览器 / 邮件 / IM
  │ ⑳ 收到完成通知，点击链接查看结果
```

**后台任务关键限制**：
- 仅支持 `interactive: false` 的 Skill
- 如 Claude Code 输出提问模式（检测到等待输入），Hub 自动发送"请使用最佳判断继续"指令
- 后台任务超时时间默认 60 分钟（比快速任务更长）

### 5.3 会话恢复（断线重连）

**场景**：用户浏览器刷新或网络断开，任务仍在运行。

**恢复流程**：
1. 用户重新打开页面，查询任务状态
2. 如任务仍在运行（`running` 或 `awaiting_input`）：
   - 重新建立 WebSocket 连接
   - 推送历史输出缓存（保留最近 1000 行）
   - 恢复实时流式输出
3. 如任务已完成：显示结果
4. 如任务处于 `awaiting_input` 且用户重连：显示交互提问界面

## 6. 安全设计

### 6.1 容器安全策略

每个 Claude Code 容器运行时的安全限制：

| 限制项 | 策略 |
|--------|------|
| **运行用户** | 非 root（如 `claude` 用户，UID 1000） |
| **文件系统** | 只读挂载 Skill 文件；工作目录 `/workspace` 可读写；禁止访问宿主机路径 |
| **网络访问** | 默认禁止出站网络，仅允许白名单地址（如 `api.anthropic.com`、`api.openai.com`） |
| **资源限制** | CPU 限制 2 核，内存限制 4GB，磁盘限制 10GB |
| **执行超时** | 快速任务 30 分钟，后台任务 60 分钟 |
| **系统调用** | 启用 seccomp 配置文件，限制危险系统调用 |
| **进程权限** | 禁止提权操作（如 `sudo`、`setuid`） |

### 6.2 文件隔离

- 每个任务有独立的临时工作目录（`/tmp/task-<task-id>/`）
- 容器内只能看到自己的工作目录，看不到其他任务或宿主机的文件
- 任务完成后临时目录立即清理，结果文件仅保留通过 File Service 提取的部分

### 6.3 用户权限

- 用户只能访问自己创建的任务和上传的文件
- Skill 可设置访问权限（公开 / 仅自己 / 指定团队）
- 管理员可查看所有任务日志（用于审计）

## 7. 错误处理

| 错误场景 | 检测方式 | 处理策略 | 用户可见信息 |
|---------|---------|---------|-------------|
| **容器启动失败** | Docker API 返回错误 | 重试 1 次，仍失败标记任务失败 | "执行环境启动失败，请联系管理员" |
| **Claude Code 进程崩溃** | 进程退出码非 0 | 提取已有输出，标记失败 | "任务执行异常中断，已保存部分输出" |
| **任务超时** | 定时器触发 | SIGTERM 终止，超时后 SIGKILL | "任务执行超时（30分钟），请尝试简化输入" |
| **资源超限（OOM）** | Docker OOM 事件 | 标记失败 | "内存不足，请减少输入数据量或联系管理员扩容" |
| **LLM API 不可用** | HTTP 错误码 / 超时 | Claude Code 内部重试 3 次，Hub 监控失败后标记失败 | "AI 服务暂时不可用，请稍后重试" |
| **Skill 注入失败** | 文件校验失败 | 不启动容器，直接标记失败 | "Skill 文件损坏或不完整" |
| **文件上传过大** | API Gateway 前置检查 | 直接返回 413 | "文件大小超过限制（最大 100MB）" |
| **并发超限** | Agent Pool 计数器 | 任务进入队列，返回排队位置 | "当前任务较多，您排在第 N 位，预计等待 X 分钟" |
| **用户断开 WebSocket** | WebSocket close 事件 | 快速任务保持容器 5 分钟，允许重连；超时转为后台模式继续执行 | 重连后自动恢复 |

## 8. 部署方案

### 8.1 基础镜像

维护基础镜像 `skillforge/claude-code-runner`，包含：

- 操作系统：Ubuntu 22.04 LTS
- Node.js 18+（Claude Code 依赖）
- Claude Code CLI（最新稳定版）
- 常用工具链：Git、Python 3、pip、Node.js、npm、curl
- 安全加固：非 root 用户、最小化软件包、seccomp 配置

**镜像构建要点**：
```dockerfile
FROM ubuntu:22.04

# 安装基础依赖
RUN apt-get update && apt-get install -y \
    nodejs npm git python3 python3-pip curl \
    && rm -rf /var/lib/apt/lists/*

# 安装 Claude Code
RUN npm install -g @anthropic-ai/claude-code

# 创建非 root 用户
RUN useradd -m -u 1000 claude
USER claude
WORKDIR /workspace

# 预配置 Claude Code（可选：预登录或运行时注入 API Key）
ENV CLAUDE_CONFIG_DIR=/home/claude/.config/claude
```

### 8.2 环境变量配置

容器启动时注入的环境变量：

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude Code 调用 Anthropic API 的密钥 |
| `CLAUDE_SKILLS_PATH` | Skill 目录路径（指向挂载的 `.claude/skills/`） |
| `TASK_ID` | 当前任务 ID，用于日志关联 |
| `WORKSPACE_DIR` | 工作目录路径（`/workspace`） |

### 8.3 服务器要求

- **Hub 服务**：2 核 4GB 内存（轻量，主要是 I/O 转发）
- **Docker 运行时**：根据并发量配置，每容器预留 2 核 4GB
- **存储**：任务文件临时存储，按并发量 × 单任务上限计算
- **网络**：出站仅开放 LLM API 白名单

## 9. 范围边界

### 9.1 MVP 范围内

- 纯浏览器访问的 Web UI
- Skill 的上传、存储、版本管理和选择
- 一任务一容器的 Claude Code 执行模型
- 快速任务（WebSocket 实时交互）
- 后台任务（仅支持 non-interactive Skill）
- 文件上传下载
- 基础通知（浏览器通知）
- 单 Hub + 单 Docker 宿主的部署

### 9.2 MVP 范围外（后续迭代）

- 工作流编排（多个 Skill 串联）
- 自然语言自动路由（根据描述推荐 Skill）
- 多 Docker 宿主集群（Agent 池跨机器）
- 容器预热池（性能优化）
- 高级通知渠道（邮件、企业微信、钉钉、Slack）
- 团队协作功能（共享任务、评论、审批）
- Skill 市场（跨团队共享 Skill）
- 使用统计和成本分析

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Claude Code 容器启动慢（5-10秒） | 用户体验差 | MVP 接受冷启动；后续引入预热池优化 |
| Claude Code 版本升级不兼容 | Skill 失效 | 固定 Claude Code 版本，升级前做兼容性测试 |
| 容器安全漏洞 | 多用户数据泄露 | 一任务一容器 + 网络隔离 + 文件隔离 + 最小权限原则 |
| LLM API 成本过高 | 运营成本超支 | 任务级配额限制、使用审计、可选本地模型降级 |
| 用户上传恶意文件 | 容器被攻破 | 文件类型白名单、容器资源限制、只读 Skill 挂载 |
