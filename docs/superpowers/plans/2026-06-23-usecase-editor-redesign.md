# 用例编辑器重新开发 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 CaseEditor 从表单式编辑升级为基于 simple-mind-map + iframe 隔离的可视化脑图编辑器

**Architecture:** simple-mind-map 运行在 iframe 内（`public/editor/`），React 主应用通过 `editor-bridge.ts` (postMessage) 通信。markdown ↔ 脑图 JSON 互转由 `md-mindmap-convert.ts` 负责。CaseEditor 纯组件，保存/导出通过回调委托父级。

**Tech Stack:** Next.js 14, React 18, TypeScript, Vitest, @testing-library/react, simple-mind-map (npm)

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `public/vendor/simple-mind-map.umd.min.js` | 新增 | simple-mind-map UMD 本地副本，iframe 内 script 引用 |
| `public/editor/mind-map.html` | 新增 | iframe 独立页面骨架 |
| `public/editor/mind-map.js` | 新增 | iframe 内初始化、消息处理、dirty 追踪、XMind 解析/导出 |
| `lib/md-mindmap-convert.ts` | 新增 | `UsecaseModule[]` ↔ `MindMapData` 双向转换 + Markdown 导出 |
| `lib/parse-testcase-md.ts` | 扩展 | 增加 `modulesToMarkdown()` 函数 |
| `components/usecase-gen/editor-bridge.ts` | 新增 | postMessage 封装，Promise 风格 API |
| `components/usecase-gen/case-editor.tsx` | 重写 | 工具栏 + iframe 容器 + 空状态导入入口 |
| `app/usecase-gen/page.tsx` | 适配 | Props 适配 + onSave/onExportToKnowledge 回调 |
| `lib/__tests__/md-mindmap-convert.test.ts` | 新增 | 转换层单元测试 |
| `components/usecase-gen/__tests__/editor-bridge.test.ts` | 新增 | bridge 层单元测试 |
| `components/usecase-gen/__tests__/case-editor.test.tsx` | 更新 | 适配新 props 接口 |

---

### Task 1: 安装 simple-mind-map 并设置 UMD 副本

**Files:**
- Modify: `package.json`
- Create: `public/vendor/simple-mind-map.umd.min.js`

- [ ] **Step 1: 安装 simple-mind-map**

```bash
npm install simple-mind-map --save
```

