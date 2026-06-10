# Wizard 优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化用例生成向导的右侧执行面板、工作区布局、文件预览（Modal 弹窗）、质量评分和耗时显示。

**Architecture:** 渐进式修改现有组件 + 新增 FilePreviewModal 组件和 xmind-preview API。不重构现有架构，聚焦收敛性改动（删 > 改 > 增）。

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, react-markdown, adm-zip, Vitest + Testing Library

---

## 文件结构

```
components/usecase-gen/shared/
├── file-preview.tsx          ← 新增：Modal 预览容器
├── output-files.tsx           ← 修改：文件可点击 → 弹 Modal
├── execution-panel.tsx        ← 修改：宽度/进度/快捷操作
├── ai-tweak-panel.tsx         ← 不动
├── rating-panel.tsx            ← 不动（generate-wizard 不再引用）
├── module-overview-table.tsx  ← 修改：默认展开
app/api/tasks/[id]/
├── xmind-preview/route.ts     ← 新增：XMind ZIP 解析 API
components/usecase-gen/
├── generate-wizard.tsx        ← 修改：布局/耗时/按钮迁移
```

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 react-markdown**

```bash
cd d:/qorder_workspace/Cobalt && npm install react-markdown
```

- [ ] **Step 2: 验证安装**

```bash
node -e "require('react-markdown'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-markdown dependency for file preview"
```

---

### Task 2: XMind 预览 API

**Files:**
- Create: `app/api/tasks/[id]/xmind-preview/route.ts`

- [ ] **Step 1: 创建 API 路由文件**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getOutputPath, validatePath } from "@/lib/sandbox";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs/promises";

interface XMindTopic {
  title: string;
  children: XMindTopic[];
}

interface XMindSheet {
  title: string;
  rootTopic: XMindTopic;
}

/**
 * Find matching closing tag for a given XML tag name.
 * Handles nested tags of the same name via depth counting.
 */
function findMatchingClose(xml: string, startPos: number, tagName: string): number {
  const openMarker = `<${tagName}`;
  const closeMarker = `</${tagName}>`;
  let depth = 1;
  // Skip past the opening tag's >
  let pos = xml.indexOf(">", startPos) + 1;

  while (pos < xml.length && depth > 0) {
    const nextOpen = xml.indexOf(openMarker, pos);
    const nextClose = xml.indexOf(closeMarker, pos);

    if (nextClose === -1) return -1;

    // Only count <topic (with space/attribute) as nested open, not <topics>
    const isNestedOpen = nextOpen !== -1 && nextOpen < nextClose
      && xml.charAt(nextOpen + openMarker.length) !== "s"; // exclude <topics>

    if (isNestedOpen) {
      depth++;
      pos = nextOpen + openMarker.length;
    } else {
      depth--;
      if (depth === 0) return nextClose + closeMarker.length;
      pos = nextClose + closeMarker.length;
    }
  }

  return -1;
}

/**
 * Parse <topic> elements at the current XML level.
 * Returns array of topics and advances pos past the parsed content.
 */
function parseTopicsAtLevel(xml: string): XMindTopic[] {
  const topics: XMindTopic[] = [];
  let pos = 0;

  while (pos < xml.length) {
    const topicStart = xml.indexOf("<topic ", pos);
    if (topicStart === -1) break;

    // Check if any closing tag (</topics> or </children>) comes first
    const nextEnd = xml.indexOf("</", pos);
    if (nextEnd !== -1 && nextEnd < topicStart) break;

    const result = parseOneTopic(xml, topicStart);
    if (!result) break;

    topics.push(result.topic);
    pos = result.endPos;
  }

  return topics;
}

/**
 * Parse a single <topic> element starting at topicStart.
 * Returns the parsed topic and the position after its closing </topic>.
 */
