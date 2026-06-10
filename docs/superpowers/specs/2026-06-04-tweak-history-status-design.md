# Tweak History 状态收口设计

**日期**: 2026-06-04 | **范围**: C（P0 + 全量 P1）

---

## 1. 问题

微调过程中用户关闭页面再重新打开，界面显示微调一直转圈。根因：`tweakHistory.status` 的 `"done"` 由前端 scanner 通过 PATCH 写入——关页后 scanner 消失，没人写 `done`，状态永久停留在 `"running"`。

## 2. 架构

```
POST /tweak → tweakHistory[round:N, status:"running"] + tweakCount=N  (原子 DB 写入)
     ↓
resumeTask (服务端，fire-and-forget)
     ↓
output_complete → saveOutputAndReport → markTweakEntryDone    ← P0 新增
error / catch   → markTweakEntryFailed                        ← P0 新增
     ↓
前端 scanner / 历史 reconcile → 停轮询、刷新 UI（兜底）
前端 PATCH → 仅补充 summary（乐观锁，不覆盖 status）
```

**事实来源**: `tweakHistory.status` 以服务端 `resumeTask` 为准。前端 `generating` 仅本页状态，不写入 DB。

**微调 vs 手动 resume 区分**: `findRunningTweakEntry(history).round === tweakCount`，成立才是微调 resume。POST /tweak 中 `tweakCount++` 与 `tweakHistory` 追加是同一原子 update，不存在不一致窗口。手动 resume（`POST /resume`）没有 running 条目，不触发 tweakHistory 更新。

## 3. P0：`lib/tweak-history.ts` + `resumeTask`

### 新模块 `lib/tweak-history.ts`（服务端）

```typescript
// 返回最后一个 status === "running" 的条目，无则 undefined
// （纯函数，前端共享同一逻辑：history.filter(e => e.status === "running").sort((a,b) => b.round - a.round)[0]）
findRunningTweakEntry(history: TweakEntry[]): TweakEntry | undefined

// 将指定 round 的条目状态更新为 "done"
markTweakEntryDone(taskId: string, round: number, summary?: string): Promise<void>

// 将指定 round 的条目状态更新为 "failed"
markTweakEntryFailed(taskId: string, round: number, error?: string): Promise<void>
```

### 挂钩点（`resumeTask`，判断 `findRunningTweakEntry(history).round === tweakCount`）

| 事件 | 位置 | 行为 |
|------|------|------|
| `pause` + `output_complete` | `saveOutputAndReport` 之后、terminal update 之前 | `markTweakEntryDone` |
| `pause` + 非 `output_complete` | terminal update 前 | `markTweakEntryFailed` |
| `error` | 现有 failed update 前 | `markTweakEntryFailed` |
| 流自然结束 | `saveOutputAndReport` 之后 | `markTweakEntryDone` |
| `catch`（非 cancelled） | 现有 failed update 前 | `markTweakEntryFailed` |
| `catch`（cancelled） | 跳过（`cancelTask` 侧已处理，见 §7） | — |

### 前端（`generate-wizard`）

- `onResult`: 取 round（优先 `findRunningTweakEntry`，fallback 到 `maxRound`）→ PATCH `{summary}`（**不传 `expectedStatus`**——summary 仅追加信息，且此时服务端通常已标 done）
- `onError`: 从 `data.tweakHistory` 中找 round → **只更新本地 UI**，不再 PATCH status（服务端已写 failed）
- 移除 `round = serverHistory.length` / `round = tweakHistory.length` 的推算逻辑

## 4. P1a：微调 scanner（`use-output-scanner`）

### 新增工具函数

```typescript
// 同 maxXmindVersion，但查 MD 文件且过滤 "测试用例"
maxMdVersion(files: FileInfo[]): number
// 规则: 文件名含"测试用例"且以 .md 结尾 → _vN 提取版本，无后缀 = 0，无匹配 = -1
```

### Scanner 新增 prop

