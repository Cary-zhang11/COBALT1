# 用例向导 Step 2 — 关联知识库 · 设计文档

> 日期：2026-06-02

---

## 概述

删除用例生成向导 Step 2 的 mock 数据，改为从知识库获取真实的业务知识和历史用例，用户勾选后以子目录方式传入沙箱供 AI 参考。

---

## 一、UI 变更

### Step 2 布局

```
┌─────────────────────────┬──────────────────────────────┐
│  业务知识                │  历史用例范文                  │
│  GET /api/knowledge     │  GET /api/knowledge           │
│  ?type=knowledge        │  ?type=history_uploaded       │
│                         │  +                           │
│                         │  GET /api/knowledge/history   │
│                         │  （合并展示）                  │
│                         │                              │
│  ☑ 用户认证业务规则.md   │  ☑ 登录鉴权用例集_v3.md       │
│  ☐ 订单流转规则.md       │  ☐ 商品购买全链路.md          │
│  ☑ 支付安全规范.md       │  ☑ 表单验证通用用例.md        │
│  ☐ ...                  │  ☐ ...                       │
└─────────────────────────┴──────────────────────────────┘
```

- 左侧：调用 `GET /api/knowledge?type=knowledge`，复选框列表
- 右侧：合并 `GET /api/knowledge?type=history_uploaded` + `GET /api/knowledge/history`，统一复选框列表
- 删除 `mockRecentReqs`、`mockFewShotExamples` 引用

---

## 二、数据流

```
用户勾选
    │
    ├── 业务知识（Knowledge 表 type=knowledge）
    │     content = "uploads/knowledge/{uuid}.md"
    │
    ├── 手动上传历史（Knowledge 表 type=history_uploaded）
    │     content = "uploads/history/{uuid}.md"
    │
    └── 平台生成历史（Task 表）
          outputFiles = "测试用例_v3.md"
          完整路径 = "sandbox/{taskId}/output/测试用例_v3.md"
    │
    ▼
startGenerate() 收集勾选项 →
    referenceFiles: [
      { sourcePath, subdir: "knowledge" | "history" }
    ]
    │
    ▼
createTask({ ..., referenceFiles })
    │
    ▼
copyFilesToWorkspace() 按子目录复制
    │
    ▼
sandbox/{newTaskId}/workspace/
├── 卖车页面改版.docx          ← 需求文档（不变）
├── knowledge/
│   ├── 用户认证业务规则.md
│   └── 支付安全规范.md
└── history/
    ├── 登录鉴权用例集_v3.md
    └── 表单验证通用用例.md
    │
    ▼
AI Prompt 告知目录含义
```

---

## 三、数据模型变更

### Task 表（不变）

不需要新增字段。`inputFiles` 继续存需求文档路径，reference 文件路径在生成时动态传入 `copyFilesToWorkspace`。

### copyFilesToWorkspace 签名变更

```typescript
// 现有
export async function copyFilesToWorkspace(
  taskId: string,
  filePaths: string[]
): Promise<string[]>

// 改为
export async function copyFilesToWorkspace(
  taskId: string,
  filePaths: string[],
  referenceFiles?: { sourcePath: string; subdir: string }[]
): Promise<string[]>
```

- `filePaths`：需求文档（平铺到 workspace 根目录），行为不变
- `referenceFiles`：知识/历史文件，复制到 workspace/{subdir}/{basename}

**路径安全：** `sourcePath` 需校验在 `uploads/` 或 `sandbox/` 目录内。

---

## 四、文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `components/usecase-gen/generate-wizard.tsx` | 修改 | Step 2 换掉 mock → 真实 API + 勾选逻辑；`startGenerate()` 传 referenceFiles |
| `lib/sandbox.ts` | 修改 | `copyFilesToWorkspace` 支持 referenceFiles 子目录参数 |
| `lib/task-engine.ts` | 修改 | `startTaskExecution` 接收并传入 referenceFiles |
| `app/api/tasks/[id]/execute/route.ts` | 修改 | POST body 新增 `referenceFiles` 参数 |
| `hooks/use-tasks.ts` | 修改 | `useExecuteTask` 支持传入 `referenceFiles` |
| `components/usecase-gen/shared/mock-data.ts` | 修改 | 删除已不再使用的 `mockRecentReqs`、`mockFewShotExamples` |