function parseOneTopic(xml: string, topicStart: number): { topic: XMindTopic; endPos: number } | null {
  // Extract <title>...</title>
  const titleMatch = xml.slice(topicStart).match(/<title>([^<]*)<\/title>/);
  if (!titleMatch || titleMatch.index === undefined) return null;

  const title = titleMatch[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, "");

  // Find the matching </topic> close
  const topicEnd = findMatchingClose(xml, topicStart, "topic");
  if (topicEnd === -1) return null;

  let children: XMindTopic[] = [];

  // Look for <children> block within this topic
  const innerXml = xml.slice(topicStart, topicEnd);
  const childrenStart = innerXml.indexOf("<children>");

  if (childrenStart !== -1) {
    const childrenClose = innerXml.indexOf("</children>", childrenStart);
    if (childrenClose !== -1) {
      const childrenXml = innerXml.slice(childrenStart + 10, childrenClose);
      // Skip past <topics ...> wrapper if present
      const topicsStart = childrenXml.indexOf("<topics");
      if (topicsStart !== -1) {
        const topicsContentStart = childrenXml.indexOf(">", topicsStart) + 1;
        children = parseTopicsAtLevel(childrenXml.slice(topicsContentStart));
      }
    }
  }

  return { topic: { title, children }, endPos: topicEnd };
}

/**
 * Extract sheet info from XMind content.xml
 */
