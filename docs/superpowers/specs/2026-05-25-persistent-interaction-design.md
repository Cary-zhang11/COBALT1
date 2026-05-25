# 任务持续交互与 Skill 智能匹配设计文档

## 1. 目标与范围

### 1.1 目标
实现任务执行中的**持续多轮交互**，让用户与 AI 的交互像聊天一样自然：AI 执行过程中可多次暂停等待用户确认或输入，用户也可随时主动插话。

### 1.2 一期范围

| 场景 | 说明 |
|------|------|
| CLI 权限层 | 兼容 `--permission-mode`，默认用 `--dangerously-skip-permissions` 全开，保留处理权限请求事件的能力 |
| Skill 规则暂停 | SKILL.md 中声明的暂停规则 |
| 高危操作暂停 | Bash、写文件、删文件等工具调用前暂停 |
| 跨 Skill 衔接 | Skill A → Skill B 切换前用户确认（同一 session） |
| 输出完成暂停 | 一轮回复结束后等待用户下一步指令（聊天回合制） |
| 用户随时插话 | 用户在看输出过程中主动发新指令 |
| Skill 智能匹配 | 输入文件+文字后，关键词匹配推荐 Skills |

### 1.3 明确不做（二期）
- 撤销/回退操作
- 交互过程中上传新文件
- 预算/步数预警暂停
- 错误恢复暂停（重试/跳过/终止）
- Embedding 向量匹配（本期用关键词）

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │ 任务创建页   │    │ 执行/交互页  │    │   结果页         │ │
│  │ /tasks/new  │───→│ /tasks/:id  │───→│ /tasks/:id/result│ │
│  └─────────────┘    └──────┬──────┘    └─────────────────┘ │
│                            │                                 │
│                     ┌──────┴──────┐                         │
│                     │  SSE Events  │◄─────────────────────┐  │
│                     └─────────────┘                      │  │
└──────────────────────────────────────────────────────────┼──┘
                                                           │
┌──────────────────────────────────────────────────────────┼──┐
│                      API Layer                           │  │
│  POST /api/skills/match       ──→ 关键词匹配推荐 Skills  │  │
│  POST /api/tasks              ──→ 创建任务（不变）        │  │
│  POST /api/tasks/:id/execute  ──→ 启动执行（不变）        │  │
│  POST /api/tasks/:id/resume   ──→ 向运行中进程发消息      │  │
│  POST /api/tasks/:id/cancel   ──→ 终止进程并清理          │  │
└──────────────────────────────────────────────────────────┼──┘
                                                           │
┌──────────────────────────────────────────────────────────┼──┐
│                    Task Engine                            │  │
│  startTaskExecution() ──→ 启动 Runtime，遍历输出          │  │
│       ├─ 遇到 pause 事件 ──→ 更新 DB 为 paused           │  │
│       ├─ 用户回复 ──→ 调用 runtime.sendInput()           │  │
│       ├─ 继续遍历 ──→ 可能再次 pause（循环）              │  │
│       └─ 跨 Skill ──→ sendInput 注入新 Skill 规则         │  │
└──────────────────────────────────────────────────────────┼──┘
                                                           │
┌──────────────────────────────────────────────────────────┼──┐
│              Agent Runtime (ClaudeCodeCLIRuntime)         │  │
│                                                           │  │
│  start(input)                                             │  │
│    ├─ spawn("claude", ["-p", "--input-format", "stream-json",
│    │                    "--output-format", "stream-json",
│    │                    "--dangerously-skip-permissions", ...])
│    ├─ stdin 保持打开（不再 end()）                        │  │
│    ├─ 解析 stdout stream-json，yield 事件                 │  │
│    │   ├─ chunk ──→ 正常输出                             │  │
│    │   ├─ tool_call ──→ 检查是否高危 → yield pause       │  │
│    │   ├─ permission_request ──→ yield pause             │  │
│    │   └─ complete ──→ yield pause（输出完成）            │  │
│    └─ 进程引用存入 Map<taskId, process>                  │  │
│                                                           │  │
│  sendInput(sessionId, message)                            │  │
│    ├─ 从 Map 取出进程                                     │  │
│    └─ stdin.write(JSON.stringify({type:"user",content})+"\n")
│                                                           │  │
│  resume(sessionId, message) ──→ 进程崩溃后恢复（--resume）│  │
│  getProcessStatus(sessionId) ──→ 检查进程是否存活         │  │
│  cancel(sessionId) ──→ kill 进程，清理 Map                │  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 关键设计决策

