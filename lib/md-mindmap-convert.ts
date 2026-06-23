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
