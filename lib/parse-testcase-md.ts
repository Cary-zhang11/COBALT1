/**
 * Markdown → UsecaseModule[] 解析器
 *
 * 解析 prd-to-tests-new skill 生成的测试用例 .md 文件，
 * 提取模块树和统计摘要。
 *
 * 对齐 .claude/skills/prd-to-tests-new/scripts/md2xmind.py 的 parse_markdown 逻辑：
 *   统一检测标题(#)和列表项(-)，自动推算缩进步长，泛用性更强。
 */

// --- Generic tree node (Python parse_markdown output) ---
export interface MdNode {
  title: string;
  children: MdNode[];
}

export interface UsecaseCase {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  precondition: string;
  steps: string;
  expected: string;
  tags: string;
}

export interface UsecaseModule {
  name: string;
  open: boolean;
  cases: UsecaseCase[];
}

export interface ParseSummary {
  totalCases: number;
  qualityScore: number;
  modules: number;
}

export interface ParseMeta {
  sourceDoc: string;
  generatedAt: string;
  prdVersion: string;
}

export interface DimensionCoverage {
  name: string;
  code: string;
  covered: boolean;
  caseCount: number;
}

export interface ParseResult {
  tree: UsecaseModule[] | null;
  summary: ParseSummary;
  meta: ParseMeta;
  dimensions: DimensionCoverage[];
}

const prioritySet = new Set(["P0", "P1", "P2"]);

function toPriority(p: string): "P0" | "P1" | "P2" {
  return (prioritySet.has(p) ? p : "P2") as "P0" | "P1" | "P2";
}

function extractMeta(markdown: string): ParseMeta {
  const sourceMatch = markdown.match(/> \*\*需求来源\*\*: (.+)/);
  const dateMatch = markdown.match(/> \*\*生成日期\*\*: (.+)/);
  const versionMatch = markdown.match(/> \*\*PRD版本\*\*: (.+)/);
  return {
    sourceDoc: sourceMatch?.[1]?.trim() || "",
    generatedAt: dateMatch?.[1]?.trim() || "",
    prdVersion: versionMatch?.[1]?.trim() || "",
  };
}

// ====== Python md2xmind.py 风格的解析器 ======

/**
 * 检测 Markdown 列表的最小缩进步长（支持 2/3/4 空格），默认 2。
 */
function detectIndentStep(lines: string[]): number {
  const indents = new Set<number>();
  for (const line of lines) {
    const s = line.replace(/\s+$/, "");
    if (!s) continue;
    const m = s.match(/^(\s*)[-*+]\s+/);
    if (m) {
      const n = m[1].length;
      if (n > 0) indents.add(n);
    }
  }
  if (indents.size === 0) return 2;
  return Math.min(...indents);
}

/**
 * 对齐 Python parse_markdown: 统一的 # 标题 + 列表项层级检测。
 * 返回泛用 tree：{ title, children }。
 */
export function parseMarkdownToTree(mdText: string): MdNode {
  const rawLines = mdText.split("\n");
  const lines = rawLines.map((l) => l.replace(/\s+$/, "")).filter((l) => l !== "");

  const root: MdNode = { title: "root", children: [] };
  // stack: [level, node]  (level smaller = shallower in tree)
  const stack: [number, MdNode][] = [[-1, root]];
  const indentStep = detectIndentStep(rawLines);

  for (const line of lines) {
    let level: number | null = null;
    let title: string | null = null;

    // --- Header: # ## ### ... ---
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      level = hm[1].length;
      title = hm[2].trim();
    } else {
      // --- List item: - * + ---
      const lm = line.match(/^(\s*)[-*+]\s+(.*)/);
      if (lm) {
        const indent = lm[1].length;
        title = lm[2].trim();
        level = 7 + Math.floor(indent / indentStep); // 7 = just above h6
      }
    }

    if (title === null) continue;

    const node: MdNode = { title, children: [] };
    while (stack.length > 1 && stack[stack.length - 1][0] >= level!) {
      stack.pop();
    }
    stack[stack.length - 1][1].children.push(node);
    stack.push([level!, node]);
  }

  return root;
}

/** Sections whose content should NOT be parsed as test cases */
const NON_CASE_SECTION_KEYWORDS = [
  "冒烟测试", "冒烟测试清单", "完整性检查", "完整性检查报告",
  "维度覆盖检查", "埋点测试", "埋点",
];

function isNonCaseSection(title: string): boolean {
  return NON_CASE_SECTION_KEYWORDS.some((kw) => title.includes(kw));
}

/**
 * Check if a title looks like a case line: "tc-xxx-pX：title" or "tc-xxx-PX：title".
 */