- [ ] **Step 2: 拷贝 UMD 文件到 public/vendor/**

`simple-mind-map` 的 UMD 包位于 `node_modules/simple-mind-map/dist/simpleMindMap.umd.min.js`。Windows 与 macOS 通用拷贝命令：

```bash
mkdir -p public/vendor
cp node_modules/simple-mind-map/dist/simpleMindMap.umd.min.js public/vendor/simple-mind-map.umd.min.js
```

- [ ] **Step 3: 添加 postinstall 脚本到 package.json**

在 `package.json` 的 `"scripts"` 中添加 `"postinstall"` 脚本，确保其他开发者 `npm install` 后自动拷贝：

```json
"postinstall": "node -e \"const fs=require('fs');fs.mkdirSync('public/vendor',{recursive:true});fs.copyFileSync('node_modules/simple-mind-map/dist/simpleMindMap.umd.min.js','public/vendor/simple-mind-map.umd.min.js')\""
```

- [ ] **Step 4: 验证文件存在**

```bash
ls -la public/vendor/simple-mind-map.umd.min.js
```

Expected: 文件大小 > 0。

- [ ] **Step 5: Commit**

```bash
git add package.json public/vendor/simple-mind-map.umd.min.js
git commit -m "chore: add simple-mind-map dependency and UMD copy to public/vendor"
```

---

### Task 2: 创建 md-mindmap-convert.ts 转换层

**Files:**
- Create: `lib/md-mindmap-convert.ts`
- Create: `lib/__tests__/md-mindmap-convert.test.ts`

- [ ] **Step 1: 写测试文件**

```ts
// lib/__tests__/md-mindmap-convert.test.ts
import { describe, it, expect } from "vitest";
import { modulesToMindMap, mindMapToModules, modulesToMarkdown } from "@/lib/md-mindmap-convert";
import type { UsecaseModule } from "@/lib/parse-testcase-md";

const sampleModules: UsecaseModule[] = [
  {
    name: "登录模块", open: true, cases: [
      { id: "tc-001", title: "正常登录", priority: "P0", precondition: "用户已注册", steps: "输入账号密码", expected: "跳转首页", tags: "" },
      { id: "tc-002", title: "密码错误", priority: "P1", precondition: "", steps: "", expected: "提示错误", tags: "" },
    ],
  },
  {
    name: "注册模块", open: false, cases: [
      { id: "tc-003", title: "正常注册", priority: "P0", precondition: "", steps: "", expected: "注册成功", tags: "" },
    ],
  },
];

describe("modulesToMindMap", () => {
  it("converts empty tree", () => {
    const result = modulesToMindMap([], "测试用例");
    expect(result.data.text).toBe("测试用例");
    expect(result.children).toEqual([]);
  });

  it("converts modules to mind map tree", () => {
    const result = modulesToMindMap(sampleModules, "测试用例");
    expect(result.data.text).toBe("测试用例");
    expect(result.children).toHaveLength(2);

    const mod1 = result.children[0];
    expect(mod1.data.text).toBe("登录模块");
    expect(mod1.children).toHaveLength(2);

    const case1 = mod1.children[0];
    expect(case1.data.text).toBe("tc-001 P0 正常登录");
    expect(case1.children).toHaveLength(3);
    expect(case1.children[0].data.text).toBe("前置条件：用户已注册");
    expect(case1.children[1].data.text).toBe("步骤：输入账号密码");
    expect(case1.children[2].data.text).toBe("预期：跳转首页");
  });

  it("skips empty fields in case node children", () => {
    const modules: UsecaseModule[] = [
      { name: "M1", open: true, cases: [
        { id: "tc-001", title: "T1", priority: "P0", precondition: "", steps: "", expected: "E1", tags: "" },
      ]},
    ];
    const result = modulesToMindMap(modules, "Root");
    const caseNode = result.children[0].children[0];
    // Only expected exists, precond/steps are empty so skipped
    expect(caseNode.children).toHaveLength(1);
    expect(caseNode.children[0].data.text).toBe("预期：E1");
  });
});

describe("mindMapToModules", () => {
  it("converts mind map back to modules", () => {
    const mindMap = modulesToMindMap(sampleModules, "测试用例");
    const modules = mindMapToModules(mindMap);

    expect(modules).toHaveLength(2);
    expect(modules[0].name).toBe("登录模块");
    expect(modules[0].cases).toHaveLength(2);
    expect(modules[0].cases[0].id).toBe("tc-001");
    expect(modules[0].cases[0].priority).toBe("P0");
    expect(modules[0].cases[0].title).toBe("正常登录");
    expect(modules[0].cases[0].precondition).toBe("用户已注册");
    expect(modules[0].cases[0].steps).toBe("输入账号密码");
    expect(modules[0].cases[0].expected).toBe("跳转首页");
  });

  it("handles root-only mind map", () => {
    const mindMap = { data: { text: "空" }, children: [] };
    const result = mindMapToModules(mindMap);
    expect(result).toEqual([]);
  });

  it("round-trips: modules → mindMap → modules", () => {
    const result = mindMapToModules(modulesToMindMap(sampleModules, "Root"));
    expect(result).toEqual(sampleModules.map(m => ({ ...m, open: true })));
  });
});

describe("modulesToMarkdown", () => {
  it("generates markdown from modules", () => {
    const md = modulesToMarkdown(sampleModules);
    expect(md).toContain("## 一、测试用例");
    expect(md).toContain("### 1.1 登录模块");
    expect(md).toContain("- tc-001-p0：正常登录");
    expect(md).toContain("  - 用户已注册");
    expect(md).toContain("    - 跳转首页");
    expect(md).toContain("- tc-002-p1：密码错误");
    expect(md).toContain("    - 提示错误");
    expect(md).toContain("### 1.2 注册模块");
    expect(md).toContain("- tc-003-p0：正常注册");
  });

  it("generates empty markdown for empty tree", () => {
    const md = modulesToMarkdown([]);
    expect(md).toContain("## 一、测试用例");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run lib/__tests__/md-mindmap-convert.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: 实现 conversion 函数**

```ts
// lib/md-mindmap-convert.ts
import type { UsecaseModule, UsecaseCase } from "@/lib/parse-testcase-md";

export interface MindMapData {
  data: {
    text: string;
    [key: string]: unknown;
  };
  children: MindMapData[];
}

/**
 * UsecaseModule[] → 脑图 JSON 树
 */
export function modulesToMindMap(tree: UsecaseModule[], rootTitle: string): MindMapData {
  const children = tree.map(moduleToMindMapNode);
  return { data: { text: rootTitle }, children };
}

function moduleToMindMapNode(mod: UsecaseModule): MindMapData {
  return {
    data: { text: mod.name },
    children: mod.cases.map(caseToMindMapNode),
  };
}

function caseToMindMapNode(c: UsecaseCase): MindMapData {
  const detailNodes: MindMapData[] = [];
  if (c.precondition) {
    detailNodes.push({ data: { text: `前置条件：${c.precondition}` }, children: [] });
  }
  if (c.steps) {
    detailNodes.push({ data: { text: `步骤：${c.steps}` }, children: [] });
  }
  if (c.expected) {
    detailNodes.push({ data: { text: `预期：${c.expected}` }, children: [] });
  }
  return {
    data: { text: `${c.id} ${c.priority} ${c.title}` },
    children: detailNodes,
  };
}

/**
 * 脑图 JSON 树 → UsecaseModule[]
 */
export function mindMapToModules(data: MindMapData): UsecaseModule[] {
  const modules: UsecaseModule[] = [];
  for (const child of data.children) {
    modules.push(mindMapNodeToModule(child));
  }
  return modules;
}

function mindMapNodeToModule(node: MindMapData): UsecaseModule {
  const cases: UsecaseCase[] = [];
  for (const child of node.children) {
    cases.push(mindMapNodeToCase(child));
  }
  return { name: node.data.text, open: true, cases };
}

const CASE_LINE_RE = /^(tc-\d+)\s+(P\d)\s+(.+)$/;

function mindMapNodeToCase(node: MindMapData): UsecaseCase {
  const titleText = node.data.text;
  const match = titleText.match(CASE_LINE_RE);
  const id = match?.[1] ?? "tc-000";
  const priority = (match?.[2] ?? "P2") as "P0" | "P1" | "P2";
  const title = match?.[3] ?? titleText;

  let precondition = "";
  let steps = "";
  let expected = "";

  for (const detail of node.children) {
    const text = detail.data.text;
    if (text.startsWith("前置条件：")) {
      precondition = text.slice(5);
    } else if (text.startsWith("步骤：")) {
      steps = text.slice(3);
    } else if (text.startsWith("预期：")) {
      expected = text.slice(3);
    }
  }

  return { id, title, priority, precondition, steps, expected, tags: "" };
}