1. **Runtime 内部维护进程 Map**：`Map<taskId, {process, stdin, sessionId}>`，替代之前的"每次调用新建进程"
2. **pause 事件由 Runtime 生成**：`parseStreamJson` 扩展，检测 `tool_call` / 权限请求 / 输出完成
3. **Engine 负责状态流转**：收到 `pause` → 更新 DB；收到用户回复 → 调用 `sendInput`
4. **一个任务 = 一个 session**：跨 Skill 衔接时通过 `sendInput` 注入新 Skill 规则，不重启进程
5. **Skill 匹配用关键词**：不用 LLM，基于 Skill name/description 的关键词匹配

---

## 3. 核心流程

### 3.1 Skill 智能匹配流程

```
用户进入 /tasks/new
        ↓
显示聊天式输入区域（文字 + 文件上传）
        ↓
用户发送消息 → POST /api/skills/match
        ↓
后端：
  1. 提取用户输入关键词
  2. 遍历所有可见 Skill 的 name + description
  3. 计算关键词重叠度
  4. 返回 Top 3 推荐
        ↓
前端显示 Skill 推荐卡片（匹配度 + 原因）
        ↓
用户选择 Skill → 显示确认按钮
        ↓
点击确认 → POST /api/tasks → 创建任务
        ↓
自动跳转执行页 /tasks/:id/execute
```

### 3.2 启动流程（含文件处理）

```
POST /api/tasks/:id/execute → task-engine.startTaskExecution()
        ↓
Runtime.start()
  1. 创建 sandbox（workspace/ output/ temp/）
  2. 上传文件复制到 workspace/
  3. 读取 SKILL.md 内容
  4. 构建 system prompt（Skill 内容 + 暂停规则）
  5. 构建 user prompt（文字 + 文件路径）
  6. spawn CLI，stdin 保持打开
  7. 写入初始 prompt
        ↓
CLI 开始处理，输出 stream-json
        ↓
Engine 遍历事件，写入 TaskLog DB
        ↓
SSE 推送到前端
```

**关键变更：** 上传文件从"只在 prompt 里提路径"改为**实际复制到 workspace**，CLI 才能通过 `--add-dir` 访问到。

### 3.3 暂停-恢复循环（多轮交互）

```
Runtime yield 事件
        ↓
Engine 收到 pause 事件
        ↓
  1. 更新 DB: status = "paused"
  2. 记录 pauseReason（tool_call / complete / permission_request）
  3. 记录 pausedAt
  4. 停止遍历 stream（不 kill 进程）
  5. **保存当前 sequence 到内存**（供下次 resume 继续使用）
        ↓
SSE 推送 paused 事件 → 前端显示输入框
        ↓
用户输入自由文本 → POST /api/tasks/:id/resume
        ↓
resumeTask() ──→ Runtime.sendInput(sessionId, userReply)
        ↓
CLI stdin 收到 {"type":"user","content":"..."}
        ↓
CLI 继续处理，产生新输出
        ↓
Engine 重新遍历 stream（从上次暂停处继续）
        ↓
可能再次 pause ──→ 循环 ──→ 无限轮次
```

### 3.4 跨 Skill 衔接