const CASE_TITLE_RE = /^(tc-\d+)-(p\d)\s*[：:]\s*(.+)/i;

function looksLikeCase(title: string): boolean {
  return CASE_TITLE_RE.test(title);
}

/**
 * Collect all descendant case nodes from a MdNode tree (recursive).
 * Used when ### + ####/##### headers create deeper nesting.
 */
function collectCasesFromNode(node: MdNode): MdNode[] {
  const result: MdNode[] = [];
  for (const child of node.children) {
    if (looksLikeCase(child.title)) {
      result.push(child);
    } else {
      // Recurse into sub-headers (####, #####) to find cases
      result.push(...collectCasesFromNode(child));
    }
  }
  return result;
}

/**
 * Check whether a node is a header-like node (title starts with number pattern or is a section marker).
 * Used to detect #### / ##### sub-headers that should be flattened.
 */
function isHeaderLike(title: string): boolean {
  return /^[\d.]+[\s　]/.test(title) || SECTION_TITLE_RE.test(title);
}

/**
 * 将 parseMarkdownToTree 的泛用 tree 转为 UsecaseModule[]。
 *
 * 对齐 Python md2xmind.py + 原有测试用例结构：
 *   1. 跳过非用例 section（冒烟测试、完整性检查等）
 *   2. ## / # 标题：找到用例 section；内层 ### → 模块；####/##### → 扁平化
 *   3. 无 ### 时：## 下直接出现的 - tc-xxx → 「默认模块」
 *   4. 多层级列表：2空格 → precondition，4空格 → expected
 */
export function treeToUsecaseModules(root: MdNode): UsecaseModule[] {
  const modules: UsecaseModule[] = [];

  function walk(node: MdNode) {
    if (isNonCaseSection(node.title)) return;

    // Section wrappers (一、测试用例, 二、网络相关) — recurse into children
    if (isSectionWrapper(node.title)) {
      for (const child of node.children) {
        walk(child);
      }
      return;
    }

    const directCases = node.children.filter((c) => looksLikeCase(c.title));
    const headerChildren = node.children.filter((c) => isHeaderLike(c.title));

    // If this is a header-like node (###, ####, #####) with subtree cases,
    // it becomes a module — flatten all descendant cases into it.
    // But document-level headers (# Doc title) should recurse, not become modules.
    if (isHeaderLike(node.title) && headerChildren.length > 0 && directCases.length === 0) {
      const allCases = collectCasesFromNode(node);
      if (allCases.length > 0) {
        modules.push(moduleToUsecaseModule(node, allCases));
        return;
      }
    }

    // Direct cases: this node is a module (or case content directly under a header)
    if (directCases.length > 0) {
      modules.push(moduleToUsecaseModule(node, directCases));
      // Recurse into sibling headers (not cases)
      for (const child of node.children) {
        if (!looksLikeCase(child.title) && !isNonCaseSection(child.title)) {
          walk(child);
        }
      }
      return;
    }

    // Container with no direct cases: recurse into children
    if (headerChildren.length > 0) {
      for (const child of node.children) {
        walk(child);
      }
      return;
    }

    // Subtree cases (deeper nesting without intermediate headers)
    const allSubCases = collectCasesFromNode(node);
    if (allSubCases.length > 0) {
      modules.push(moduleToUsecaseModule(node, allSubCases));
      return;
    }

    // Nothing found, keep recursing
    for (const child of node.children) {
      walk(child);
    }
  }

  // Start walking from each root child
  for (const top of root.children) {
    walk(top);
  }

  // If nothing found, collect all cases from root tree → "默认模块"
  if (modules.length === 0) {
    const allCases = collectCasesFromNode(root);
    if (allCases.length > 0) {
      modules.push(moduleToUsecaseModule(
        { title: "默认模块", children: [] },
        allCases
      ));
    }
  }

  return modules;
}

/** Section-like header patterns (e.g. "一、测试用例", "二、网络相关") */
const SECTION_TITLE_RE = /^[一二三四五六七八九十]+[、.]/;

function isSectionWrapper(title: string): boolean {
  return SECTION_TITLE_RE.test(title) || title === "测试用例" || title === "root";
}