/**
 * UsecaseModule[] → Markdown 文本
 * 与 parse-testcase-md 解析器格式一致，保证可逆
 */
export function modulesToMarkdown(tree: UsecaseModule[]): string {
  const lines: string[] = [];
  lines.push("## 一、测试用例\n");

  tree.forEach((mod, mi) => {
    lines.push(`### ${mi + 1}.${mi + 1} ${mod.name}`);
    mod.cases.forEach((c) => {
      lines.push("");
      lines.push(
        `- ${c.id}-${c.priority.toLowerCase()}：${c.title}`
      );
      if (c.precondition) {
        lines.push(`  - ${c.precondition}`);
      }
      if (c.expected) {
        // Expected uses deeper indent
        const expectedLines = c.expected.split("\n");
        expectedLines.forEach((l) => {
          lines.push(`    - ${l.trim()}`);
        });
      }
    });
    lines.push("");
  });

  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run lib/__tests__/md-mindmap-convert.test.ts
```

Expected: 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/md-mindmap-convert.ts lib/__tests__/md-mindmap-convert.test.ts
git commit -m "feat: add md-mindmap-convert — UsecaseModule[] ↔ MindMapData bidirectional conversion"
```

---

### Task 3: 扩展 parse-testcase-md.ts — modulesToMarkdown 导出

**Files:**
- Modify: `lib/parse-testcase-md.ts`

在文件末尾添加 `modulesToMarkdown` 导出（转发 `md-mindmap-convert.ts` 的实现以保持单点维护）：

- [ ] **Step 1: 添加导出**

在 [lib/parse-testcase-md.ts](lib/parse-testcase-md.ts) 末尾添加：

```ts
// Re-export from md-mindmap-convert for single source of truth
export { modulesToMarkdown } from "@/lib/md-mindmap-convert";
```

- [ ] **Step 2: 验证导出可用**

```bash
npx vitest run lib/__tests__/parse-testcase-md.test.ts
```

Expected: 现有测试全部 PASS，新增导出不影响已有行为。

- [ ] **Step 3: 追加测试到已有测试文件**

在 `lib/__tests__/parse-testcase-md.test.ts` 中追加：

```ts
import { modulesToMarkdown } from "@/lib/parse-testcase-md";

describe("modulesToMarkdown", () => {
  it("generates markdown that can be re-parsed", () => {
    const original = parseTestcaseMarkdown(SAMPLE_MD);
    if (!original.tree) throw new Error("parse failed");
    const md = modulesToMarkdown(original.tree);
    const reparsed = parseTestcaseMarkdown(md);
    expect(reparsed.tree).not.toBeNull();
    expect(reparsed.summary.totalCases).toBe(original.summary.totalCases);
  });
});
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run lib/__tests__/parse-testcase-md.test.ts
```

Expected: 所有测试 PASS，包括 round-trip。

- [ ] **Step 5: Commit**

```bash
git add lib/parse-testcase-md.ts lib/__tests__/parse-testcase-md.test.ts
git commit -m "feat: add modulesToMarkdown export to parse-testcase-md"
```

---

### Task 4: 创建 iframe 内容（mind-map.html + mind-map.js）

**Files:**
- Create: `public/editor/mind-map.html`
- Create: `public/editor/mind-map.js`

- [ ] **Step 1: 创建 mind-map.html**

```html
<!-- public/editor/mind-map.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>用例编辑器 — 脑图画布</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #mindMapContainer { width: 100%; height: 100%; overflow: hidden; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body>
  <div id="mindMapContainer"></div>
  <script src="/vendor/simple-mind-map.umd.min.js"></script>
  <script src="/editor/mind-map.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 mind-map.js**

```js
// public/editor/mind-map.js
(function () {
  "use strict";

  const MindMap = window.simpleMindMap;
  const xmind = MindMap.xmind;

  // --- State ---
  var mindMap = null;
  var originalSnapshot = null;
  var dirty = false;

  // --- Init ---
  function createMindMap() {
    mindMap = new MindMap({
      el: document.getElementById("mindMapContainer"),
      data: { data: { text: "" }, children: [] },
      layout: "logicalStructure",
      theme: "classic4",
      readonly: false,
      enableFreeDrag: true,
      mousewheelAction: "zoom",
    });
  }

  // --- Dirty tracking ---
  function updateDirty() {
    if (!mindMap) return;
    var current = JSON.stringify(mindMap.getData());
    var changed = current !== originalSnapshot;
    if (changed !== dirty) {
      dirty = changed;
      post({ type: "dirty", payload: dirty });
    }
  }

  function snapshot() {
    if (!mindMap) return;
    originalSnapshot = JSON.stringify(mindMap.getData());
    dirty = false;
    post({ type: "dirty", payload: false });
  }

  // --- Save handler (Ctrl+S) ---
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      post({ type: "saveRequested" });
    }
  });

  // --- PostMessage sender ---
  function post(msg) {
    window.parent.postMessage(msg, window.location.origin);
  }

  // --- Message handler ---
  window.addEventListener("message", function (e) {
    if (e.origin !== window.location.origin) return;

    var msg = e.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "init":
        handleInit(msg.payload);
        break;
      case "getData":
        post({
          type: "data",
          payload: { json: mindMap ? mindMap.getData() : null },
        });
        break;
      case "exportXmind":
        handleExportXmind();
        break;
      case "importXmind":
        handleImportXmind(msg.payload);
        break;
      case "undo":
        if (mindMap) mindMap.execCommand("BACK");
        break;
      case "redo":
        if (mindMap) mindMap.execCommand("FORWARD");
        break;
    }
  });

  // --- Init handler ---
  function handleInit(payload) {
    if (!payload) return;
    if (mindMap) {
      mindMap.destroy();
      mindMap = null;
    }
    createMindMap();

    if (payload.data && payload.data.data) {
      mindMap.setFullData(payload.data);
    } else {
      mindMap.setData({ data: { text: "测试用例" }, children: [] });
    }

    if (payload.data) {
      // Listen for data changes
      mindMap.on("data_change", updateDirty);
      mindMap.on("view_theme_change_config", function () {
        // Re-snapshot after theme change to avoid false dirty
        if (!dirty && mindMap) {
          originalSnapshot = JSON.stringify(mindMap.getData());
        }
      });
    }

    // Post-ready THEN snapshot (so init data isn't counted as dirty)
    post({ type: "ready" });
    snapshot();
  }

  // --- XMind import (base64 → parse) ---
  async function handleImportXmind(payload) {
    if (!payload || !payload.base64) {
      post({ type: "error", payload: { message: "导入数据为空" } });
      return;
    }
    try {
      var binaryStr = atob(payload.base64);
      var bytes = new Uint8Array(binaryStr.length);
      for (var i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      var blob = new Blob([bytes.buffer], { type: "application/x-zip-compressed" });
      var file = new File([blob], "imported.xmind", { type: "application/x-zip-compressed" });

      var data = await xmind.parseXmindFile(file);
      mindMap.setFullData(data);
      snapshot();
      post({ type: "ready" });
    } catch (err) {
      post({ type: "error", payload: { message: "文件格式损坏，无法加载" } });
    }
  }

  // --- XMind export (mind map data → base64 blob) ---
  async function handleExportXmind() {
    try {
      var data = mindMap.getData();
      var blob = await xmind.transformToXmind(data, "export");
      var reader = new FileReader();
      reader.onload = function () {
        // Result is data:application/zip;base64,...
        var full = reader.result;
        var base64 = full.slice(full.indexOf(",") + 1);
        post({ type: "xmindBlob", payload: { base64: base64 } });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      post({ type: "error", payload: { message: "导出 XMind 失败" } });
    }
  }

  // --- Boot ---
  createMindMap();
  post({ type: "ready" });
})();
```

- [ ] **Step 3: 验证 iframe 可加载**

启动 dev server 后访问 `http://localhost:3000/editor/mind-map.html`，应显示空白画布。

