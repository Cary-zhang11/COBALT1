# 知识库管理优化 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化知识库管理模块 — 支持 md 文件上传、引入业务类型分类替代标签体系、历史用例区分平台生成与手动上传、支持预览/编辑/下载。

**Architecture:** 同步 Prisma schema 新增 `type`/`businessType` 字段，改写 Knowledge API（文件上传/下载/路径校验），新增 Task PATCH 分配业务类型，重写 knowledge-base 组件（Tab/筛选/预览编辑弹窗/上传弹窗）。

**Tech Stack:** Next.js 14, Prisma, React 18, TypeScript, Tailwind CSS, react-markdown, TanStack React Query

**Spec:** `docs/superpowers/specs/2026-06-02-knowledge-base-optimization-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `prisma/schema.prisma` | 修改 | 同步 Knowledge.type、Knowledge.businessType、Task.businessType |
| `app/api/knowledge/route.ts` | 修改 | GET 改用 businessType+type 筛选；POST 改为 FormData+文件写入 |
| `app/api/knowledge/[id]/route.ts` | 修改 | PUT 支持 businessType/content 写文件；DELETE 增加 fs.unlink |
| `app/api/knowledge/[id]/download/route.ts` | **新建** | 读磁盘文件返回 Markdown 内容，含路径安全校验 |
| `app/api/knowledge/history/route.ts` | 修改 | 返回 businessType 字段 + 筛选参数 |
| `app/api/tasks/[id]/route.ts` | 修改 | 新增 PATCH handler 更新 Task.businessType |
| `components/usecase-gen/shared/upload-modal.tsx` | **新建** | 共用上传弹窗 — md 文件选择 + 标题 + businessType 下拉 |
| `components/usecase-gen/knowledge-base.tsx` | 修改 | 整体重写 — 标签筛选→业务类型筛选、新增上传/下载/编辑、历史拆分两个子 Tab |
| `components/usecase-gen/__tests__/knowledge-base.test.tsx` | 修改 | 更新测试用例覆盖新功能 |

---

### Task 1: Prisma Schema 同步

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 为 Knowledge 表新增 type 和 businessType 字段**

```prisma
model Knowledge {
  id           String    @id @default(uuid())
  title        String
  content      String    @db.Text
  tags         String[]  @default([])
  type         String    @default("knowledge")
  businessType String?
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  refCount     Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

修改内容：在 `tags` 和 `userId` 之间插入 `type` 和 `businessType`。

- [ ] **Step 2: 为 Task 表新增 businessType 字段**

```prisma
model Task {
  // ... 现有字段不变
  report       Json?
  businessType String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  // ...
}
```

在 `report` 和 `createdAt` 之间插入 `businessType String?`。

- [ ] **Step 3: 运行 prisma generate 并验证**

```bash
npx prisma generate
```

Expected: 无错误，生成的 Prisma Client 包含新字段。

验证：检查 `node_modules/.prisma/client/index.d.ts` 中 Knowledge 和 Task 类型包含新字段。

```bash
grep -n "businessType" node_modules/.prisma/client/index.d.ts | head -5
```

Expected: 看到 Knowledge 和 Task 的 businessType 类型定义。

- [ ] **Step 4: 将现有 Knowledge 记录的 tags 置空**

创建一次性数据脚本 `scripts/migrate-knowledge-tags.ts`：

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.knowledge.updateMany({
    where: { tags: { isEmpty: false } },
    data: { tags: [] },
  });
  console.log(`Reset tags for ${result.count} knowledge records`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

```bash
npx tsx scripts/migrate-knowledge-tags.ts
```

Expected: `Reset tags for N knowledge records`

- [ ] **Step 5: 清理临时脚本并提交**

```bash
rm scripts/migrate-knowledge-tags.ts
git add prisma/schema.prisma
git commit -m "feat: sync prisma schema — add Knowledge.type/businessType, Task.businessType, reset tags"
```

---

### Task 2: 更新 GET /api/knowledge — 筛选参数切换

**Files:**
- Modify: `app/api/knowledge/route.ts`

- [ ] **Step 1: 更新 GET handler — tag 参数替换为 businessType + type**

替换现有 `GET` 函数中的查询逻辑：

```typescript
// 替换 lines 10-13 的参数解析
const search = req.nextUrl.searchParams.get("search") || "";
const businessType = req.nextUrl.searchParams.get("businessType") || "";
const type = req.nextUrl.searchParams.get("type") || "";
const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
const pageSize = 20;

// 替换 lines 16-23 的 where 构建
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const where: any = {};
if (search) {
  where.title = { contains: search, mode: "insensitive" };
}
if (businessType) {
  where.businessType = businessType;
}
if (type) {
  where.type = type;
}
```

- [ ] **Step 2: 更新 select 字段 — 移除 tags，新增 businessType 和 type**

```typescript
// 替换 lines 26-35 的 select
select: {
  id: true,
  title: true,
  businessType: true,
  type: true,
  refCount: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true } },
},
```

- [ ] **Step 3: 构建并验证**

```bash
npx next build 2>&1 | tail -5
```

Expected: build 成功无类型错误。

- [ ] **Step 4: 提交**

```bash
git add app/api/knowledge/route.ts
git commit -m "feat: switch knowledge GET filter from tag to businessType+type"
```

---

### Task 3: 更新 POST /api/knowledge — FormData 文件上传

**Files:**
- Modify: `app/api/knowledge/route.ts`

- [ ] **Step 1: 添加文件系统导入和路径常量**

在文件顶部现有 import 之后添加：

```typescript
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = [".md"];
```

- [ ] **Step 2: 替换 POST handler — FormData 处理**

替换整个 `POST` 函数：

```typescript
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "";
    const businessType = (formData.get("businessType") as string) || null;
    const type = (formData.get("type") as string) || "knowledge";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // 校验文件后缀
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: "Only .md files are allowed" }, { status: 400 });
    }

    // 校验文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size exceeds 5MB limit" }, { status: 400 });
    }

    // 先创建 Knowledge 记录获取 uuid
    const knowledge = await prisma.knowledge.create({
      data: {
        title: title || file.name.replace(/\.md$/i, ""),
        content: "", // 临时值，下面更新为路径
        tags: [],
        businessType: businessType || null,
        type,
        userId,
      },
    });

    // 写入磁盘文件
    const subDir = type === "history_uploaded" ? "history" : "knowledge";
    const targetDir = path.join(UPLOADS_ROOT, subDir);
    await mkdir(targetDir, { recursive: true });

    const filePath = path.join(subDir, `${knowledge.id}.md`);
    const absolutePath = path.join(UPLOADS_ROOT, filePath);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, buffer);

    // 更新 content 为相对路径
    const updated = await prisma.knowledge.update({
      where: { id: knowledge.id },
      data: { content: filePath },
    });

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error("Knowledge create error:", error);
    return NextResponse.json({ error: "Failed to create knowledge" }, { status: 500 });
  }
}
```

- [ ] **Step 3: 构建验证**

```bash
npx next build 2>&1 | tail -5
```

Expected: 成功无错误。

- [ ] **Step 4: 提交**

```bash
git add app/api/knowledge/route.ts
git commit -m "feat: switch knowledge POST to FormData file upload with validation"
```

---

### Task 4: 更新 PUT 和 DELETE /api/knowledge/[id]

**Files:**
- Modify: `app/api/knowledge/[id]/route.ts`

- [ ] **Step 1: 添加 fs 导入**

在文件顶部 import 之后添加：

```typescript
import { writeFile, unlink } from "fs/promises";
import path from "path";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
```

- [ ] **Step 2: 更新 PUT handler — 支持 businessType 和内容写回**

替换 `PUT` 函数：

```typescript
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const body = await req.json();
    const { title, content, businessType } = body;

    // 如果传了 content（编辑后文本），写回磁盘文件
    if (content !== undefined) {
      const knowledge = await prisma.knowledge.findUnique({
        where: { id: params.id },
        select: { content: true },
      });
      if (knowledge?.content) {
        const absolutePath = path.join(UPLOADS_ROOT, knowledge.content);
        const dir = path.dirname(absolutePath);
        await (await import("fs/promises")).mkdir(dir, { recursive: true });
        await writeFile(absolutePath, content, "utf-8");
      }
    }

    const updated = await prisma.knowledge.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(businessType !== undefined && { businessType }),
      },
    });

    // 如果传了 content，返回时包含新内容
    if (content !== undefined && updated.content) {
      return NextResponse.json({ ...updated, content });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Knowledge update error:", error);
    return NextResponse.json({ error: "Failed to update knowledge" }, { status: 500 });
  }
}
```

- [ ] **Step 3: 更新 DELETE handler — 增加磁盘文件清理**

替换 `DELETE` 函数：

```typescript
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    // 先获取 content 路径以删除磁盘文件
    const knowledge = await prisma.knowledge.findUnique({
      where: { id: params.id },
      select: { content: true },
    });

    await prisma.knowledge.delete({ where: { id: params.id } });

    // 删磁盘文件（文件不存在时不阻塞）
    if (knowledge?.content) {
      try {
        const absolutePath = path.join(UPLOADS_ROOT, knowledge.content);
        await unlink(absolutePath);
      } catch {
        // 文件不存在时忽略
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Knowledge delete error:", error);
    return NextResponse.json({ error: "Failed to delete knowledge" }, { status: 500 });
  }
}
```

- [ ] **Step 4: 构建验证**

```bash
npx next build 2>&1 | tail -5
```

Expected: 成功。

- [ ] **Step 5: 提交**

```bash
git add app/api/knowledge/\[id\]/route.ts
git commit -m "feat: update knowledge PUT for file write, DELETE for disk cleanup"
```

---

### Task 5: 创建 GET /api/knowledge/[id]/download

**Files:**
- Create: `app/api/knowledge/[id]/download/route.ts`

- [ ] **Step 1: 创建下载路由 — 含路径安全校验**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const knowledge = await prisma.knowledge.findUnique({
      where: { id: params.id },
      select: { title: true, content: true },
    });

    if (!knowledge) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!knowledge.content) {
      return NextResponse.json({ error: "No file content" }, { status: 404 });
    }

    // 路径安全校验
    const absolutePath = path.resolve(UPLOADS_ROOT, knowledge.content);
    if (!absolutePath.startsWith(UPLOADS_ROOT)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const content = await readFile(absolutePath, "utf-8");

    // fetch（预览）场景返回纯文本；浏览器直接访问触发下载
    const isDownload = req.nextUrl.searchParams.get("download") === "1";

    if (isDownload) {
      const filename = `${knowledge.title}.md`;
      return new NextResponse(content, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    return new NextResponse(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Knowledge download error:", error);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
```

- [ ] **Step 2: 创建目录并构建**

```bash
mkdir -p app/api/knowledge/\[id\]/download
```

```bash
npx next build 2>&1 | tail -5
```

Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add app/api/knowledge/\[id\]/download/route.ts
git commit -m "feat: add knowledge download endpoint with path validation"
```

---

### Task 6: 新增 PATCH /api/tasks/[id]

**Files:**
- Modify: `app/api/tasks/[id]/route.ts`

- [ ] **Step 1: 在 GET handler 之后添加 PATCH handler**

在文件末尾（`GET` 函数的 `}` 和最终 `}` 之间）插入：

```typescript
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const body = await req.json();
    const { businessType } = body;

    if (!businessType || !["C1C", "C1B", "C2C", "C2B", "数科", "车小妹"].includes(businessType)) {
      return NextResponse.json(
        { error: "Invalid businessType" },
        { status: 400 }
      );
    }

    const task = await prisma.task.update({
      where: { id: params.id },
      data: { businessType },
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Task patch error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
```

- [ ] **Step 2: 构建验证**

```bash
npx next build 2>&1 | tail -5
```

Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add app/api/tasks/\[id\]/route.ts
git commit -m "feat: add PATCH /api/tasks/:id for businessType assignment"
```

---

### Task 7: 更新 GET /api/knowledge/history — businessType 字段

**Files:**
- Modify: `app/api/knowledge/history/route.ts`

- [ ] **Step 1: 更新 GET handler — 新增 businessType 筛选和返回**

替换整个 GET 函数：

```typescript
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const search = req.nextUrl.searchParams.get("search") || "";
    const businessType = req.nextUrl.searchParams.get("businessType") || "";
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
    const pageSize = 20;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      status: { in: ["completed", "paused"] },
      report: { not: null },
    };
    if (search) {
      where.input = { contains: search, mode: "insensitive" };
    }
    if (businessType) {
      // "unclassified" 映射为 IS NULL
      if (businessType === "unclassified") {
        where.businessType = null;
      } else {
        where.businessType = businessType;
      }
    }

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          id: true,
          input: true,
          createdAt: true,
          totalCases: true,
          qualityScore: true,
          report: true,
          outputFiles: true,
          businessType: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({
      items: items.map((t) => {
        const report = t.report as Record<string, unknown> | null;
        const summary = report?.summary as Record<string, unknown> | undefined;
        const outputFiles = t.outputFiles as string[] | null;
        const mdFile = outputFiles?.find((f: string) => f.endsWith(".md") && f.includes("测试用例")) || "";
        return {
          id: t.id,
          req: (t.input || "").slice(0, 60),
          createdAt: t.createdAt.toLocaleDateString("zh-CN"),
          totalCases: t.totalCases || 0,
          qualityScore: t.qualityScore || 0,
          modules: summary?.modules as number || 0,
          userName: t.user?.name || "未知",
          mdFileName: mdFile,
          businessType: t.businessType || null,
        };
      }),
      total,
    });
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
```

改动要点：
- 新增 `businessType` 查询参数
- `"unclassified"` 映射为 `where.businessType = null`
- select 中加上 `businessType: true`
- 返回 map 中加上 `businessType: t.businessType || null`

- [ ] **Step 2: 构建验证**

```bash
npx next build 2>&1 | tail -5
```

Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add app/api/knowledge/history/route.ts
git commit -m "feat: add businessType field and filter to history API"
```

---

### Task 8: 创建共用上传弹窗组件

**Files:**
- Create: `components/usecase-gen/shared/upload-modal.tsx`

- [ ] **Step 1: 创建 UploadModal 组件**

```typescript
"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const BUSINESS_TYPES = ["C1C", "C1B", "C2C", "C2B", "数科", "车小妹"] as const;

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  context: "knowledge" | "history_uploaded"; // 决定 businessType 可选/必选
}

export function UploadModal({ open, onClose, context }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const businessTypeRequired = context === "history_uploaded";

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || file.name.replace(/\.md$/i, ""));
      formData.append("type", context === "history_uploaded" ? "history_uploaded" : "knowledge");
      if (businessType) formData.append("businessType", businessType);
      const res = await fetch("/api/knowledge", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      reset();
      onClose();
    },
  });

  function reset() {
    setFile(null);
    setTitle("");
    setBusinessType("");
    setDragOver(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.toLowerCase().endsWith(".md")) {
        uploadMutation.reset();
        return;
      }
      if (f.size > 5 * 1024 * 1024) {
        uploadMutation.reset();
        return;
      }
      setFile(f);
      setTitle(title || f.name.replace(/\.md$/i, ""));
    }
  }

  function canSubmit() {
    if (!file) return false;
    if (businessTypeRequired && !businessType) return false;
    return true;
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          reset();
          onClose();
        }
      }}
    >
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">上传 md 文件</h3>
          <button
            onClick={() => { reset(); onClose(); }}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* File drop zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center mb-4 transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f && f.name.toLowerCase().endsWith(".md") && f.size <= 5 * 1024 * 1024) {
              setFile(f);
              setTitle(title || f.name.replace(/\.md$/i, ""));
            }
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".md"
            className="hidden"
            onChange={handleFileChange}
          />
          {file ? (
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="text-xs text-red-500 mt-1 hover:underline"
              >
                移除
              </button>
            </div>
          ) : (
            <div>
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">拖拽或点击选择 .md 文件</p>
              <p className="text-xs text-muted-foreground mt-1">仅支持 .md，最大 5MB</p>
            </div>
          )}
        </div>

        {/* Title */}
        <label className="block text-sm font-medium mb-1">标题</label>
        <input
          type="text"
          placeholder="自动填充文件名"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />

        {/* Business type */}
        <label className="block text-sm font-medium mb-1">
          业务类型
          {businessTypeRequired && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <select
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">请选择</option>
          {BUSINESS_TYPES.map((bt) => (
            <option key={bt} value={bt}>{bt}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mb-4">
          {businessTypeRequired
            ? "手动上传历史必须选择业务类型"
            : "业务知识 Tab — 可选"}
        </p>

        {/* Footer */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => { reset(); onClose(); }}
            className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60"
          >
            取消
          </button>
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!canSubmit() || uploadMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-40 flex items-center gap-2"
          >
            {uploadMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            上传
          </button>
        </div>

        {uploadMutation.error && (
          <p className="text-red-500 text-xs mt-2">
            {uploadMutation.error instanceof Error ? uploadMutation.error.message : "上传失败"}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 构建验证**

```bash
npx next build 2>&1 | tail -5
```

Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add components/usecase-gen/shared/upload-modal.tsx
git commit -m "feat: add shared upload modal for md file upload with businessType"
```

---

### Task 9: 重写 KnowledgeBase 组件

**Files:**
- Modify: `components/usecase-gen/knowledge-base.tsx`

这是最大的改动。组件拆分为以下结构：

```
KnowledgeBase (主组件)
├── 顶部 Tab: [业务知识] [历史用例]
├── 左侧筛选栏: 搜索框 + 业务类型 radio
├── 业务知识 Tab 内容
│   ├── 列表项 (preview/download/delete)
│   └── 上传按钮
├── 历史用例 Tab 内容
│   ├── 子 Tab: [平台生成] [手动上传]
│   ├── 平台生成子 Tab: 列表项 (preview/download/assignType)
│   └── 手动上传子 Tab: 列表项 (preview/download/delete) + 上传按钮
├── 预览/编辑模态框 (业务知识 & 手动上传共用)
├── 上传弹窗 (共用 UploadModal)
└── FilePreviewModal (平台生成预览，复用已有组件)
```

- [ ] **Step 1: 完整重写 knowledge-base.tsx**

```typescript
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Loader2, Download, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { UploadModal } from "./shared/upload-modal";
import { FilePreviewModal } from "./shared/file-preview";

const BUSINESS_TYPES = ["C1C", "C1B", "C2C", "C2B", "数科", "车小妹"] as const;

interface KnowledgeItem {
  id: string;
  title: string;
  businessType: string | null;
  type: string;
  refCount: number;
  createdAt: string;
  updatedAt: string;
  user?: { name: string };
}

interface HistoryItem {
  id: string;
  req: string;
  createdAt: string;
  totalCases: number;
  qualityScore: number;
  modules: number;
  userName: string;
  mdFileName: string;
  businessType: string | null;
}

const MAIN_TABS = ["业务知识", "历史用例"];
const HISTORY_SUB_TABS = ["平台生成", "手动上传"];

export function KnowledgeBase() {
  const [mainTab, setMainTab] = useState(0);
  const [historySubTab, setHistorySubTab] = useState(0);
  const [search, setSearch] = useState("");
  const [businessTypeFilter, setBusinessTypeFilter] = useState("");

  // 预览/编辑模态框（业务知识 & 手动上传历史）
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"knowledge" | "history">("knowledge");
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");

  // 平台生成文件预览（复用 FilePreviewModal）
  const [platformPreviewFile, setPlatformPreviewFile] = useState<string | null>(null);
  const [platformPreviewTaskId, setPlatformPreviewTaskId] = useState<string | null>(null);

  // 上传弹窗
  const [showUpload, setShowUpload] = useState(false);
  const [uploadContext, setUploadContext] = useState<"knowledge" | "history_uploaded">("knowledge");

  const queryClient = useQueryClient();

  // ---- Queries ----

  // 业务知识列表
  const { data: kbData, isLoading: kbLoading } = useQuery<{ items: KnowledgeItem[]; total: number }>({
    queryKey: ["knowledge", { type: "knowledge", businessType: businessTypeFilter, search }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("type", "knowledge");
      if (search) params.set("search", search);
      if (businessTypeFilter) params.set("businessType", businessTypeFilter);
      return fetch(`/api/knowledge?${params}`).then((r) => r.json());
    },
    enabled: mainTab === 0,
  });

  // 手动上传历史列表
  const { data: uploadedData, isLoading: uploadedLoading } = useQuery<{ items: KnowledgeItem[]; total: number }>({
    queryKey: ["knowledge", { type: "history_uploaded", businessType: businessTypeFilter, search }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("type", "history_uploaded");
      if (search) params.set("search", search);
      if (businessTypeFilter) params.set("businessType", businessTypeFilter);
      return fetch(`/api/knowledge?${params}`).then((r) => r.json());
    },
    enabled: mainTab === 1 && historySubTab === 1,
  });

  // 平台生成历史
  const { data: historyData, isLoading: historyLoading } = useQuery<{ items: HistoryItem[]; total: number }>({
    queryKey: ["knowledge-history", { businessType: businessTypeFilter, search }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (businessTypeFilter) {
        params.set("businessType", businessTypeFilter === "unclassified" ? "unclassified" : businessTypeFilter);
      }
      return fetch(`/api/knowledge/history?${params}`).then((r) => r.json());
    },
    enabled: mainTab === 1 && historySubTab === 0,
  });

  // ---- Mutations ----

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  const assignBusinessTypeMutation = useMutation({
    mutationFn: ({ taskId, businessType }: { taskId: string; businessType: string }) =>
      fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-history"] });
    },
  });

  const saveEditMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      fetch(`/api/knowledge/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setEditMode(false);
      setPreviewContent(editContent);
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  // ---- Preview helpers ----

  async function openKnowledgePreview(id: string, type: "knowledge" | "history") {
    setPreviewId(id);
    setPreviewType(type);
    setEditMode(false);
    setPreviewContent(null);
    try {
      // 先获取元数据
      const metaRes = await fetch(`/api/knowledge/${id}`);
      const meta = await metaRes.json();
      setPreviewTitle(meta.title || "");
      // 再获取文件内容
      const contentRes = await fetch(`/api/knowledge/${id}/download`);
      const text = await contentRes.text();
      setPreviewContent(text);
    } catch {
      setPreviewContent("加载失败");
    }
  }

  function closePreview() {
    setPreviewId(null);
    setPreviewContent(null);
    setEditMode(false);
    setEditContent("");
  }

  function enterEditMode() {
    if (previewContent !== null) {
      setEditContent(previewContent);
      setEditMode(true);
    }
  }

  // ---- Business type badge ----

  function BusinessTypeBadge({ type }: { type: string | null }) {
    if (!type) return <span className="text-xs text-muted-foreground">未分类</span>;
    return (
      <span className="text-xs bg-muted text-muted-foreground px-1.5 rounded">{type}</span>
    );
  }

  // ---- Filter labels ----

  const activeBusinessTypeFilter = businessTypeFilter;
  const filterOptionsForKnowledge = BUSINESS_TYPES;
  const filterOptionsForHistoryPlatform = [...BUSINESS_TYPES, "unclassified"];

  // ---- Render helpers ----

  function renderKnowledgeItem(item: KnowledgeItem) {
    return (
      <div key={item.id} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
            </span>
            <BusinessTypeBadge type={item.businessType} />
          </div>
        </div>
        <div className="text-center flex-shrink-0">
          <p className="text-lg font-bold text-cyan-500">{item.refCount}</p>
          <p className="text-xs text-muted-foreground">引用次数</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openKnowledgePreview(item.id, "knowledge")}
            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30"
          >
            预览
          </button>
          <button
            onClick={() => {
              // 下载：浏览器打开 download URL
              window.open(`/api/knowledge/${item.id}/download?download=1`, "_blank");
            }}
            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30 flex items-center gap-1"
          >
            <Download className="w-3 h-3" />下载
          </button>
          <button
            onClick={() => deleteMutation.mutate(item.id)}
            className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50"
          >
            删除
          </button>
        </div>
      </div>
    );
  }

  function renderPlatformHistoryItem(item: HistoryItem) {
    return (
      <div key={item.id} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.req}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span>{item.createdAt}</span>
            <span>{item.userName}</span>
            <span>{item.totalCases} 用例</span>
            <span>质量分 {item.qualityScore}</span>
            <span>{item.modules} 模块</span>
            <BusinessTypeBadge type={item.businessType} />
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => {
              setPlatformPreviewFile(item.mdFileName);
              setPlatformPreviewTaskId(item.id);
            }}
            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30"
          >
            预览
          </button>
          <button
            onClick={() => {
              window.open(`/api/tasks/${item.id}/download?file=${encodeURIComponent(item.mdFileName)}`, "_blank");
            }}
            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30 flex items-center gap-1"
          >
            <Download className="w-3 h-3" />下载
          </button>
          {/* 分配业务类型下拉 */}
          <div className="relative group">
            <button className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30 flex items-center gap-1">
              分配类型 <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg p-1 hidden group-hover:block z-10 min-w-[80px]">
              {BUSINESS_TYPES.map((bt) => (
                <button
                  key={bt}
                  onClick={() => assignBusinessTypeMutation.mutate({ taskId: item.id, businessType: bt })}
                  className={`block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted ${
                    item.businessType === bt ? "text-primary font-medium" : ""
                  }`}
                >
                  {bt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Main render ----

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Main Tab bar */}
      <div className="bg-card rounded-xl shadow-sm p-1 flex gap-1 mb-4 w-fit">
        {MAIN_TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => { setMainTab(i); setBusinessTypeFilter(""); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mainTab === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Left sidebar — filters */}
        <div className="w-48 flex-shrink-0 space-y-3">
          <div className="bg-card rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">搜索</p>
            <input
              type="text"
              placeholder="关键词..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Business type filter */}
          {mainTab === 0 && (
            <BusinessTypeFilter
              options={["全部", ...filterOptionsForKnowledge]}
              selected={activeBusinessTypeFilter}
              onChange={(v) => setBusinessTypeFilter(v === "全部" ? "" : v)}
              showUnclassified={false}
            />
          )}
          {mainTab === 1 && historySubTab === 0 && (
            <BusinessTypeFilter
              options={["全部", ...filterOptionsForHistoryPlatform]}
              selected={activeBusinessTypeFilter}
              onChange={(v) => setBusinessTypeFilter(v === "全部" ? "" : v)}
              showUnclassified={true}
            />
          )}
          {mainTab === 1 && historySubTab === 1 && (
            <BusinessTypeFilter
              options={["全部", ...filterOptionsForKnowledge]}
              selected={activeBusinessTypeFilter}
              onChange={(v) => setBusinessTypeFilter(v === "全部" ? "" : v)}
              showUnclassified={false}
            />
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {/* 业务知识 Tab */}
          {mainTab === 0 && (
            <div>
              {kbLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <>
                  <div className="space-y-2">
                    {(kbData?.items || []).map(renderKnowledgeItem)}
                    {kbData?.items.length === 0 && (
                      <p className="text-center text-muted-foreground py-8 text-sm">暂无业务知识</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setUploadContext("knowledge"); setShowUpload(true); }}
                    className="mt-4 w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:border-cyan-500 hover:text-cyan-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />上传 md 文件
                  </button>
                </>
              )}
            </div>
          )}

          {/* 历史用例 Tab */}
          {mainTab === 1 && (
            <div>
              {/* Sub-tabs */}
              <div className="bg-card rounded-xl shadow-sm p-1 flex gap-1 mb-4 w-fit">
                {HISTORY_SUB_TABS.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { setHistorySubTab(i); setBusinessTypeFilter(""); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      historySubTab === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* 平台生成 */}
              {historySubTab === 0 && (
                <div>
                  {historyLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
                  ) : (
                    <div className="space-y-2">
                      {(historyData?.items || []).map(renderPlatformHistoryItem)}
                      {historyData?.items.length === 0 && (
                        <p className="text-center text-muted-foreground py-8 text-sm">暂无平台生成的用例</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 手动上传 */}
              {historySubTab === 1 && (
                <div>
                  {uploadedLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {(uploadedData?.items || []).map((item) => renderKnowledgeItem(item))}
                        {uploadedData?.items.length === 0 && (
                          <p className="text-center text-muted-foreground py-8 text-sm">暂无手动上传的用例</p>
                        )}
                      </div>
                      <button
                        onClick={() => { setUploadContext("history_uploaded"); setShowUpload(true); }}
                        className="mt-4 w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:border-cyan-500 hover:text-cyan-500 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />上传 md 文件
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview/Edit Modal (knowledge & history_uploaded) */}
      {previewId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closePreview(); }}
        >
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-sm truncate pr-4">{previewTitle}</h3>
              <div className="flex items-center gap-2">
                {!editMode && (
                  <button onClick={enterEditMode} className="text-xs border border-border px-2.5 py-1 rounded-lg hover:bg-muted">
                    编辑
                  </button>
                )}
                <button onClick={closePreview} className="p-1 rounded-lg hover:bg-muted">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {editMode ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full min-h-[300px] border border-border rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              ) : (
                previewContent !== null ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{previewContent}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-3 border-t">
              {editMode ? (
                <>
                  <button onClick={() => setEditMode(false)} className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60">
                    取消
                  </button>
                  <button
                    onClick={() => saveEditMutation.mutate({ id: previewId, content: editContent })}
                    disabled={saveEditMutation.isPending}
                    className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-40"
                  >
                    {saveEditMutation.isPending ? "保存中..." : "保存"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={closePreview} className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60">
                    关闭
                  </button>
                  <button
                    onClick={() => window.open(`/api/knowledge/${previewId}/download?download=1`, "_blank")}
                    className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:bg-muted flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />下载
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Platform-generated file preview (reuses existing FilePreviewModal) */}
      <FilePreviewModal
        open={platformPreviewFile !== null && platformPreviewTaskId !== null}
        onClose={() => { setPlatformPreviewFile(null); setPlatformPreviewTaskId(null); }}
        fileName={platformPreviewFile || ""}
        taskId={platformPreviewTaskId}
      />

      {/* Upload modal (shared between knowledge & history_uploaded) */}
      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        context={uploadContext}
      />
    </div>
  );
}

// ---- BusinessTypeFilter 子组件 ----

function BusinessTypeFilter({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string;
  onChange: (value: string) => void;
  showUnclassified: boolean;
}) {
  return (
    <div className="bg-card rounded-xl shadow-sm p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">业务类型</p>
      <div className="space-y-1">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="businessType"
              checked={selected === opt || (opt === "全部" && selected === "")}
              onChange={() => onChange(opt)}
              className="accent-cyan-500 w-3 h-3"
            />
            <span className="text-xs">{opt === "unclassified" ? "未分类" : opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 更新测试文件**

修改 `components/usecase-gen/__tests__/knowledge-base.test.tsx`：

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KnowledgeBase } from "../knowledge-base";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("KnowledgeBase", () => {
  it("renders main tabs (业务知识, 历史用例)", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByText("业务知识")).toBeDefined();
    expect(screen.getByText("历史用例")).toBeDefined();
  });

  it("renders search input", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByPlaceholderText("关键词...")).toBeDefined();
  });

  it("renders business type filter instead of old tag filter", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByText("业务类型")).toBeDefined();
    // Old tag filter label should not exist
    expect(screen.queryByText("标签筛选")).toBeNull();
  });

  it("shows upload button on 业务知识 tab", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByText("上传 md 文件")).toBeDefined();
  });

  it("switches to history tab and shows sub-tabs", () => {
    renderWithClient(<KnowledgeBase />);
    fireEvent.click(screen.getByText("历史用例"));
    expect(screen.getByText("平台生成")).toBeDefined();
    expect(screen.getByText("手动上传")).toBeDefined();
  });

  it("shows 未分类 filter option when on 平台生成 sub-tab", () => {
    renderWithClient(<KnowledgeBase />);
    fireEvent.click(screen.getByText("历史用例"));
    // 默认处于平台生成子 Tab
    expect(screen.getByText("未分类")).toBeDefined();
  });

  it("does not show 未分类 filter when on 手动上传 sub-tab", () => {
    renderWithClient(<KnowledgeBase />);
    fireEvent.click(screen.getByText("历史用例"));
    fireEvent.click(screen.getByText("手动上传"));
    expect(screen.queryByText("未分类")).toBeNull();
  });

  it("renders without crashing", () => {
    renderWithClient(<KnowledgeBase />);
    expect(document.body).toBeDefined();
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run components/usecase-gen/__tests__/knowledge-base.test.tsx
```

Expected: 所有测试 PASS。

- [ ] **Step 4: 构建验证**

```bash
npx next build 2>&1 | tail -5
```

Expected: 成功。

- [ ] **Step 5: 提交**

```bash
git add components/usecase-gen/knowledge-base.tsx components/usecase-gen/__tests__/knowledge-base.test.tsx
git commit -m "feat: rewrite knowledge-base — businessType filter, upload/download/edit, history split"
```

---

### Task 10: 端到端验证

- [ ] **Step 1: 运行全部测试**

```bash
npx vitest run
```

Expected: 所有已有测试继续通过，新测试也通过。

- [ ] **Step 2: 运行全量构建**

```bash
npx next build
```

Expected: 无类型错误、无 lint 错误。

- [ ] **Step 3: 手动验证清单**

启动 dev server `npm run dev` 后验证：

| 操作 | 预期 |
|------|------|
| 业务知识 Tab | 显示业务类型筛选（C1C/C1B/C2C/C2B/数科/车小妹），无旧标签筛选 |
| 上传 md 文件 (业务知识) | 弹窗 businessType 可选，上传成功后列表刷新 |
| 预览业务知识 | Markdown 渲染正常，点击编辑可切换 textarea 修改 |
| 编辑保存 | 调用 PUT 写回，切回预览模式显示更新后内容 |
| 下载业务知识 | 浏览器下载 .md 文件 |
| 删除业务知识 | 确认后删除，列表刷新 |
| 历史用例 → 平台生成 | 显示任务列表，含业务类型列，筛选项含"未分类" |
| 分配业务类型 | hover 下拉选择，调 PATCH 后刷新 |
| 平台生成预览/下载 | 复用已有功能正常 |
| 历史用例 → 手动上传 | 显示手动上传列表，筛选项无"未分类" |
| 上传 md 文件 (手动上传) | 弹窗 businessType 必选（红色*），不选无法提交 |
| 手动上传预览/编辑/下载/删除 | 和业务知识行为一致 |

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, build clean

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

*计划版本 v1.0 · 2026-06-02*
