import type { UsecaseModule } from "./types";

interface ParseResult {
  tree: UsecaseModule[] | null;
  summary?: {
    totalCases: number;
    qualityScore: number;
    modules: number;
  };
  rawOutput: string;
}

export function parseUsecaseOutput(output: string | null): ParseResult {
  const fallback: ParseResult = { tree: null, rawOutput: output || "" };

  if (!output || !output.trim()) return fallback;

  let parsed: Record<string, unknown> | null = null;

  // Step 1: Direct JSON.parse
  try {
    parsed = JSON.parse(output);
  } catch {}

  // Step 2: Extract ```json ... ``` or ``` ... ``` code block
  if (!parsed) {
    const jsonBlockMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonBlockMatch?.[1]) {
      try {
        parsed = JSON.parse(jsonBlockMatch[1]);
      } catch {}
    }
  }

  // Step 3: Find first { to last }
  if (!parsed) {
    const firstBrace = output.indexOf("{");
    const lastBrace = output.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(output.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
  }

  if (!parsed) return fallback;

  return normalizeResult(parsed, output);
}

function normalizeResult(parsed: Record<string, unknown>, raw: string): ParseResult {
  const result: ParseResult = { tree: null, rawOutput: raw };

  const modulesRaw = (parsed.modules || parsed.tree) as Array<Record<string, unknown>> | undefined;

  if (Array.isArray(modulesRaw) && modulesRaw.length > 0) {
    result.tree = modulesRaw.map((mod: Record<string, unknown>, mi: number) => ({
      name: String(mod.name || `${mi + 1}`),
      open: mi === 0,
      cases: Array.isArray(mod.cases)
        ? (mod.cases as Array<Record<string, unknown>>).map((c: Record<string, unknown>, ci: number) => ({
            id: String(c.id || `c${ci + 1}`),
            title: String(c.title || ""),
            priority: (["P0", "P1", "P2"].includes(String(c.priority)) ? String(c.priority) : "P2") as "P0" | "P1" | "P2",
            precondition: String(c.precondition || ""),
            steps: String(c.steps || ""),
            expected: String(c.expected || ""),
            tags: String(c.tags || ""),
          }))
        : [],
    }));
  }

  const summary = parsed.summary as Record<string, unknown> | undefined;
  if (summary && typeof summary === "object") {
    result.summary = {
      totalCases: Number(summary.totalCases) || (result.tree ? result.tree.reduce((sum, m) => sum + m.cases.length, 0) : 0),
      qualityScore: Number(summary.qualityScore) || 0,
      modules: Number(summary.modules) || (result.tree ? result.tree.length : 0),
    };
  } else if (result.tree) {
    result.summary = {
      totalCases: result.tree.reduce((sum, m) => sum + m.cases.length, 0),
      qualityScore: 0,
      modules: result.tree.length,
    };
  }

  return result;
}
