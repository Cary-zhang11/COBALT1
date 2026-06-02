# 数据库表结构总结

> 来源：`npx prisma db pull --print` 于 2026-06-02
> 数据库：PostgreSQL `skillflow`

---

## 表一览（7 张表）

| 表名 | 说明 |
|------|------|
| User | 用户 |
| Skill | 技能/工具 |
| SkillVersion | 技能版本 |
| Task | 执行任务 |
| TaskLog | 任务日志 |
| TaskFeedback | 任务反馈/评价 |
| Knowledge | 知识库文档 |

---

## User

| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | PK | |
| email | varchar | NOT, UNIQUE | |
| name | varchar | YES | |
| avatar | varchar | YES | |
| passwordHash | varchar | NOT | |
| createdAt | timestamptz | NOT | |
| updatedAt | timestamptz | NOT | |

## Skill

| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | PK | |
| name | varchar | NOT | |
| description | varchar | NOT | |
| source | varchar | NOT | builtin / user_upload / git |
| filePath | varchar | NOT | |
| version | varchar | NOT | |
| allowedTools | varchar[] | NOT, default [] | |
| maxSteps | int | NOT, default 30 | |
| tokenBudget | int | YES | |
| visibility | varchar | NOT, default "private" | |
| requires | varchar[] | NOT, default [] | |
| displayMeta | jsonb | YES | |
| uploadedBy | uuid | YES | FK → User.id |
| createdAt | timestamptz | NOT | |
| updatedAt | timestamptz | NOT | |

## SkillVersion

| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | PK | |
| skillId | uuid | NOT | FK → Skill.id (CASCADE) |
| version | varchar | NOT | |
| content | text | NOT | SKILL.md 全文 |
| changelog | varchar | YES | |
| createdAt | timestamptz | NOT | |

## Task

| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | PK | |
| userId | uuid | NOT | FK → User.id |
| skillId | uuid | NOT | FK → Skill.id |
| skillVersionId | uuid | NOT | FK → SkillVersion.id |
| status | varchar | NOT, default "pending" | pending/running/paused/completed/failed/cancelled |
| input | text | NOT | 用户输入 / 需求文本 |
| inputFiles | varchar[] | NOT, default [] | 上传文件路径 |
| output | text | YES | 完整输出日志 |
| outputFiles | varchar[] | NOT, default [] | 输出文件相对路径列表 |
| duration | int | YES | 执行耗时(ms)，首次生成时赋值 |
| totalCases | int | YES | 生成用例总数，首次赋值，微调不更新 |
| qualityScore | int | YES | 质量评分(0-100)，首次赋值，微调不更新 |
| category | varchar | YES | 需求类型（支付/订单/认证/...） |
| dimensionCoverage | jsonb | YES | 维度覆盖 [{name, code, covered, caseCount}] |
| agentRuntime | varchar | NOT, default "claude-cli" | |
| modelProvider | varchar | YES | |
| tokenUsage | int | YES | Token 消耗 |
| sessionId | varchar | YES | CLI session ID |
| pauseReason | varchar | YES | |
| pausedAt | timestamptz | YES | |
| pauseCount | int | NOT, default 0 | |
| retryCount | int | NOT, default 0 | |
| tweakCount | int | NOT, default 0 | 微调次数 |
| tweakHistory | jsonb | YES | 微调历史记录 |
| report | jsonb | YES | 解析后的报告 {tree, summary, meta, dimensions} |
| businessType | varchar | YES | ⚠️ DB 中存在但 Prisma schema 中无 |
| createdAt | timestamptz | NOT | |
| updatedAt | timestamptz | NOT | |

## TaskLog

| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | PK | |
| taskId | uuid | NOT | FK → Task.id (CASCADE) |
| sequence | int | NOT | |
| type | varchar | NOT | |
| input | text | YES | |
| output | text | YES | |
| duration | int | YES | |
| errorCode | varchar | YES | |
| errorMessage | text | YES | |
| stack | text | YES | |
| parentLogId | varchar | YES | |
| createdAt | timestamptz | NOT | |

## TaskFeedback

| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | PK | |
| taskId | uuid | NOT | FK → Task.id (CASCADE) |
| userId | uuid | NOT | FK → User.id |
| rating | int | NOT | 1-5 星 |
| comment | varchar | YES | |
| createdAt | timestamptz | NOT | |

## Knowledge

| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | PK | |
| title | varchar | NOT | |
| content | text | NOT | Markdown 内容 |
| tags | varchar[] | NOT, default [] | |
| type | varchar | NOT, default "knowledge" | ⚠️ DB 中存在但 Prisma schema 中无 |
| businessType | varchar | YES | ⚠️ DB 中存在但 Prisma schema 中无 |
| userId | uuid | NOT | FK → User.id |
| refCount | int | NOT, default 0 | |
| createdAt | timestamptz | NOT | |
| updatedAt | timestamptz | NOT | |

---

## ⚠️ Prisma Schema 与 DB 差异

以下 3 个列在数据库中存在但 **不在** `prisma/schema.prisma` 中，需要同步：

| 表 | 列 | 类型 | 建议 |
|----|-----|------|------|
| Task | `businessType` | varchar? | 如不需要，删掉 DB 列；如需要，加到 schema |
| Knowledge | `type` | varchar, default "knowledge" | 加到 schema |
| Knowledge | `businessType` | varchar? | 如不需要，删掉 DB 列；如需要，加到 schema |