/** Convert a module-level MdNode and its case children to a UsecaseModule */
function moduleToUsecaseModule(modNode: MdNode, caseNodes: MdNode[]): UsecaseModule {
  const cases: UsecaseCase[] = [];
  let caseIdx = 0;

  for (const caseNode of caseNodes) {
    caseIdx++;
    const cm = caseNode.title.match(CASE_TITLE_RE);
    const id = cm ? cm[1] : `tc-${String(caseIdx).padStart(3, "0")}`;
    const priority = cm ? toPriority(cm[2].toUpperCase()) : "P2";
    const title = cm ? cm[3].trim() : caseNode.title;

    // Multi-level detail nodes under a case:
    //   depth-1:   - text  → precondition
    //   depth-2:     - text → expected (children of precondition nodes)
    const preconditionLines: string[] = [];
    const expectedLines: string[] = [];

    for (const detail of caseNode.children) {
      const t = detail.title;
      if (/^前置条件[：:]?/.test(t)) {
        preconditionLines.push(t.replace(/^前置条件[：:]?\s*/, ""));
      } else if (/^步骤[：:]?/.test(t)) {
        preconditionLines.push(t.replace(/^步骤[：:]?\s*/, ""));
      } else if (/^(预期结果|预期)[：:]?/.test(t)) {
        expectedLines.push(t.replace(/^(预期结果|预期)[：:]?\s*/, ""));
      } else {
        // Unprefixed: treat as precondition
        preconditionLines.push(t);
        // Grandchildren → expected
        for (const sub of detail.children) {
          expectedLines.push(sub.title);
        }
      }
    }

    const precondition = preconditionLines.join("\n").trim();
    const expected = expectedLines.join("\n").trim();

    cases.push({ id, title, priority, precondition, steps: "", expected, tags: "" });
  }

  // Use "默认模块" for section wrappers without a real module name
  const raw = isHeaderLike(modNode.title)
    ? modNode.title.replace(/^[\d.]+\s*/, "").trim()
    : modNode.title;
  const moduleName = isSectionWrapper(raw) ? "默认模块" : (raw || "默认模块");

  return { name: moduleName, open: true, cases };
}

/**
 * 从 Markdown 全文提取统计摘要。
 * 遍历全文匹配「合计：N个」「质量评X：N分」等模式。
 */
function extractSummary(markdown: string, modules: UsecaseModule[]): ParseSummary {
  let totalCases = 0;
  let qualityScore = 0;

  const totalMatch = markdown.match(/\*\*合计\*\*[：:]\s*(\d+)\s*个/);
  if (totalMatch) totalCases = parseInt(totalMatch[1], 10);

  const qualityMatch = markdown.match(/质量评[分估].*?(\d+)\s*分/i);
  if (qualityMatch) qualityScore = parseInt(qualityMatch[1], 10);

  // Fallback: count cases from parsed modules
  if (totalCases === 0) {
    totalCases = modules.reduce((s, m) => s + m.cases.length, 0);
  }

  return { totalCases, qualityScore, modules: modules.length };
}

/**
 * Parse dimension coverage from the '维度覆盖检查' section of the report.
 * Matches lines like: - 主流程（D1）：是，12个，已覆盖
 */
function parseDimensionCoverage(markdown: string): DimensionCoverage[] {
  // Find the section by keyword
  const pattern = /^#{2,3}\s+[一二三四五六七八九十\d]+[、.]\s*维度覆盖检查/m;
  const startMatch = markdown.match(pattern);
  if (!startMatch || startMatch.index === undefined) return [];

  const section = markdown.slice(startMatch.index);

  const results: DimensionCoverage[] = [];
  const lineRegex = /^-\s+(.+?)（(D\d+)）[：:]\s*(是|否)(?:，(\d+)?个)?/gm;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(section)) !== null) {
    const name = match[1].trim();
    const code = match[2];
    const covered = match[3] === "是";
    const caseCount = match[4] ? parseInt(match[4], 10) : 0;
    results.push({ name, code, covered, caseCount });
  }

  return results;
}

/**
 * Main entry point: parse a test case markdown file into tree + summary.
 * Uses Python-style parse_markdown for flexible structure detection.
 */
export function parseTestcaseMarkdown(markdown: string): ParseResult {
  const meta = extractMeta(markdown);

  // Remove code fences if present
  let cleaned = markdown;
  cleaned = cleaned.replace(/^```markdown\s*\n/m, "");
  cleaned = cleaned.replace(/^```\s*$/m, "");

  // Build generic tree (Python parse_markdown style)
  const tree = parseMarkdownToTree(cleaned);

  // Convert to UsecaseModule[] for wizard compatibility
  const modules = treeToUsecaseModules(tree);

  // Extract summary from parsed modules + markdown patterns
  const summary = extractSummary(markdown, modules);

  return {
    tree: modules.length > 0 ? modules : null,
    summary,
    meta,
    dimensions: parseDimensionCoverage(markdown),
  };
}

// Re-export from md-mindmap-convert for single source of truth
export { modulesToMarkdown } from "@/lib/md-mindmap-convert";