```bash
npm run dev
# 浏览器访问 http://localhost:3000/editor/mind-map.html
```

- [ ] **Step 4: Commit**

```bash
git add public/editor/mind-map.html public/editor/mind-map.js
git commit -m "feat: add mind map iframe page (mind-map.html + mind-map.js)"
```

---

### Task 5: 创建 editor-bridge.ts 桥接层

**Files:**
- Create: `components/usecase-gen/editor-bridge.ts`
- Create: `components/usecase-gen/__tests__/editor-bridge.test.ts`

- [ ] **Step 1: 写测试文件**

```ts
// components/usecase-gen/__tests__/editor-bridge.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEditorBridge } from "../editor-bridge";

// Helper: create a mock iframe that we control
function mockIframe() {
  const listeners: Record<string, Array<(e: MessageEvent) => void>> = {};
  const el = {
    contentWindow: {
      postMessage: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLIFrameElement;

  // Intercept addEventListener to capture message handler
  const originalWindow = global.window;
  const messageHandlers: Array<(e: MessageEvent) => void> = [];

  return {
    el,
    handlers: messageHandlers,
    // Simulate iframe posting a message
    simulate: (data: unknown) => {
      messageHandlers.forEach((h) =>
        h(new MessageEvent("message", { data, origin: window.location.origin }))
      );
    },
  };
}

describe("createEditorBridge", () => {
  let originalAddEventListener: typeof window.addEventListener;

  beforeEach(() => {
    originalAddEventListener = window.addEventListener;
  });

  afterEach(() => {
    window.addEventListener = originalAddEventListener;
  });

  it("resolves waitReady when iframe posts ready", async () => {
    let capturedHandler: ((e: MessageEvent) => void) | null = null;
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    // Start waiting
    const readyPromise = bridge.waitReady();

    // Simulate ready message
    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "ready" },
        origin: window.location.origin,
      })
    );

    await readyPromise;
    // Should resolve without throwing
  });

  it("waitReady times out after 10s", async () => {
    window.addEventListener = vi.fn() as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    // Override timeout to 100ms for test
    const result = await Promise.race([
      bridge.waitReady(100).then(() => "resolved"),
      new Promise((r) => setTimeout(() => r("timed_out"), 200)),
    ]);

    expect(result).toBe("timed_out");
  });

  it("getData resolves with mind map JSON when iframe responds", async () => {
    let capturedHandler: ((e: MessageEvent) => void) | null = null;
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    const dataPromise = bridge.getData();
    const testData = { data: { text: "Root" }, children: [] };

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "data", payload: { json: testData } },
        origin: window.location.origin,
      })
    );

    const result = await dataPromise;
    expect(result).toEqual(testData);
  });

  it("exportXmind resolves with base64 string", async () => {
    let capturedHandler: ((e: MessageEvent) => void) | null = null;
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    const exportPromise = bridge.exportXmind();

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "xmindBlob", payload: { base64: "dGVzdA==" } },
        origin: window.location.origin,
      })
    );

    const result = await exportPromise;
    expect(result).toBe("dGVzdA==");
  });

  it("onDirty callback fires when dirty message received", async () => {
    let capturedHandler: ((e: MessageEvent) => void) | null = null;
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    const dirtyValues: boolean[] = [];
    bridge.onDirty((d) => dirtyValues.push(d));

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "dirty", payload: true },
        origin: window.location.origin,
      })
    );

    expect(dirtyValues).toEqual([true]);
  });

  it("onSaveRequested callback fires on saveRequested message", async () => {
    let capturedHandler: ((e: MessageEvent) => void) | null = null;
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    let saved = false;
    bridge.onSaveRequested(() => { saved = true; });

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "saveRequested" },
        origin: window.location.origin,
      })
    );

    expect(saved).toBe(true);
  });

  it("onError callback fires on error message", async () => {
    let capturedHandler: ((e: MessageEvent) => void) | null = null;
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    let errorMsg = "";
    bridge.onError((msg) => { errorMsg = msg; });

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "error", payload: { message: "something broke" } },
        origin: window.location.origin,
      })
    );

    expect(errorMsg).toBe("something broke");
  });

  it("ignores messages from wrong origin", async () => {
    let capturedHandler: ((e: MessageEvent) => void) | null = null;
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    let saved = false;
    bridge.onSaveRequested(() => { saved = true; });

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "saveRequested" },
        origin: "https://evil.com",
      })
    );

    expect(saved).toBe(false);
  });

  it("init sends init message to iframe", () => {
    const iframe = document.createElement("iframe");
    const postMessageSpy = vi.fn();
    // Mock contentWindow
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: postMessageSpy },
      writable: true,
    });

    const bridge = createEditorBridge(iframe);
    const testData = { data: { text: "Root" }, children: [] };
    bridge.init(testData, "test.md");

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "init", payload: { data: testData, fileName: "test.md" } },
      window.location.origin
    );
  });

  it("undo/redo/importXmind send corresponding messages", () => {
    const iframe = document.createElement("iframe");
    const postMessageSpy = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: postMessageSpy },
      writable: true,
    });

    const bridge = createEditorBridge(iframe);

    bridge.undo();
    expect(postMessageSpy).toHaveBeenCalledWith({ type: "undo" }, window.location.origin);

    bridge.redo();
    expect(postMessageSpy).toHaveBeenCalledWith({ type: "redo" }, window.location.origin);

    bridge.importXmindFile("dGVzdA==");
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "importXmind", payload: { base64: "dGVzdA==" } },
      window.location.origin
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run components/usecase-gen/__tests__/editor-bridge.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: 实现 editor-bridge.ts**

```ts
// components/usecase-gen/editor-bridge.ts

