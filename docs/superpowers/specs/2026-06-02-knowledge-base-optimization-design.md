# 知识库管理优化 · 设计文档

> 日期：2026-06-02
> 关联：[[2026-06-01-dashboard-knowledgebase-design]]

---

## 概述

优化知识库管理模块，支持 md 文件上传，引入业务类型分类（C1C/C1B/C2C/C2B/数科/车小妹），替换原有标签体系。历史用例区分平台生成与手动上传，支持下载。

---

## 一、数据模型

### Knowledge 表

```prisma
model Knowledge {
  id           String    @id @default(uuid())
  title        String
  content      String    @db.Text          // 存文件相对路径，不再存文本内容
  tags         String[]  @default([])       // 保留字段，统一置空 []
  type         String    @default("knowledge")  // "knowledge" | "history_uploaded"
  businessType String?                       // "C1C"|"C1B"|"C2C"|"C2B"|"数科"|"车小妹" | null
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  refCount     Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

**字段说明：**

| 字段 | 变更 | 说明 |
|------|------|------|
| `content` | 改为存路径 | 从存文本内容改为存文件相对路径（如 `uploads/knowledge/{uuid}.md`） |
| `tags` | 保留置空 | 字段保留但统一设为 `[]`，UI 不再使用 |
| `type` | 新增 | `"knowledge"` = 业务知识，`"history_uploaded"` = 手动上传历史用例 |
| `businessType` | 新增 | 业务知识 Tab 可选（允许 null），手动上传 Tab 必选 |

### Task 表

```prisma
model Task {
  // ... 现有字段不变
  businessType String?   // "C1C"|"C1B"|"C2C"|"C2B"|"数科"|"车小妹" | null
}
```

**注意：** DB 中已有 `Knowledge.type`、`Knowledge.businessType`、`Task.businessType` 三个列，只需同步 Prisma schema，不需运行 `prisma migrate`。

---

## 二、文件存储

两类知识文件统一存磁盘，`content` 字段存相对路径：

```
uploads/
├── *.docx                    # 现有：任务需求文档（平铺，不动）
├── knowledge/                # 新增：业务知识 (type=knowledge)
│   └── {uuid}.md
└── history/                  # 新增：手动上传历史 (type=history_uploaded)
    └── {uuid}.md