function extractSheets(xmlContent: string): XMindSheet[] {
  const sheets: XMindSheet[] = [];

  // Try sheet-based parsing first
  const sheetRegex = /<sheet\s+id="[^"]*">\s*<title>([^<]*)<\/title>([\s\S]*?)<\/sheet>/g;
  let match: RegExpExecArray | null;

  while ((match = sheetRegex.exec(xmlContent)) !== null) {
    const sheetTitle = match[1];
    const sheetXml = match[2];

    // Find root topic
    const rootTopicStart = sheetXml.indexOf("<topic ");
    if (rootTopicStart === -1) continue;

    const result = parseOneTopic(sheetXml, rootTopicStart);
    if (!result) continue;

    sheets.push({
      title: sheetTitle,
      rootTopic: result.topic,
    });
  }

  // Fallback: no sheet structure found, treat whole file as one sheet
  if (sheets.length === 0) {
    const rootTopicStart = xmlContent.indexOf("<topic ");
    if (rootTopicStart !== -1) {
      const result = parseOneTopic(xmlContent, rootTopicStart);
      if (result) {
        sheets.push({
          title: "Sheet 1",
          rootTopic: result.topic,
        });
      }
    }
  }

  return sheets;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const taskId = params.id;
    const fileParam = req.nextUrl.searchParams.get("file");

    if (!fileParam) {
      return NextResponse.json({ error: "Missing file parameter" }, { status: 400 });
    }

    const outputDir = getOutputPath(taskId);
    const filePath = path.resolve(outputDir, fileParam);

    if (!validatePath(filePath, taskId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const buffer = await fs.readFile(filePath);
    const zip = new AdmZip(buffer);
    const contentEntry = zip.getEntry("content.xml");

    if (!contentEntry) {
      return NextResponse.json({ error: "Invalid XMind file: content.xml not found" }, { status: 400 });
    }

    const xmlContent = contentEntry.getData().toString("utf-8");
    const sheets = extractSheets(xmlContent);

    return NextResponse.json({ sheets });
  } catch (error) {
    console.error("XMind preview error:", error);
    return NextResponse.json({ error: "Failed to parse XMind file" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/tasks/[id]/xmind-preview/route.ts
git commit -m "feat: add XMind preview API — ZIP parse content.xml to JSON tree"
```

---

### Task 3: FilePreviewModal 组件

**Files:**
- Create: `components/usecase-gen/shared/file-preview.tsx`

- [ ] **Step 1: 创建组件文件**

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { X, Loader2, AlertCircle, ChevronRight, ChevronDown } from "lucide-react";

interface XMindTopic {
  title: string;
  children: XMindTopic[];
}

interface XMindSheet {
  title: string;
  rootTopic: XMindTopic;
}

interface FilePreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  taskId: string | null;
}

function XMindTreeNode({ topic, depth = 0 }: { topic: XMindTopic; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (topic.children.length === 0) {
    return (
      <div
        className="flex items-center py-0.5 text-sm text-muted-foreground"
        style={{ paddingLeft: `${depth * 20 + 24}px` }}
      >
        {topic.title}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 py-0.5 text-sm font-medium hover:text-foreground transition-colors w-full text-left"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        )}
        <span className="truncate">{topic.title}</span>
      </button>
      {expanded && (
        <div>
          {topic.children.map((child, i) => (
            <XMindTreeNode key={i} topic={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FilePreviewModal({ open, onClose, fileName, taskId }: FilePreviewModalProps) {
  const [mdContent, setMdContent] = useState<string | null>(null);
  const [xmindData, setXmindData] = useState<XMindSheet[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMd = fileName.endsWith(".md");
  const isXmind = fileName.endsWith(".xmind");

  const fetchContent = useCallback(async () => {
    if (!taskId || !open) return;

    setLoading(true);
    setError(null);
    setMdContent(null);
    setXmindData(null);

    try {
      if (isXmind) {
        const res = await fetch(
          `/api/tasks/${taskId}/xmind-preview?file=${encodeURIComponent(fileName)}`
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error || "解析失败");
        }
        const data = await res.json();
        setXmindData(data.sheets as XMindSheet[]);
      } else {
        // MD file — use download API to get raw text
        const res = await fetch(
          `/api/tasks/${taskId}/download?file=${encodeURIComponent(fileName)}`
        );
        if (!res.ok) throw new Error("文件加载失败");
        const text = await res.text();
        setMdContent(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [taskId, open, fileName, isXmind]);

  useEffect(() => {
    if (open) fetchContent();
  }, [open, fetchContent]);

  // Esc key close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-sm truncate pr-4">{fileName}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center gap-2 py-16 text-red-500">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {!loading && !error && isMd && mdContent !== null && (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{mdContent}</ReactMarkdown>
            </div>
          )}

          {!loading && !error && isXmind && xmindData && (
            <div className="space-y-4">
              {xmindData.map((sheet, i) => (
                <div key={i}>
                  <h4 className="font-semibold text-sm mb-2 text-muted-foreground">
                    {sheet.title}
                  </h4>
                  <div className="border rounded-xl p-3">
                    <XMindTreeNode topic={sheet.rootTopic} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/60 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/file-preview.tsx
git commit -m "feat: add FilePreviewModal — MD rendering + XMind tree, Esc/mask close"
```

---

### Task 4: OutputFiles 集成预览入口

**Files:**
- Modify: `components/usecase-gen/shared/output-files.tsx`

- [ ] **Step 1: 添加预览状态和 Modal，文件名可点击**

Replace the current file with:

```typescript
"use client";

import { useState } from "react";
import { FileText, Download, Loader2, Eye } from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";
import { FilePreviewModal } from "./file-preview";

interface OutputFilesProps {
  taskId: string | null;
  files: FileInfo[];
}

function isDisplayable(name: string): boolean {
  if (name.includes("_source")) return false;
  if (name.includes("archive/")) return false;
  return name.endsWith(".md") || name.endsWith(".xmind");
}

function isPreviewable(name: string): boolean {
  return name.endsWith(".md") || name.endsWith(".xmind");
}

function downloadFile(taskId: string, file: FileInfo) {
  const url = `/api/tasks/${taskId}/download?file=${encodeURIComponent(file.relativePath)}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function OutputFiles({ taskId, files }: OutputFilesProps) {
  const displayable = files.filter((f) => isDisplayable(f.name));
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);

  return (
    <>
      <div className="bg-card rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          输出文件
        </h3>
        {displayable.length === 0 ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            生成中...
          </p>
        ) : (
          <div className="space-y-1.5">
            {displayable.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 text-sm"
              >
                <button
                  onClick={() => {
                    if (isPreviewable(f.name) && taskId) {
                      setSelectedFile(f);
                    }
                  }}
                  disabled={!isPreviewable(f.name) || !taskId}
                  className="flex items-center gap-2 min-w-0 text-left hover:text-primary transition-colors disabled:cursor-default"
                  title={isPreviewable(f.name) ? "点击预览" : undefined}
                >
                  <Eye className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
                <button
                  onClick={() => {
                    if (!taskId) return;
                    downloadFile(taskId, f);
                  }}
                  disabled={!taskId}
                  className="text-primary hover:text-primary/70 disabled:opacity-40 flex-shrink-0 ml-2"
                  title="下载"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <FilePreviewModal
        open={selectedFile !== null}
        onClose={() => setSelectedFile(null)}
        fileName={selectedFile?.relativePath || ""}
        taskId={taskId}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/output-files.tsx
git commit -m "feat: add preview entry to OutputFiles — click filename opens FilePreviewModal"
```

---

### Task 5: ExecutionPanel 优化（宽度 + 进度 + 快捷操作）

**Files:**
- Modify: `components/usecase-gen/shared/execution-panel.tsx`

- [ ] **Step 1: 更新 deriveNodeStates 加入层叠逻辑**

Replace the current `deriveNodeStates` function:

```typescript
function deriveNodeStates(
  foundFiles: FileInfo[],
  generating: boolean,
  logStages?: Set<string>
): { name: string; state: "wait" | "running" | "done" }[] {
  const hasSourceMd = foundFiles.some((f) => f.name.includes("_source"));
  const hasTestcaseMd = foundFiles.some(
    (f) => f.name.includes("测试用例") && f.name.endsWith(".md")
  );
  const hasXmind = foundFiles.some((f) => f.name.endsWith(".xmind"));

  // Step 1: independent state per node
  const nodes = WORKFLOW_NODES.map((node, i) => {
    let state: "wait" | "running" | "done";
    switch (i) {
      case 0:
        state = logStages?.has(node.name) || hasSourceMd ? "done" : generating ? "running" : "wait";
        break;
      case 1:
        state = logStages?.has(node.name) || hasTestcaseMd ? "done" : hasSourceMd ? "running" : "wait";
        break;
      case 2:
        state = logStages?.has(node.name) || hasTestcaseMd ? "done" : hasSourceMd ? "running" : "wait";
        break;
      case 3:
        state = logStages?.has(node.name) || hasTestcaseMd ? "done" : "wait";
        break;
      case 4:
        state = logStages?.has(node.name) || hasXmind ? "done" : hasTestcaseMd ? "running" : "wait";
        break;
      default:
        state = "wait";
    }
    return { name: node.name, state };
  });

  // Step 2: cascade — find rightmost done/running, force all left nodes to done
  let rightmostActive = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].state === "done" || nodes[i].state === "running") {
      rightmostActive = i;
      break;
    }
  }
  if (rightmostActive >= 0) {
    for (let i = 0; i < rightmostActive; i++) {
      nodes[i].state = "done";
    }
  }

  return nodes;
}
```

- [ ] **Step 2: 更新 Props 接口删除两个回调**

Replace the interface:

```typescript
interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  wizStep: number;
  hasResult: boolean;
  isTweak?: boolean;
  configSummary: {
    source: string;
    fewShot: string;
  };
  foundFiles: FileInfo[];
  logStages?: Set<string>;
  onDownloadFile: (file: FileInfo) => void;
  onScrollToAITweak: () => void;
  onNavigateToEditor: () => void;
}
```

- [ ] **Step 3: 宽度从 w-48 改为 w-56 + nowrap**

Replace all `w-48` with `w-56` in all three modes (3 occurrences), and add `whitespace-nowrap` to config preview value:

```typescript
// Mode 1: Config Preview — line 99
<div className="w-56 flex-shrink-0">

// Value span — change line 115 to add whitespace-nowrap:
<span className="font-medium max-w-[120px] truncate whitespace-nowrap">

// Mode 2: Progress Dots — line 129
<div className="w-56 flex-shrink-0">

// Mode 3: Quick Actions — line 178
<div className="w-56 flex-shrink-0">

// Fallback — line 237
<div className="w-56 flex-shrink-0" />
```

- [ ] **Step 4: 删除 Mode 3 中评价和重新配置按钮，改用最新版本文件**

Replace Mode 3 (Quick Actions) with:

```typescript
  // Mode 3: Quick Actions (wizStep === 2 && !generating)
  if (wizStep === 2 && !generating && (foundFiles.length > 0 || hasResult)) {
    // Find latest-version files
    const mdFiles = foundFiles
      .filter((f) => f.name.includes("测试用例") && f.name.endsWith(".md"))
      .sort((a, b) => {
        const va = parseInt(a.name.match(/_v(\d+)\.md$/)?.[1] || "0", 10);
        const vb = parseInt(b.name.match(/_v(\d+)\.md$/)?.[1] || "0", 10);
        return vb - va;
      });
    const xmindFiles = foundFiles
      .filter((f) => f.name.endsWith(".xmind"))
      .sort((a, b) => {
        const va = parseInt(a.name.match(/_v(\d+)\.xmind$/)?.[1] || "0", 10);
        const vb = parseInt(b.name.match(/_v(\d+)\.xmind$/)?.[1] || "0", 10);
        return vb - va;
      });
    const mdFile = mdFiles[0] || null;
    const xmindFile = xmindFiles[0] || null;

    return (
      <div className="w-56 flex-shrink-0">
        <div className="bg-card rounded-xl shadow-sm p-4 sticky top-20">
          <h4 className="font-semibold text-sm text-foreground mb-3">
            快捷操作
          </h4>
          <div className="space-y-2">
            {mdFile && (
              <button
                onClick={() => onDownloadFile(mdFile)}
                className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-primary" />
                下载 Markdown
              </button>
            )}
            {xmindFile && (
              <button
                onClick={() => onDownloadFile(xmindFile)}
                className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-primary" />
                下载 XMind
              </button>
            )}
            <button
              onClick={onScrollToAITweak}
              className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              AI 微调
            </button>
            <button
              onClick={onNavigateToEditor}
              className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-primary" />
              去编辑用例
            </button>
          </div>
        </div>
      </div>
    );
  }
```

- [ ] **Step 5: 删除未使用的 import**

Remove `Star` and `RefreshCw` from the lucide-react import (line 3 of current file):

```typescript
import { CheckCircle2, Download, MessageSquare, Edit3 } from "lucide-react";
```

- [ ] **Step 6: Commit**

```bash
git add components/usecase-gen/shared/execution-panel.tsx
git commit -m "feat: optimize ExecutionPanel — cascade progress, w-56, latest-version download, remove rating/reconfigure"
```

---

### Task 6: GenerateWizard 布局调整

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`

- [ ] **Step 1: 删除 RatingPanel import**

Remove line 10:
```
import { RatingPanel } from "./shared/rating-panel";
```

Also remove `Edit3` from lucide-react if no longer used elsewhere. Check: `Edit3` is used for the "去编辑用例" button which is being moved. Keep the import — it's still needed at the new location.

Actually, `ArrowRight` is imported for the button too. Keep it.

- [ ] **Step 2: 修复 duration 字段**

In `onResult` callback (line 89-94), change:

```typescript
setGenStats({
  totalCases: summary?.totalCases || 0,
  qualityScore: summary?.qualityScore || 0,
  modules: summary?.modules || 0,
  duration: 0,
});
```

To:

```typescript
setGenStats({
  totalCases: summary?.totalCases || 0,
  qualityScore: summary?.qualityScore || 0,
  modules: summary?.modules || 0,
  duration: data.duration || 0,
});
```

- [ ] **Step 3: 删除 RatingPanel 渲染**

Remove lines 556-557:
```typescript
{/* Rating */}
<RatingPanel taskId={taskId} />
```

- [ ] **Step 4: 重组 Step 2 结果区布局**

In the `{usecaseTree && usecaseTree.length > 0 && genStatus !== "生成失败" && (` block, rearrange components:

```typescript
{/* Result display */}
{usecaseTree && usecaseTree.length > 0 && genStatus !== "生成失败" && (
  <>
    {/* KPI Cards */}
    <div className="grid grid-cols-4 gap-4">
      {/* ... existing KPI cards unchanged ... */}
    </div>

    {/* Output files */}
    <OutputFiles
      taskId={taskId}
      files={(() => {
        const seen = new Set<string>();
        return [...scanner.foundFiles, ...loadedFiles].filter((f) => {
          if (seen.has(f.relativePath)) return false;
          seen.add(f.relativePath);
          return true;
        });
      })()}
    />

    {/* Go to editor button — moved from bottom to here */}
    <div className="flex justify-end">
      <button
        onClick={() => onNavigateToTab?.(2)}
        className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm flex items-center gap-2 transition-all hover:bg-primary/90"
      >
        <Edit3 className="w-4 h-4" />
        去编辑用例
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>

    {/* AI Tweak */}
    <AITweakPanel
      taskId={taskId}
      generating={generating && !!usecaseTree && usecaseTree.length > 0}
      modules={usecaseTree.map((m) => m.name)}
      tweakHistory={tweakHistory}
      onTweakStarted={() => {
        const baseline = maxXmindVersion([...scanner.foundFiles, ...loadedFiles]);
        setXmindBaseline(baseline);
        preTweakTreeRef.current = usecaseTree;
        setLoadedFiles([]);
        setGenerating(true);
        setGenStatus("正在微调用例...");
      }}
      onCancelTweak={() => {
        cancelTask.mutate(taskId!);
        scanner.stop();
        setGenerating(false);
        setGenStatus("");
      }}
      onRecordTweak={(entry) => {
        setTweakHistory((prev) => [...prev, entry]);
      }}
      onTweakHistoryUpdate={(history) => {
        setTweakHistory(history);
      }}
    />

    {/* Module table */}
    <ModuleOverviewTable
      modules={usecaseTree}
      totalCases={usecaseTree.reduce((s, m) => s + m.cases.length, 0)}
    />
  </>
)}
```

- [ ] **Step 5: 删除底部按钮区**

Remove the entire bottom `<div className="flex justify-between">` block (lines 565-586):

```typescript
{/* Remove this entire block:
<div className="flex justify-between">
  <button onClick={() => { setWizStep(0); ... }}>重新配置</button>
  <button onClick={() => onNavigateToTab?.(2)}>去编辑用例</button>
</div>
*/}
```

- [ ] **Step 6: 清理 ExecutionPanel 的 props**

In the ExecutionPanel JSX (lines 609-656), remove the two deleted callbacks from `onScrollToRating` and `onReconfigure`:

Remove these lines:
```typescript
onScrollToRating={() => {
  document.querySelector("[data-rating]")?.scrollIntoView({ behavior: "smooth" });
}}
onReconfigure={() => {
  setWizStep(0);
  setGenerating(false);
  setGenStatus("");
}}
```

- [ ] **Step 7: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat: reorganize wizard layout — remove RatingPanel, move editor button, fix duration, expand module table"
```

---

### Task 7: ModuleOverviewTable 默认展开

**Files:**
- Modify: `components/usecase-gen/shared/module-overview-table.tsx`

- [ ] **Step 1: 改 useState 默认值**

Line 13, change:
```typescript
const [expanded, setExpanded] = useState(false);
```

To:
```typescript
const [expanded, setExpanded] = useState(true);
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/module-overview-table.tsx
git commit -m "feat: expand module overview table by default"
```

---

### Task 8: 更新测试

**Files:**
- Modify: `components/usecase-gen/shared/__tests__/execution-panel.test.tsx`

- [ ] **Step 1: 删除已移除的 props 引用**

Remove all occurrences of `onScrollToRating` and `onReconfigure` from test file:

In every `render(<ExecutionPanel ... />)` call, remove:
```
onScrollToRating={noop}
onReconfigure={noop}
```

- [ ] **Step 2: 更新 Mode 3 测试 — 删除评价和重新配置的断言**

In the "renders quick action buttons when files exist" test (line 81-98), remove these two assertions:
```typescript
// Remove:
expect(screen.getByText("评价")).toBeDefined();
expect(screen.getByText("重新配置")).toBeDefined();
```

In the "calls onReconfigure when clicked" test (line 115-128): **delete the entire test** since `onReconfigure` no longer exists.

Updated test for Mode 3 should be:

```typescript
it("renders quick action buttons when files exist", () => {
  render(
    <ExecutionPanel
      taskId="test-id" generating={false} wizStep={2} hasResult={true}
      configSummary={defaultConfig} foundFiles={foundFiles}
      onDownloadFile={noop} onScrollToAITweak={noop}
      onNavigateToEditor={noop}
    />
  );
  expect(screen.getByText("快捷操作")).toBeDefined();
  expect(screen.getByText("下载 Markdown")).toBeDefined();
  expect(screen.getByText("下载 XMind")).toBeDefined();
  expect(screen.getByText("AI 微调")).toBeDefined();
  expect(screen.getByText("去编辑用例")).toBeDefined();
});
```

- [ ] **Step 3: 添加进度层叠测试**

Add a new test in the Mode 2 describe block:

```typescript
it("cascades done status — later done nodes force earlier wait nodes to done", () => {
  // Only xmind exists (export done), but _source.md not yet created
  // Expect: 文档解析 → done, 需求分析 → done, 用例生成 → done, 质量校验 → done, 导出格式 → done
  render(
    <ExecutionPanel
      taskId="test-id" generating={true} wizStep={2} hasResult={false}
      configSummary={defaultConfig}
      foundFiles={[{ name: "测试用例.xmind", relativePath: "测试用例.xmind" }]}
      onDownloadFile={noop} onScrollToAITweak={noop}
      onNavigateToEditor={noop}
    />
  );
  const docParse = screen.getByText("文档解析");
  const requirement = screen.getByText("需求分析");
  const caseGen = screen.getByText("用例生成");
  expect(docParse.className).toContain("text-green-700");
  expect(requirement.className).toContain("text-green-700");
  expect(caseGen.className).toContain("text-green-700");
});
```

- [ ] **Step 4: 运行测试验证**

```bash
cd d:/qorder_workspace/Cobalt && npx vitest run components/usecase-gen/shared/__tests__/execution-panel.test.tsx
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/shared/__tests__/execution-panel.test.tsx
git commit -m "test: update ExecutionPanel tests — remove rating/reconfigure, add cascade progress test"
```

---

### Task 9: 集成验证

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd d:/qorder_workspace/Cobalt && npx tsc --noEmit
```
Expected: no errors related to our changes

- [ ] **Step 2: 运行全部测试**

```bash
cd d:/qorder_workspace/Cobalt && npx vitest run
```
Expected: all tests PASS

- [ ] **Step 3: 启动 dev server 验证**

```bash
cd d:/qorder_workspace/Cobalt && npm run dev
```

Manual checks:
1. 打开 `/usecase-gen?tab=generate`，确认右侧面板宽度正常，无折行
2. Step 0 → Step 1，确认配置预览显示正确
3. 生成完成后，确认右侧快捷操作只有 4 个按钮（下载 MD、下载 XMind、AI 微调、去编辑用例）
4. 工作区无评价面板，模块表默认展开
5. 「去编辑用例」按钮在输出文件和 AI 微调之间
6. 点击 MD 文件 → Modal 弹窗预览 → Esc/遮罩关闭
7. 点击 XMind 文件 → Modal 弹窗树形预览 → Esc/遮罩关闭
8. 下载按钮下载的是最新版本文件
9. KPI 卡片耗时显示实际数值

- [ ] **Step 4: Final commit if any fixes**

---

## 改动文件汇总

| # | 文件 | 类型 |
|---|------|------|
| 1 | `package.json` | 修改 (依赖) |
| 2 | `app/api/tasks/[id]/xmind-preview/route.ts` | 新增 |
| 3 | `components/usecase-gen/shared/file-preview.tsx` | 新增 |
| 4 | `components/usecase-gen/shared/output-files.tsx` | 修改 |
| 5 | `components/usecase-gen/shared/execution-panel.tsx` | 修改 |
| 6 | `components/usecase-gen/generate-wizard.tsx` | 修改 |
| 7 | `components/usecase-gen/shared/module-overview-table.tsx` | 修改 |
| 8 | `components/usecase-gen/shared/__tests__/execution-panel.test.tsx` | 修改 |