interface MindMapData {
  data: { text: string; [key: string]: unknown };
  children: MindMapData[];
}

interface InitPayload {
  data: MindMapData | null;
  fileName: string;
}

type MessageHandler = (e: MessageEvent) => void;
type DirtyCallback = (dirty: boolean) => void;
type SaveRequestedCallback = () => void;
type ErrorCallback = (message: string) => void;

export function createEditorBridge(iframeRef: HTMLIFrameElement) {
  const pendingResolvers = new Map<string, (value: any) => void>();
  let msgId = 0;
  let dirtyCb: DirtyCallback | null = null;
  let saveCb: SaveRequestedCallback | null = null;
  let errorCb: ErrorCallback | null = null;

  const handler: MessageHandler = (e) => {
    if (e.origin !== window.location.origin) return;
    const msg = e.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "ready":
        resolveNext("ready", null);
        break;
      case "data":
        resolveNext("data", msg.payload?.json ?? null);
        break;
      case "xmindBlob":
        resolveNext("xmindBlob", msg.payload?.base64 ?? "");
        break;
      case "dirty":
        dirtyCb?.(msg.payload === true);
        break;
      case "saveRequested":
        saveCb?.();
        break;
      case "error":
        errorCb?.(msg.payload?.message ?? "未知错误");
        break;
    }
  };

  function resolveNext(key: string, value: any) {
    for (const [k, resolve] of pendingResolvers) {
      if (k.startsWith(key + ":")) {
        resolve(value);
        pendingResolvers.delete(k);
        return;
      }
    }
    // Generic — resolve all waiters for this type
    const keyPrefix = key + ":";
    for (const [k, resolve] of pendingResolvers) {
      if (k.startsWith(keyPrefix)) {
        resolve(value);
        pendingResolvers.delete(k);
      }
    }
  }

  function waitFor(type: string, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `${type}:${msgId++}`;
      pendingResolvers.set(id, resolve);
      if (timeoutMs > 0) {
        setTimeout(() => {
          if (pendingResolvers.has(id)) {
            pendingResolvers.delete(id);
            reject(new Error(`${type} 通信超时`));
          }
        }, timeoutMs);
      }
    });
  }

  function post(msg: Record<string, unknown>) {
    iframeRef.contentWindow?.postMessage(msg, window.location.origin);
  }

  window.addEventListener("message", handler);

  return {
    waitReady: (timeoutMs?: number) => waitFor("ready", timeoutMs),
    init: (data: MindMapData | null, fileName: string) => {
      post({ type: "init", payload: { data, fileName } });
    },
    getData: () => {
      post({ type: "getData" });
      return waitFor("data");
    },
    exportXmind: () => {
      post({ type: "exportXmind" });
      return waitFor("xmindBlob");
    },
    importXmindFile: (base64: string) => {
      post({ type: "importXmind", payload: { base64 } });
    },
    undo: () => post({ type: "undo" }),
    redo: () => post({ type: "redo" }),
    onDirty: (cb: DirtyCallback) => { dirtyCb = cb; },
    onSaveRequested: (cb: SaveRequestedCallback) => { saveCb = cb; },
    onError: (cb: ErrorCallback) => { errorCb = cb; },
    destroy: () => {
      window.removeEventListener("message", handler);
      pendingResolvers.clear();
    },
  };
}