---

## 五、关键逻辑

### startGenerate() 改动

```typescript
const startGenerate = async () => {
  // ... 现有逻辑：createTask + executeTask ...
  
  // 收集 reference 文件路径
  const referenceFiles = [
    ...selectedKnowledge.map(id => {
      const k = knowledgeItems.find(item => item.id === id);
      return { sourcePath: `uploads/knowledge/${path.basename(k.content)}`, subdir: "knowledge" };
    }),
    ...selectedHistory.map(item => ({
      sourcePath: item.sourcePath,
      subdir: "history" as const,
    })),
  ];

  const { taskId: newTaskId } = await createTask.mutateAsync({
    skillId, input,
    uploadedFiles: uploadedFiles.map(f => f.path),
  });
  
  setTaskId(newTaskId);
  // referenceFiles 走 execute 路径，不存 DB
  await executeTask.mutateAsync({ taskId: newTaskId, referenceFiles });
};
```

> **注意：** `referenceFiles` 不存 Task 表，通过 execute API 直接传给 `startTaskExecution()` → `copyFilesToWorkspace()`。生成完成后 reference 文件随沙箱一起被清理。

### copyFilesToWorkspace() 改动

```typescript
export async function copyFilesToWorkspace(
  taskId: string,
  filePaths: string[],
  referenceFiles?: { sourcePath: string; subdir: string }[]
): Promise<string[]> {
  const workspaceDir = getWorkspacePath(taskId);
  await fs.mkdir(workspaceDir, { recursive: true });

  const copied: string[] = [];

  // 现有逻辑：需求文档平铺
  for (const fp of filePaths) {
    const dest = path.join(workspaceDir, path.basename(fp));
    await fs.copyFile(fp, dest);
    copied.push(dest);
  }

  // 新增：reference 文件按子目录复制
  if (referenceFiles) {
    for (const ref of referenceFiles) {
      const subDir = path.join(workspaceDir, ref.subdir);
      await fs.mkdir(subDir, { recursive: true });
      const dest = path.join(subDir, path.basename(ref.sourcePath));
      await fs.copyFile(ref.sourcePath, dest);
      copied.push(dest);
    }
  }

  return copied;
}
```

### Prompt 指引

AI skill prompt 中增加一句：

```
工作目录结构：
- workspace/ 根目录：需求文档
- workspace/knowledge/：业务参考知识，包含规范、规则文档
- workspace/history/：历史优秀用例范文，参考其结构和风格
```

---

## 六、边界处理

| 场景 | 处理 |
|------|------|
| 勾选文件在生成前被删除 | `startGenerate` 执行时 `fs.copyFile` 失败 → 跳过该文件，记录日志 |
| 同名文件 | 使用原始文件名，同 subdir 内冲突时加数字后缀 (1)、(2) |
| 平台生成历史源 sandbox 已清理 | `fs.copyFile` 失败 → 跳过，记录日志 |
| 用户一个都不选 | referenceFiles 为空数组，正常生成 |
| 选中文件路径穿越 | `sourcePath` 校验必须含 `uploads/` 或 `sandbox/` 前缀 |

---

## 七、测试要点

- 勾选业务知识 → 文件复制到 workspace/knowledge/
- 勾选手动上传历史 → 文件复制到 workspace/history/
- 勾选平台生成历史 → 文件从 sandbox/{srcId}/output/ 复制到 workspace/history/
- 不勾选任何文件 → 正常生成，workspace 无 knowledge/history 子目录
- 源文件不存在 → 跳过，不影响其他文件复制