- `mdBaselineVersion?: number`（默认 undefined）
  - 传了（且 >= 0）→ **tweak 模式**：仅检查 `maxMdVersion > mdBaseline` + `tree` 非空；**不检查 duration**
  - 未传 → **initial 模式**（现有逻辑）：XMind > baseline + tree + duration

### `generate-wizard` 变更

- 新增 `mdBaseline` state
- `onTweakStarted`: `setMdBaseline(maxMdVersion(...))`
- `startGenerate`: 重置 `xmindBaseline=-1`，`mdBaseline` 为 undefined
- 首次生成逻辑不变（用 XMind baseline）

## 5. P1b：历史 reconcile（`initialTaskId` effect）

### 触发条件

- tweakHistory 中存在 `status === "running"` 的条目

### 流程

1. 现有第 1 次 report → 首屏渲染（不变）
2. 若触发 → **仅 1 次**第 2 次 report（`reconciledRef` 防 Strict Mode 双调）
3. 用第 2 次 report 的数据更新本地 state：tree、outputFiles（→ `setLoadedFiles`）、stats、tweakHistory
4. 兜底：若仍 `running` 且 `maxMdVersion >= running.round` 且 `tree` 存在 → 本地标 `done` + PATCH（`expectedStatus: "running"`）

P0 上线后步骤 4 多为 no-op，保留兼容旧任务。

## 6. P1c：`OutputFiles`

- 新增 `isGenerating?: boolean` prop

| `displayable.length` | `isGenerating` | 展示 |
|---------------------|----------------|------|
| 0 | true | 转圈「生成中…」 |
| 0 | false | 「暂无输出文件」 |
| >0 | true | 正常文件列表 |
| >0 | false | 正常文件列表 |

- `onTweakStarted` 不再 `setLoadedFiles([])`（保留上一轮文件，微调期间继续展示）

## 7. 错误处理与边界

| 场景 | 处理 |
|------|------|
| 关页后 CLI 跑完 | P0 服务端直接写 `done`，再进历史正确 |
| 仅 MD 无 XMind | 微调 scanner（P1a）可结束；P0 同样标 `done` |
| 取消微调 | `cancelTask` 中调用 `markTweakEntryFailed` |
| PATCH 竞争 | PATCH 端点加 `expectedStatus` 参数：匹配则更新，不匹配返回 409；前端收到 409 从 report 刷新 |
| `inject` 进行中 | 不写 `tweakHistory`，reconcile 不触发 |
| 并发再发微调 | AITweakPanel 发送按钮在 `tweakHistory` 中存在 `running` 条目时禁用（不仅依赖 `generating` prop——关页重开后 `generating=false` 但 tweakHistory 仍有 running） |
| 手动 resume（非微调） | `findRunningTweakEntry` 为 null 或 round 不匹配 → 不更新 tweakHistory |
| 模型不遵守命名约束 | §5 步骤 4 兜底放宽：`maxMdVersion >= running.round`，或放宽为只要 `tree` 存在 + `maxMdVersion >= 0`（有至少一个测试用例 MD 产出）即标 done |

## 8. PATCH 端点变更（方案 C 乐观锁）

```
PATCH /api/tasks/:id/tweak
Body: { round, updates, expectedStatus? }

- entry 不存在 → 404
- expectedStatus 未传 → 直接合并（向后兼容旧调用方）
- entry.status !== expectedStatus → 409 { current: entry }
- 匹配 → 合并 updates，返回 200
```

## 9. 测试

| 层级 | 内容 |
|------|------|
| 单元 | `maxMdVersion`、`findRunningTweakEntry`、round 匹配判定、PATCH 乐观锁 |
| 集成 | `resumeTask` mock 流 → tweakHistory 变 `done` / `failed`；`cancelTask` → tweakHistory 变 `failed` |
| 组件 | `OutputFiles` 有文件 + `isGenerating` 不转圈；历史 reconcile mock 双 fetch；PATCH 409 → 刷新 |
