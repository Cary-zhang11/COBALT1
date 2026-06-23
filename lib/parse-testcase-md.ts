/**
 * Markdown → UsecaseModule[] 解析器
 *
 * 解析 prd-to-tests-new skill 生成的测试用例 .md 文件，
 * 提取模块树和统计摘要。
 *
 * 输入格式示例:
 *   ## 一、测试用例
 *   ### 1.1 模块名
 *   #### 1.1.1 子模块
 *   ##### 1.1.1.1 场景名
 *   - tc-001-p0：标题
 *     - 前置条件
 *       - 预期结果
 */

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

interface RawCase {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  preconditionLines: string[];
  expectedLines: string[];
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

/**
 * Extract a section by keyword matching instead of hardcoded section numbers.
 * Matches "## N、keyword" or "### N. keyword" (2-3 hashes) regardless of the number.
 */
function extractSectionByKeyword(
  markdown: string,
  startKeyword: string,
  endKeyword?: string
): string {
  const startPattern = new RegExp(
    `^#{2,3}\\s+[一二三四五六七八九十\\d]+[、.]\\s*${startKeyword}`,
    "m"
  );
  const startMatch = markdown.match(startPattern);
  if (!startMatch || startMatch.index === undefined) return "";

  const from = startMatch.index;
  let to = markdown.length;

  if (endKeyword) {
    const endPattern = new RegExp(
      `^#{2,3}\\s+[一二三四五六七八九十\\d]+[、.]\\s*${endKeyword}`,
      "m"
    );
    const rest = markdown.slice(from + 1);
    const endMatch = rest.match(endPattern);
    if (endMatch && endMatch.index !== undefined) {
      to = from + 1 + endMatch.index;
    }
  }

  return markdown.slice(from, to);
}

/**
 * Parse the '## 一、测试用例' section into modules + cases.
 */
function parseCasesSection(section: string): UsecaseModule[] {
  const lines = section.split("\n");
  const modules: UsecaseModule[] = [];
  let currentModule: UsecaseModule | null = null;
  let currentCases: UsecaseCase[] = [];

  // Buffer: accumulate multi-line case fields
  let rawCase: RawCase | null = null;
  let inPrecondition = false;
  let inExpected = false;

  function flushRawCase() {
    if (!rawCase) return;
    const c = rawCase;
    currentCases.push({
      id: c.id,
      title: c.title,
      priority: c.priority,
      precondition: c.preconditionLines.join("\n").trim(),
      steps: "",
      expected: c.expectedLines.join("\n").trim(),
      tags: "",
    });
    rawCase = null;
    inPrecondition = false;
    inExpected = false;
  }

  function flushModule() {
    if (currentModule && currentCases.length > 0) {
      modules.push({ ...currentModule, cases: [...currentCases] });
    }
    currentCases = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // --- Module header: ### 1.1 Name or ### 1.2 Name ---
    const modMatch = trimmed.match(/^###\s+[\d.]+\s+(.+)/);
    if (modMatch && !trimmed.startsWith("####")) {
      flushRawCase();
      flushModule();
      currentModule = { name: modMatch[1].trim(), open: true, cases: [] };
      continue;
    }

    // --- Skip sub-module (####) and scenario (#####) headers ---
    // We flatten them under the current module
    if (/^#{4,5}\s+/.test(trimmed)) {
      flushRawCase();
      continue;
    }

    // --- Test case: - tc-001-p0：title ---
    const caseMatch = trimmed.match(/^-\s+(tc-\d+)-(p\d)\s*[：:]\s*(.+)/i);
    if (caseMatch) {
      flushRawCase();
      if (!currentModule) {
        currentModule = { name: "默认模块", open: true, cases: [] };
      }
      rawCase = {
        id: caseMatch[1],
        title: caseMatch[3].trim(),
        priority: toPriority(caseMatch[2].toUpperCase()),
        preconditionLines: [],
        expectedLines: [],
      };
      inPrecondition = false;
      inExpected = false;
      continue;
    }

    // --- Case content lines ---
    if (rawCase) {
      // Expected: 4-space indent "    - text"
      if (/^    - /.test(line)) {
        inExpected = true;
        inPrecondition = false;
        rawCase.expectedLines.push(line.replace(/^    - /, "").trim());
        continue;
      }
      // Precondition: 2-space indent "  - text"
      if (/^  - /.test(line)) {
        inPrecondition = true;
        inExpected = false;
        rawCase.preconditionLines.push(line.replace(/^  - /, "").trim());
        continue;
      }
      // Continuation line (more indented content without bullet)
      if (line.startsWith("      ")) {
        const text = line.replace(/^\s{6}/, "").trim();
        if (text) {
          if (inExpected) rawCase.expectedLines.push(text);
          else if (inPrecondition) rawCase.preconditionLines.push(text);
        }
        continue;
      }
      // Empty line inside a case → separator between precond/expected blocks
      if (trimmed === "" && rawCase) {
        inPrecondition = false;
        inExpected = false;
        continue;
      }
    }
  }

  flushRawCase();
  flushModule();

  return modules;
}

/**
 * Parse the summary stats from the report section.
 */
function parseSummarySection(section: string): ParseSummary {
  let totalCases = 0;
  let qualityScore = 0;
  let modules = 0;

  // Total cases: **合计**：38个 or **合计：32个，占100%**
  const totalMatch = section.match(/\*\*合计\*\*[：:]\s*(\d+)\s*个/);
  if (totalMatch) {
    totalCases = parseInt(totalMatch[1], 10);
  }

  // Module count: count unique module entries in the case count table
  // Format: "- 1.1.1 模块名：N个，占比X%" or "- 模块名：N个，占比X%"
  const moduleCountMatches = section.match(
    /(?:###\s+3\.\s*用例数量统计[\s\S]*?)(- [^\n]+?\d+个[^\n]*)/g
  );
  if (moduleCountMatches) {
    // Count non-section entries
    const modLines = section.match(/- [\d.]+\s+\S.*?\d+个/g);
    modules = modLines ? modLines.length : 0;
  }

  // Quality score: from the document — scan for "质量评" patterns
  const qualityMatch = section.match(/质量评[分估].*?(\d+)\s*分/i);
  if (qualityMatch) {
    qualityScore = parseInt(qualityMatch[1], 10);
  }

  // Fallback module count from tree structure
  if (modules === 0) {
    const modHeaders = section.match(/###\s+[\d.]+\s+\S/g);
    if (modHeaders) modules = modHeaders.length;
  }

  return { totalCases, qualityScore, modules };
}

/**
 * Parse dimension coverage from the '维度覆盖检查' section of the report.
 * Matches lines like: - 主流程（D1）：是，12个，已覆盖
 */
function parseDimensionCoverage(markdown: string): DimensionCoverage[] {
  const section = extractSectionByKeyword(markdown, "维度覆盖检查");
  if (!section) return [];

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
 */
export function parseTestcaseMarkdown(markdown: string): ParseResult {
  const meta = extractMeta(markdown);

  // Find the cases section — parse all test-case bearing sections
  // Sections: 一(测试用例), 二(网络相关), 三(兼容性测试)
  // Stop before 四(埋点测试)/五(冒烟测试)/六(完整性检查) as those have different formats
  const casesSection = extractSectionByKeyword(
    markdown,
    "测试用例",
    "冒烟测试清单"
  );
  const tree = parseCasesSection(casesSection);

  // Find the report section for summary
  const reportSection = extractSectionByKeyword(
    markdown,
    "完整性检查报告"
  );
  const summary = parseSummarySection(reportSection);

  // If summary.totalCases is 0, compute from tree
  if (summary.totalCases === 0 && tree.length > 0) {
    summary.totalCases = tree.reduce((s, m) => s + m.cases.length, 0);
  }
  if (summary.modules === 0 && tree.length > 0) {
    summary.modules = tree.length;
  }

  return {
    tree: tree.length > 0 ? tree : null,
    summary,
    meta,
    dimensions: parseDimensionCoverage(markdown),
  };
}

// Re-export from md-mindmap-convert for single source of truth
export { modulesToMarkdown } from "@/lib/md-mindmap-convert";
