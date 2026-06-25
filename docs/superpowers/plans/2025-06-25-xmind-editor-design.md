# XMind Editor: Replace MD with XMind round-trip

## Context

MD → brain map → MD round-trip loses format (header levels, indentation, metadata, separators).
XMind is a structured tree format that preserves exact structure across edit cycles.
Refactor CaseEditor to work exclusively with XMind files.

## Changes

### 1. CaseEditor (`components/usecase-gen/case-editor.tsx`)

**Data loading**: Download `.xmind` binary → convert to base64 → `bridge.importXmindFile(base64)`
**Save**: `bridge.exportXmind()` → base64 → POST to `/api/tasks/{id}/save` with `{ filePath, xmindBase64 }`
**Remove imports**: `parseMarkdownToTree`, `treeToMindMapData` from parse-testcase-md and md-mindmap-convert
**Remove**: `loadedRef`, all MD parsing logic
**Props**: Keep `taskId`, `filePath`, `fileName`, `onSave`, `onExportToKnowledge`, `onBack`

### 2. Save API (`app/api/tasks/[id]/save/route.ts`)

Change to accept `{ filePath, xmindBase64 }`. Decode base64 → write binary to sandbox file.
Remove `parseTestcaseMarkdown` call (XMind save doesn't affect MD report).

### 3. OutputFiles (`components/usecase-gen/shared/output-files.tsx`)

`isPreviewable()`: change from `.md` to `.xmind`
Rename `onEditMarkdown` → `onEditXmind`

### 4. Remove sidebar editor entry (`components/sidebar.tsx`)

Remove the "用例编辑" menu item that links to `/usecase-gen?tab=editor`.

### 5. page.tsx (`app/usecase-gen/page.tsx`)

Update `onSave` callback: POST `{ filePath, xmindBase64 }` to save API.
Remove MD-related imports.

### 6. Bridge & mind-map.js

No changes needed. `importXmindFile(base64)` and `exportXmind()` already exist.

## Entry points

| Entry | Behavior |
|---|---|
| Wizard Step 3, `.xmind` edit button | Navigate with `taskId` + `.xmind` filePath → load XMind |
| Direct URL refresh with params | Same as above |
| Direct URL without params | Empty state ("请从任务结果页进入编辑") |
| Sidebar | No editor link |

## Verification

1. Run `npx vitest run` — all tests pass
2. Manual: Wizard Step 3 → click edit on .xmind file → brain map loads → edit → save → refresh → same content
3. Manual: Direct URL with taskId+filePath → same flow works
4. Manual: Sidebar has no editor link