```

| 来源 | 存储路径 | content 值示例 |
|------|----------|---------------|
| 业务知识 | `uploads/knowledge/{uuid}.md` | `uploads/knowledge/abc-123.md` |
| 手动上传历史 | `uploads/history/{uuid}.md` | `uploads/history/def-456.md` |
| 平台生成历史 | 现有 sandbox/{taskId}/output/*.md | Task.outputFiles（不变） |

**上传约束：**
- 仅允许 `.md` 后缀
- 单个文件 ≤ 5MB
- 上传时文件重命名为 `{uuid}.md`，原始文件名作为 title 默认值
- 上传后 title 可通过 PUT 接口修改

---

## 三、API 设计

### Knowledge API

| 方法 | 路径 | 变更说明 |
|------|------|----------|
| GET | `/api/knowledge` | `tag` 参数移除，改用 `businessType` + `type` + `search` |
| POST | `/api/knowledge` | JSON body → FormData（md 文件上传），后端读文件写入磁盘，content 存路径 |
| GET | `/api/knowledge/:id` | 返回值新增 `businessType`、`type` |
| PUT | `/api/knowledge/:id` | 支持更新 `title`、`content`（编辑后文本写回文件）、`businessType` |
| DELETE | `/api/knowledge/:id` | 删 DB 记录 + 删磁盘文件（文件不存在时不阻塞） |
| GET | `/api/knowledge/:id/download` | **新增** — 读磁盘文件，`Content-Disposition: attachment` 触发下载 |

### Task API

| 方法 | 路径 | 变更说明 |
|------|------|----------|
| PATCH | `/api/tasks/:id` | **新增** — 更新 `businessType`（管理员分配业务类型） |
| GET | `/api/tasks/:id/download` | 已有，复用（平台生成历史文件的预览和下载） |

### History API

| 方法 | 路径 | 变更说明 |
|------|------|----------|
| GET | `/api/knowledge/history` | 返回增加 `businessType` 字段；新增 `businessType` 筛选参数；`unclassified` 映射为 `IS NULL` |

### 关键流程

**上传：** 前端 FormData → 后端校验后缀 `.md` + 文件 ≤ 5MB → 写入 `uploads/{knowledge\|history}/{uuid}.md` → DB 记录 content=相对路径，title=原始文件名，type=上下文类型

**下载：** GET `/:id/download` → 读 `content` 路径文件 → `Content-Disposition: attachment; filename="{title}.md"` → 浏览器触发下载

**删除：** 删 DB 记录 → `fs.unlink(content路径)` → 文件不存在时 catch 不抛错

**GET 筛选：** `type=knowledge` 查业务知识，`type=history_uploaded` 查手动上传历史，不传 `type` 返回所有

**平台生成历史：** 筛选 `status: { in: ["completed", "paused"] }`，返回含 `businessType` 字段

---

## 四、UI 设计

### 整体布局

保持现有左右结构 + 顶部 Tab 切换：

```
┌─────────────────────────────────────────────────────────┐
│  [业务知识]  [历史用例]                                   │
├────────────┬────────────────────────────────────────────┤
│ 搜索框     │                                            │
│            │  列表项 × N                                 │
│ 业务类型   │  ┌────────────────────────────────────┐    │
│ ○ 全部     │  │ 📄 文件名   [C1C]  日期  引用次数  │    │
│ ○ C1C     │  │    预览 | 下载 | 删除               │    │
│ ○ C1B     │  └────────────────────────────────────┘    │
│ ○ C2C     │                                            │
│ ○ C2B     │  [+ 上传 md 文件]                          │
│ ○ 数科     │                                            │
│ ○ 车小妹   │                                            │
├────────────┴────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────┘
```

### 业务知识 Tab

- **左侧筛选栏**：搜索框（关键词） + 业务类型单选（全部 / C1C / C1B / C2C / C2B / 数科 / 车小妹）
- **列表项**：文件名 + 业务类型标签 + 日期 + 引用次数 + 预览 / 下载 / 删除
- **添加**：底部 "+ 上传 md 文件" 按钮 → 打开共用上传弹窗
- **上传弹窗**：文件选择（仅 .md）+ 业务类型下拉（可选）+ 标题输入（默认取文件名）
- **预览**：Markdown 渲染模态框（从磁盘读文件内容）
- **下载**：触发浏览器下载 .md 文件

### 历史用例 Tab

顶部两个子 Tab：`平台生成` | `手动上传`

**平台生成子 Tab：**
- 数据来源：Task 表（status = completed | paused，report IS NOT NULL）
- 筛选项：搜索框 + 全部 / C1C / C1B / C2C / C2B / 数科 / 车小妹 / 未分类（businessType IS NULL）
- 列表项：文件名 + 业务类型（可能为"未分类"）+ 日期 + 预览 / 下载 / 分配类型
- 分配类型：点击弹出下拉 → C1C/C1B/C2C/C2B/数科/车小妹，调 PATCH `/api/tasks/:id`
- 预览/下载：复用已有 `/api/tasks/:id/download` 接口

**手动上传子 Tab：**
- 数据来源：Knowledge 表（type = "history_uploaded"）
- 筛选项：搜索框 + 全部 / C1C / C1B / C2C / C2B / 数科 / 车小妹（无"未分类"）
- 列表项：文件名 + 业务类型标签 + 日期 + 预览 / 下载 / 删除
- 上传弹窗：和业务知识共用组件，businessType **必选**

### 共用上传弹窗

```
┌─────────────────────────────────────┐
│  上传 md 文件                    ✕  │
├─────────────────────────────────────┤
│                                     │
│  [拖拽或点击选择 .md 文件]           │
│  仅支持 .md，最大 5MB               │
│                                     │
│  标题                               │
│  ┌─────────────────────────────┐    │
│  │ 自动填充文件名               │    │
│  └─────────────────────────────┘    │
│                                     │
│  业务类型                           │
│  ┌─────────────────────────────┐    │
│  │ ▼ 请选择                    │    │
│  └─────────────────────────────┘    │
│                                     │
│  * 业务知识 Tab → 可选              │
│  * 手动上传 Tab → 必选 (红色标记)    │
│                                     │
│         [取消]    [上传]            │
└─────────────────────────────────────┘
```

---

## 五、组件与文件变更

### 新建文件

| 文件 | 说明 |
|------|------|
| `app/api/knowledge/[id]/download/route.ts` | 知识项下载接口 |
| `app/api/tasks/[id]/route.ts` 新增 PATCH | Task businessType 更新 |
| `components/usecase-gen/shared/upload-modal.tsx` | 共用上传弹窗组件 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `prisma/schema.prisma` | 同步 Knowledge.type、Knowledge.businessType、Task.businessType |
| `app/api/knowledge/route.ts` | GET 改用 businessType/type 筛选；POST 改为 FormData + 文件写入 |
| `app/api/knowledge/[id]/route.ts` | PUT 支持 businessType/content；DELETE 增加删磁盘文件 |
| `app/api/knowledge/history/route.ts` | 返回增加 businessType，新增筛选参数 |
| `components/usecase-gen/knowledge-base.tsx` | 整体重写：标签筛选→业务类型筛选、新增上传/下载、历史拆分两个子 Tab |

### 现有标签处理

- 所有现有 Knowledge 记录的 `tags` 统一置为 `[]`
- `businessType` 对新旧数据均为 null（用户在 UI 中按需分配）

---

## 六、测试要点

- 上传 .md 文件成功，文件写入正确路径，title 自动填充
- 上传非 .md 文件被拒绝（前端 + 后端双重校验）
- 上传超过 5MB 文件被拒绝
- 业务知识 Tab 下 businessType 可选，手动上传 Tab 下必选
- 下载触发浏览器保存 .md 文件，文件名正确
- 删除同时清理 DB 记录和磁盘文件
- 平台生成历史按 businessType 筛选正确，unclassified 映射 IS NULL
- PATCH 分配业务类型成功
- 预览模态框正确渲染 Markdown
- 旧数据 tags 置空，businessType 为 null，UI 正常展示