```
Skill A 执行完毕（输出完成暂停）
        ↓
用户确认继续执行 Skill B
        ↓
sendInput(sessionId, "现在切换到 Skill B：[Skill B 规则]")
        ↓
CLI 在同一个 session 中继续处理
        ↓
使用新 Skill 的规则生成输出
```

**关键：** 同一个 session，对话历史完整保留，通过 user message 注入新 Skill 规则。

### 3.5 输出文件收集（任务完成时）

```
任务标记 completed
        ↓
collectOutputFiles(taskId)
        ↓
扫描 sandbox/:taskId/output/
        ↓
将文件复制到持久存储（或保持引用）
        ↓
更新 DB: outputFiles = [...]
        ↓
前端结果页展示文件列表 + 下载
```

---

## 4. 数据模型与接口

### 4.1 Prisma Schema 变更

```prisma
model Task {
  id            String    @id @default(cuid())
  userId        String
  skillId       String
  status        String    @default("pending")
  input         String    @db.Text
  output        String?   @db.Text
  outputFiles   String[]  @default([])
  inputFiles    String[]  @default([])
  sessionId     String?
  pauseReason   String?
  pausedAt      DateTime?
  pauseCount    Int       @default(0)  // 暂停次数统计
  duration      Int?
  agentRuntime  String    @default("claude-cli")
  modelProvider String?
  tokenUsage    Int?
  retryCount    Int       @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  logs     TaskLog[]
  feedback TaskFeedback[]
  skill    Skill     @relation(fields: [skillId], references: [id])
}

model Skill {
  id           String   @id @default(uuid())
  name         String
  description  String
  source       String   // builtin | user_upload | git
  filePath     String
  version      String
  allowedTools String[] @default([])
  maxSteps     Int      @default(30)
  tokenBudget  Int?
  visibility   String   @default("private")
  requires     String[] @default([])
  displayMeta  Json?

  uploadedBy String?
  tasks      Task[]
  versions   SkillVersion[]
}
```

**变更：**
- `pauseCount`：新增，统计交互轮次

### 4.2 Runtime 接口

```typescript
export interface AgentEvent {
  type: "system" | "chunk" | "tool_call" | "pause" | "error" | "complete";
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  pauseReason?: "tool_call" | "output_complete" | "permission_request";
  error?: string;
}

export interface IAgentRuntime {
  readonly name: string;

  // 启动新会话
  start(input: SkillInput): AsyncIterable<AgentEvent>;

  // 向运行中的会话发送用户输入
  sendInput(sessionId: string, message: string): Promise<void>;

  // 进程崩溃后恢复（--resume，保留对话历史）
  resume(sessionId: string, message: string): AsyncIterable<AgentEvent>;

  // 获取进程状态
  getProcessStatus(sessionId: string): "running" | "paused" | "crashed" | "exited" | null;

  // 取消会话
  cancel(sessionId: string): Promise<void>;
}
```

### 4.3 API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/skills/match` | POST | 关键词匹配推荐 Skills |
| `/api/tasks` | POST | 创建任务（不变） |
| `/api/tasks/:id/execute` | POST | 启动执行（不变，但进程保持运行） |
| `/api/tasks/:id/resume` | POST | 向运行中进程发消息（放宽状态限制：paused 和 running 均可） |
| `/api/tasks/:id/cancel` | POST | 终止进程并清理 |
| `/api/tasks/:id/events` | GET | SSE 事件流（扩展 paused 事件 payload） |

### 4.4 SSE 事件

```typescript
// 现有事件：log, done, paused, error

// paused 事件扩展
{
  "status": "paused",
  "reason": "tool_call" | "output_complete" | "permission_request",
  "toolName?": "Bash",
  "toolInput?": { "command": "npm install" }
}

// error 事件扩展（进程崩溃自动恢复时）
{
  "status": "error",
  "message": "进程异常，已自动恢复",
  "recoverable": true
}
```

---

## 5. 前端交互

### 5.1 页面结构

参考 `docs/archive/skillflow-demo.html` 的聊天式 UI：