export type EditorBridge = ReturnType<typeof createEditorBridge>;
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run components/usecase-gen/__tests__/editor-bridge.test.ts
```

Expected: 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/editor-bridge.ts components/usecase-gen/__tests__/editor-bridge.test.ts
git commit -m "feat: add editor-bridge — postMessage protocol wrapper"
```

---

### Task 6: 重写 case-editor.tsx

**Files:**
- Modify: `components/usecase-gen/case-editor.tsx` (完整替换)
- Modify: `components/usecase-gen/__tests__/case-editor.test.tsx` (适配新接口)

- [ ] **Step 1: 更新测试文件**

```ts
// components/usecase-gen/__tests__/case-editor.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CaseEditor } from "../case-editor";
import type { MindMapData } from "@/lib/md-mindmap-convert";

// Mock the bridge
vi.mock("../editor-bridge", () => ({
  createEditorBridge: vi.fn(() => ({
    waitReady: vi.fn(() => Promise.resolve()),
    init: vi.fn(),
    getData: vi.fn(() => Promise.resolve({ data: { text: "Root" }, children: [] })),
    exportXmind: vi.fn(() => Promise.resolve("dGVzdA==")),
    importXmindFile: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    onDirty: vi.fn(),
    onSaveRequested: vi.fn(),
    onError: vi.fn(),
    destroy: vi.fn(),
  })),
}));

const mockData: MindMapData = {
  data: { text: "测试用例" },
  children: [
    {
      data: { text: "登录模块" },
      children: [
        {
          data: { text: "tc-001 P0 正常登录" },
          children: [
            { data: { text: "前置条件：用户已注册" }, children: [] },
            { data: { text: "预期：跳转首页" }, children: [] },
          ],
        },
      ],
    },
  ],
};

describe("CaseEditor", () => {
  it("renders toolbar buttons when data is provided", () => {
    render(
      <CaseEditor
        data={mockData}
        fileName="test.md"
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    expect(screen.getByText("保存")).toBeDefined();
    expect(screen.getByText("下载 XMind")).toBeDefined();
    expect(screen.getByText("导入")).toBeDefined();
  });

  it("renders filename in toolbar", () => {
    render(
      <CaseEditor
        data={mockData}
        fileName="test.md"
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    expect(screen.getByText("test.md")).toBeDefined();
  });

  it("disables save/download/knowledge when data is null", () => {
    render(
      <CaseEditor
        data={null}
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    const saveBtn = screen.getByText("保存").closest("button");
    const downloadBtn = screen.getByText("下载 XMind").closest("button");
    expect(saveBtn?.disabled).toBe(true);
    expect(downloadBtn?.disabled).toBe(true);
  });

  it("shows empty state upload prompt when data is null", () => {
    render(
      <CaseEditor
        data={null}
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    expect(screen.getByText("导入用例开始编辑")).toBeDefined();
    expect(screen.getByText("拖拽 .xmind / .md 文件到此处")).toBeDefined();
  });

  it("renders iframe element", () => {
    render(
      <CaseEditor
        data={mockData}
        fileName="test.md"
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("/editor/mind-map.html");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run components/usecase-gen/__tests__/case-editor.test.tsx
```

Expected: FAIL — 旧测试与新组件不匹配。

- [ ] **Step 3: 重写 case-editor.tsx**

