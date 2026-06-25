import type { UsecaseModule, UsecaseCase } from "@/lib/parse-testcase-md";

// Regex patterns shared with parse-testcase-md (duplicated to avoid circular import)
const SECTION_TITLE_RE = /^[一二三四五六七八九十]+[、.]/;
const CASE_TITLE_RE = /^(tc-\d+)-(p\d)\s*[：:]\s*(.+)/i;

function isHeaderLike(title: string): boolean {
  return /^[\d.]+[\s　]/.test(title) || SECTION_TITLE_RE.test(title);
}

function looksLikeCase(title: string): boolean {
  return CASE_TITLE_RE.test(title);
}

function isSectionWrapper(title: string): boolean {
  return SECTION_TITLE_RE.test(title) || title === "测试用例" || title === "root";
}

export interface MindMapData {
  data: {
    text: string;
    [key: string]: unknown;
  };
  children: MindMapData[];
}

/** Minimal tree node for straight-through MD→MindMap conversion (avoids circular import) */
export interface SimpleMdNode {
  title: string;
  children: SimpleMdNode[];
}

/**
 * 直通转换：MdNode tree → MindMapData，1:1 保留原始层级。
 * 对齐 Python md2xmind.py 的树结构，不做任何扁平化或字段抽取。
 */
export function treeToMindMapData(node: SimpleMdNode): MindMapData {
  return {
    data: { text: node.title },
    children: node.children.map(treeToMindMapData),
  };
}

/**
 * UsecaseModule[] → 脑图 JSON 树（旧路径：用于向导概览表 → 编辑器）
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
  // Align with Python md2xmind.py: raw text only, no prefix labels
  if (c.precondition) {
    detailNodes.push({ data: { text: c.precondition }, children: [] });
  }
  if (c.steps) {
    detailNodes.push({ data: { text: c.steps }, children: [] });
  }
  if (c.expected) {
    detailNodes.push({ data: { text: c.expected }, children: [] });
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

  // Children order: [precondition?, steps?, expected?] — aligned with caseToMindMapNode
  if (node.children.length === 1) {
    // Single child → expected (most common pattern in Python-style output)
    expected = node.children[0].data.text || "";
  } else if (node.children.length === 2) {
    precondition = node.children[0].data.text || "";
    expected = node.children[1].data.text || "";
  } else if (node.children.length >= 3) {
    precondition = node.children[0].data.text || "";
    steps = node.children[1].data.text || "";
    expected = node.children[node.children.length - 1].data.text || "";
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
    lines.push(`### 1.${mi + 1} ${mod.name}`);
    mod.cases.forEach((c) => {
      lines.push("");
      lines.push(
        `- ${c.id}-${c.priority.toLowerCase()}：${c.title}`
      );
      if (c.precondition) {
        lines.push(`  - ${c.precondition}`);
      }
      if (c.expected) {
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

/**
 * Strip rich-text HTML (e.g. <p>...</p> emitted by simple-mind-map's RichText
 * plugin) back to plain text. Runs in both browser and Node — no DOM required.
 */
function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * MindMapData tree → Markdown (preserves original header/list structure).
 *
 * Unlike modulesToMarkdown (which flattens through UsecaseModule[]),
 * this converts the tree 1:1 back to the same format that parseMarkdownToTree
 * produces, ensuring save→reload round-trips cleanly.
 */
export function mindMapTreeToMarkdown(root: MindMapData): string {
  const lines: string[] = [];

  function walk(
    node: MindMapData,
    headerDepth: number,
    caseDepth: number
  ) {
    const title = stripHtml(node.data.text);

    if (isHeaderLike(title) && !looksLikeCase(title)) {
      // Header node → markdown heading
      const level = Math.min(headerDepth + 1, 6);
      lines.push("");
      lines.push("#".repeat(level) + " " + title);
      for (const child of node.children) {
        walk(child, headerDepth + 1, 0);
      }
    } else if (looksLikeCase(title)) {
      // Test case → top-level list item
      lines.push("");
      lines.push("- " + title);
      for (const child of node.children) {
        walk(child, headerDepth, 1);
      }
    } else if (caseDepth > 0) {
      // Detail / expected / precondition under a case → indented list item
      const indent = "  ".repeat(caseDepth);
      lines.push(indent + "- " + title);
      for (const child of node.children) {
        walk(child, headerDepth, caseDepth + 1);
      }
    } else if (headerDepth === 0) {
      // Root → h1 document title
      lines.push("# " + title);
      for (const child of node.children) {
        walk(child, headerDepth + 1, 0);
      }
    } else {
      // Fallback: treat as list item
      lines.push("- " + title);
      for (const child of node.children) {
        walk(child, headerDepth, caseDepth + 1);
      }
    }
  }

  walk(root, 0, 0);
  return lines.join("\n").trim() + "\n";
}