**`/tasks/new` — 新建任务（聊天式）**
```
┌──────────────────────────────────────────────┐
│  聊天消息流                                    │
│  🤖 AI: 你好！请描述你的需求...               │
│  👤 用户: 帮我写一个登录页面                  │
│  🤖 AI: 分析完成，推荐以下 Skills...          │
│     ┌────────────────────────────────────┐   │
│     │ ⭐ 前端页面生成    匹配度: 95%     │   │
│     │    [选择]                          │   │
│     └────────────────────────────────────┘   │
│  👤 用户: [点击选择]                          │
│  🤖 AI: 已选择。准备好了吗？                  │
│     [启动工作流]                              │
├──────────────────────────────────────────────┤
│  [📎] [输入框...                    ] [发送] │
└──────────────────────────────────────────────┘
```

**`/tasks/:id/execute` — 执行/交互（左侧步骤 + 右侧聊天）**
```
┌─────────────────┬──────────────────────────────┐
│  执行步骤        │  聊天消息流                   │
│  ✅ 解析输入     │  🤖 正在执行 Bash...         │
│  ✅ AI 分析      │                              │
│  ⏳ 匹配 Skill   │  ⚠️ 需要确认                  │
│  ⏸️ 生成内容     │     工具: Bash                │
│  ⏸️ 人工审核     │     参数: npm install         │
│  ⏸️ 输出结果     │                              │
│                 │  👤 确认执行                  │
│                 │                              │
│                 │  🤖 安装完成...               │
│                 │  ⏹️ 等待输入...               │
├─────────────────┴──────────────────────────────┤
│  [输入框...                    ] [发送]        │
└────────────────────────────────────────────────┘
```

### 5.2 交互状态机

```
        ┌───────────────┐
        │   connecting  │  ← SSE 连接中
        └───────┬───────┘
                ↓
        ┌───────────────┐
        │    running    │  ← 正常执行，日志滚动
        └───────┬───────┘
                ↓
        ┌───────────────┐     用户输入      ┌───────────────┐
        │    paused     │ ←──────────────→ │   running     │
        │  (显示输入框)  │    调用 resume    │               │
        └───────────────┘                   └───────────────┘
                ↓
        ┌───────────────┐
        │  completed /  │  ← 结束
        │    failed     │
        └───────────────┘
```

**关键：** `running` 状态下也可输入（用户随时插话），输入框始终可用。

---

## 6. Skill 智能匹配

### 6.1 匹配算法（关键词）

```typescript
function matchSkills(input: string, skills: Skill[]): MatchResult[] {
  const inputKeywords = extractKeywords(input); // 分词 + 去停用词

  return skills.map(skill => {
    const skillText = `${skill.name} ${skill.description}`;
    const skillKeywords = extractKeywords(skillText);

    const overlap = inputKeywords.filter(k => skillKeywords.includes(k));
    const confidence = overlap.length / Math.max(inputKeywords.length, 1);

    return {
      skillId: skill.id,
      name: skill.name,
      description: skill.description,
      confidence: Math.min(confidence * 2, 1), // 放大系数
      reason: overlap.length > 0
        ? `匹配关键词: ${overlap.slice(0, 3).join(", ")}`
        : "通用推荐"
    };
  }).filter(m => m.confidence > 0.1)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}
```

### 6.2 API 设计

```typescript
// POST /api/skills/match
// Request
{
  "input": "帮我写一个登录页面，有用户名密码输入框",
  "uploadedFiles": ["uploads/123-design.png"] // 可选
}

// Response
{
  "matches": [
    {
      "skillId": "uuid-1",
      "name": "前端页面生成",
      "description": "根据需求生成 React 页面代码",
      "confidence": 0.95,
      "reason": "匹配关键词: 登录, 页面, 输入框"
    }
  ],
  "suggested": "uuid-1"
}
```

---

## 7. 错误处理

### 7.1 进程崩溃恢复