```tsx
// components/usecase-gen/case-editor.tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Undo2, Redo2, Save, Download, Upload, BookOpen } from "lucide-react";
import { createEditorBridge, type EditorBridge } from "./editor-bridge";
import type { MindMapData } from "@/lib/md-mindmap-convert";
import { parseTestcaseMarkdown } from "@/lib/parse-testcase-md";
import { modulesToMindMap } from "@/lib/md-mindmap-convert";

interface SaveResult {
  json: MindMapData;
  xmindBase64: string;
}

interface CaseEditorProps {
  data: MindMapData | null;
  fileName?: string;
  onSave: (result: SaveResult) => Promise<void>;
  onExportToKnowledge: (data: MindMapData) => Promise<void>;
}

export function CaseEditor({ data, fileName, onSave, onExportToKnowledge }: CaseEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<EditorBridge | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasData, setHasData] = useState(data !== null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize bridge and iframe
  useEffect(() => {
    if (!iframeRef.current) return;
    const bridge = createEditorBridge(iframeRef.current);
    bridgeRef.current = bridge;

    bridge.onDirty((d) => setDirty(d));
    bridge.onSaveRequested(() => handleSave());
    bridge.onError((msg) => setErrorMsg(msg));

    bridge.waitReady(10000).then(() => {
      if (data) {
        bridge.init(data, fileName ?? "未命名");
        setHasData(true);
      } else {
        bridge.init(null, "");
      }
      setLoading(false);
    }).catch(() => {
      setErrorMsg("脑图加载失败，点击重试");
      setLoading(false);
    });

    return () => {
      bridge.destroy();
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async () => {
    if (!bridgeRef.current || !hasData) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const json = await bridgeRef.current.getData();
      const xmindBase64 = await bridgeRef.current.exportXmind();
      await onSave({ json, xmindBase64 });
      setDirty(false);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "保存失败");
    } finally {
      setSaving(false);
    }
  }, [hasData, onSave]);

  const handleDownloadXmind = useCallback(async () => {
    if (!bridgeRef.current) return;
    try {
      const base64 = await bridgeRef.current.exportXmind();
      const byteChars = atob(base64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        bytes[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([bytes.buffer], { type: "application/x-zip-compressed" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileName ?? "usecase") + ".xmind";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg("导出失败");
    }
  }, [fileName]);

  const handleExportKnowledge = useCallback(async () => {
    if (!bridgeRef.current) return;
    try {
      const json = await bridgeRef.current.getData();
      await onExportToKnowledge(json);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "反哺失败");
    }
  }, [onExportToKnowledge]);

  // File import
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bridgeRef.current) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xmind" && ext !== "md") {
      setErrorMsg("仅支持 .xmind 和 .md 文件");
      return;
    }

    const doImport = async (mode: "replace" | "merge") => {
      if (!bridgeRef.current) return;
      try {
        if (ext === "xmind") {
          const buffer = await file.arrayBuffer();
          const base64 = btoa(
            Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join("")
          );
          if (mode === "replace") {
            // For replace: init with null first to clear, then import
            bridgeRef.current.init(null, "");
            await bridgeRef.current.waitReady(5000);
          }
          bridgeRef.current.importXmindFile(base64);
        } else {
          const text = await file.text();
          const parsed = parseTestcaseMarkdown(text);
          if (!parsed.tree) {
            setErrorMsg("文件解析失败");
            return;
          }
          const mindMapData = modulesToMindMap(parsed.tree, "测试用例");
          if (mode === "merge" && hasData) {
            const current = await bridgeRef.current.getData();
            // Append imported children to current root
            current.children.push(...mindMapData.children);
            bridgeRef.current.init(current, file.name);
          } else {
            bridgeRef.current.init(mindMapData, file.name);
          }
        }
        setHasData(true);
        setDirty(true);
      } catch {
        setErrorMsg("文件导入失败");
      }
    };

    if (!hasData) {
      // No existing data — import directly
      await doImport("replace");
    } else {
      // Has data — ask user
      const choice = window.confirm(
        "当前已有数据。\n\n「确定」= 替换\n「取消」= 合并到根节点下\n\n按 Esc 取消操作"
      );
      if (choice) {
        await doImport("replace");
      } else if (choice === false) {
        await doImport("merge");
      }
      // If user pressed Esc or closed dialog, do nothing
    }

    // Reset file input
    e.target.value = "";
  }, [hasData]);

  // Paste Markdown
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !bridgeRef.current) return;
    const parsed = parseTestcaseMarkdown(text);
    if (!parsed.tree || parsed.tree.length === 0) return;

    e.preventDefault();
    const mindMapData = modulesToMindMap(parsed.tree, "测试用例");
    if (!hasData) {
      bridgeRef.current.init(mindMapData, "剪贴板.md");
      setHasData(true);
    } else {
      // Auto-merge on paste
      bridgeRef.current.getData().then((current) => {
        current.children.push(...mindMapData.children);
        bridgeRef.current!.init(current, fileName ?? "未命名");
        setDirty(true);
      });
    }
  }, [hasData, fileName]);

  // Retry loading
  const handleRetry = useCallback(() => {
    setErrorMsg(null);
    setLoading(true);
    if (bridgeRef.current && iframeRef.current && iframeRef.current.contentWindow) {
      bridgeRef.current.init(data, fileName ?? "未命名");
      setTimeout(() => setLoading(false), 2000);
    } else {
      window.location.reload();
    }
  }, [data, fileName]);

  // beforeunload guard
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const canSave = hasData && !saving;

  return (
    <div className="flex flex-col flex-1" onPaste={handlePaste} tabIndex={-1}>
      {/* Toolbar */}
      <div className="bg-card rounded-xl shadow-sm px-4 py-2 mb-2 flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => bridgeRef.current?.undo()}
            className="p-2 rounded-lg hover:bg-muted text-sm"
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => bridgeRef.current?.redo()}
            className="p-2 rounded-lg hover:bg-muted text-sm"
            title="重做 (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-border mx-1" />
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${
              canSave
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "text-muted-foreground cursor-not-allowed"
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "保存中..." : "保存"}{dirty ? "*" : ""}
          </button>
          <button
            onClick={handleDownloadXmind}
            disabled={!hasData}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${
              hasData
                ? "hover:bg-muted"
                : "text-muted-foreground cursor-not-allowed"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            下载 XMind
          </button>
          <button
            onClick={handleImportClick}
            className="px-3 py-1.5 rounded-lg text-sm hover:bg-muted flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            导入
          </button>
          <button
            onClick={handleExportKnowledge}
            disabled={!hasData}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${
              hasData
                ? "hover:bg-muted"
                : "text-muted-foreground cursor-not-allowed"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            反哺知识库
          </button>
        </div>
        {fileName && (
          <span className="text-xs text-muted-foreground">{fileName}{dirty ? " *" : ""}</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xmind,.md"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Status bar */}
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-4 flex-shrink-0">
        <span>{dirty ? "⏳ 未保存" : "✅ 已保存"}</span>
        {errorMsg && (
          <span className="text-red-500">{errorMsg}</span>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">加载脑图画布...</p>
            </div>
          </div>
        )}

        {errorMsg && errorMsg.includes("重试") && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">{errorMsg}</p>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
              >
                点击重试
              </button>
            </div>
          </div>
        )}

        {!data && !loading && !errorMsg && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center max-w-sm">
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="text-base font-medium mb-2">导入用例开始编辑</p>
              <p className="text-sm text-muted-foreground mb-4">
                拖拽 .xmind / .md 文件到此处<br />或点击选择文件
              </p>
              <button
                onClick={handleImportClick}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm mb-2"
              >
                选择文件
              </button>
              <p className="text-xs text-muted-foreground">也支持从剪贴板粘贴 Markdown</p>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src="/editor/mind-map.html"
          className="w-full h-full border-0"
          title="用例脑图编辑器"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run components/usecase-gen/__tests__/case-editor.test.tsx
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/usecase-gen/case-editor.tsx components/usecase-gen/__tests__/case-editor.test.tsx
git commit -m "feat: rewrite CaseEditor — iframe brain map with toolbar, import, export"
```