Engine 在 `startTaskExecution` 中启动后台健康检查定时器（每 5 秒）：

```
startTaskExecution()
  ├─ 启动 CLI 进程
  ├─ 启动健康检查定时器（每 5 秒）
  │     ├─ 调用 runtime.getProcessStatus(sessionId)
  │     ├─ 进程已退出且 status === "paused" / "running"？
  │     │     ├─ 是 ──→ 尝试 `--resume <sessionId>` 重启进程
  │     │     │         ├─ 成功 ──→ 推送 error 事件（recoverable: true）
  │     │     │         └─ 失败 ──→ 标记 failed，推送 error 事件
  │     │     └─ 否 ──→ 继续检测
  │     └─ 任务 completed / failed / cancelled ──→ 停止定时器
  └─ 遍历 stream 事件（主循环）
```

**关键：** 健康检查与主循环并行运行，只在任务活跃期（非终态）执行。

### 7.2 超时处理

- 单轮输出超过 5 分钟无新 chunk → 推送 "等待中" 状态
- 整个任务超过 30 分钟 → 自动取消

---

## 8. 测试策略

| 测试项 | 方式 |
|--------|------|
| Skill 关键词匹配 | 单元测试：不同输入 vs 预期推荐 |
| Runtime 进程管理 | 集成测试：启动 → sendInput → pause → sendInput → 完成 |
| SSE 事件流 | 集成测试：验证 paused / log / done 事件顺序 |
| 文件上传/复制 | 集成测试：验证 uploads/ → workspace/ 复制 |
| 跨 Skill 衔接 | 集成测试：Skill A → sendInput 切换 → Skill B |
| 进程崩溃恢复 | 集成测试：kill 进程 → 验证自动恢复 |

---

## 9. 待验证项

| 项 | 验证方式 | 影响 |
|----|---------|------|
| `--input-format stream-json` 具体格式 | 5 分钟 CLI 测试 | 高：决定 sendInput 实现 |
| `-p` + stream-json 是否会保持运行 | 5 分钟 CLI 测试 | **极高**：方案A的前提假设 |
| `--resume` 时能否更换 system prompt | 5 分钟 CLI 测试 | 中：决定跨 Skill 实现 |

---

## 10. 新增/修改文件清单

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/api/skills/match/route.ts` | 新增 | Skill 匹配 API |
| `lib/skill-matcher.ts` | 新增 | 关键词匹配逻辑 |
| `lib/agent-runtime.ts` | 修改 | 扩展 IAgentRuntime 接口 |
| `lib/claude-cli-runtime.ts` | 修改 | 保持进程运行，新增 sendInput/getProcessStatus |
| `lib/task-engine.ts` | 修改 | 处理 pause 事件，多轮交互循环 |
| `app/api/tasks/[id]/resume/route.ts` | 修改 | 改为 sendInput，放宽状态限制 |
| `app/api/tasks/[id]/cancel/route.ts` | 修改 | kill 进程 + 清理 Map |
| `app/api/tasks/[id]/events/route.ts` | 修改 | 扩展 paused 事件 payload |
| `lib/sandbox.ts` | 修改 | 新增 `copyFilesToWorkspace(taskId, filePaths)` |
| `prisma/schema.prisma` | 修改 | 新增 pauseCount |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/tasks/new/page.tsx` | 重写 | 聊天式输入 + Skill 推荐 |
| `app/tasks/[id]/execute/page.tsx` | 重写 | 左侧步骤 + 右侧聊天 |
| `hooks/use-skill-match.ts` | 新增 | Skill 匹配 hook |
| `hooks/use-task-events.ts` | 修改 | 处理 paused 事件 |
| `components/skill-match-dialog.tsx` | 新增 | 推荐卡片对话框 |
| `components/chat-message.tsx` | 新增 | 聊天消息组件 |
| `components/workflow-steps.tsx` | 新增 | 执行步骤侧边栏 |