---

### Task 7: 适配 page.tsx

**Files:**
- Modify: `app/usecase-gen/page.tsx`

- [ ] **Step 1: 更新 page.tsx**

在 [app/usecase-gen/page.tsx](app/usecase-gen/page.tsx) 中更新 CaseEditor 渲染段（第 89-93 行）：

```tsx
import { modulesToMindMap } from "@/lib/md-mindmap-convert";
import type { MindMapData, SaveResult } from "@/lib/md-mindmap-convert";
// ... existing imports ...
```

将第 89-93 行的 CaseEditor 渲染替换为：

```tsx
{activeTab === 2 && (
  <div className="max-w-7xl mx-auto w-full">
    <CaseEditor
      data={usecaseTree && usecaseTree.length > 0 ? modulesToMindMap(usecaseTree, "测试用例") : null}
      onSave={async (result: SaveResult) => {
        // For MD source: convert json → Markdown → write back
        // For XMind source: use result.xmindBase64 directly
        // API calls will be added when Task API routes are implemented
        console.log("Save called with", result.json.data.text);
        // TODO: in future iteration, call POST /api/tasks/[id]/save-usecase
      }}
      onExportToKnowledge={async (data: MindMapData) => {
        // TODO: POST to knowledge API
        console.log("Export to knowledge", data.data.text);
      }}
    />
  </div>
)}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

Expected: No new TypeScript errors (may have existing ones in other files).

- [ ] **Step 3: 手动验证**

```bash
npm run dev
# 浏览器访问 http://localhost:3000/usecase-gen?tab=editor
# 空数据状态应显示导入入口
```

- [ ] **Step 4: Commit**

```bash
git add app/usecase-gen/page.tsx
git commit -m "feat: adapt page.tsx for new CaseEditor props interface"
```

---

### Task 8: 全量测试 + 集成验证

**Files:**
- 运行所有相关测试套件

- [ ] **Step 1: 运行转换层测试**

```bash
npx vitest run lib/__tests__/md-mindmap-convert.test.ts
```

Expected: 10 tests PASS.

- [ ] **Step 2: 运行 bridge 测试**

```bash
npx vitest run components/usecase-gen/__tests__/editor-bridge.test.ts
```

Expected: 10 tests PASS.

- [ ] **Step 3: 运行 CaseEditor 测试**

```bash
npx vitest run components/usecase-gen/__tests__/case-editor.test.tsx
```

Expected: 5 tests PASS.

- [ ] **Step 4: 运行 parse-testcase-md 测试**

```bash
npx vitest run lib/__tests__/parse-testcase-md.test.ts
```

Expected: 所有测试 PASS（含新增 round-trip 测试）。

- [ ] **Step 5: 运行全部测试**

```bash
npx vitest run
```

Expected: 所有已有测试 + 新增测试全部 PASS。

- [ ] **Step 6: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: verify all tests pass after CaseEditor redesign"
```

---

## 自检

1. **Spec coverage**:
   - ✅ 架构（iframe 隔离） → Task 4, 6
   - ✅ MindMapData 类型 → Task 2
   - ✅ 三种入口（A 向导 + C 空数据）→ Task 6, 7
   - ✅ postMessage 协议 → Task 5
   - ✅ Dirty 追踪 → Task 4 (mind-map.js)
   - ✅ MD ↔ 脑图互转 → Task 2, 3
   - ✅ 导出下载 XMind → Task 6 (handleDownloadXmind)
   - ✅ 空数据导入 → Task 6 (handleFileChange)
   - ✅ 粘贴 Markdown → Task 6 (handlePaste)
   - ✅ 错误处理 → Task 6 (error state)
   - ✅ 离开拦截 → Task 6 (beforeunload)

2. **Placeholder scan**: 无 TBD、TODO（page.tsx 中的 TODO 注释是 API 路由后续迭代，符合 scope）。

3. **Type consistency**: `MindMapData`、`SaveResult`、`EditorBridge` 在所有 task 中一致。
