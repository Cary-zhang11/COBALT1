import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getOutputPath } from "@/lib/sandbox";
import { parseTestcaseMarkdown } from "@/lib/parse-testcase-md";
import fs from "fs/promises";
import path from "path";

const CACHE_FILE = ".report_cache.json";

async function collectOutputFiles(outputDir: string, taskId: string): Promise<{
  files: { name: string; path: string }[];
  mdPath: string | null;
  mdMtime: number;
}> {
  const files: { name: string; path: string }[] = [];
  const mdCandidates: { path: string; version: number; mtime: number }[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "archive") continue;
        await walk(fullPath);
      } else {
        const relativePath = path.relative(outputDir, fullPath);
        files.push({
          name: entry.name,
          path: `/api/tasks/${taskId}/download?file=${encodeURIComponent(relativePath)}`,
        });
        if (entry.name.includes("测试用例") && entry.name.endsWith(".md")) {
          try {
            const stat = await fs.stat(fullPath);
            const m = entry.name.match(/_v(\d+)\.md$/);
            mdCandidates.push({
              path: fullPath,
              version: m ? parseInt(m[1], 10) : 0,
              mtime: stat.mtimeMs,
            });
          } catch { /* skip */ }
        }
      }
    }
  }

  await walk(outputDir);
  mdCandidates.sort((a, b) => b.version - a.version);
  const best = mdCandidates[0];
  return { files, mdPath: best?.path ?? null, mdMtime: best?.mtime ?? 0 };
}

async function readCache(cachePath: string, mdMtime: number): Promise<unknown | null> {
  try {
    const stat = await fs.stat(cachePath);
    if (stat.mtimeMs >= mdMtime) {
      const raw = await fs.readFile(cachePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch { /* cache miss */ }
  return null;
}

async function writeCache(cachePath: string, data: unknown): Promise<void> {
  try {
    await fs.writeFile(cachePath, JSON.stringify(data), "utf-8");
  } catch { /* non-critical */ }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    const task = await prisma.task.findFirst({
      where: { id: params.id, userId },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const outputDir = getOutputPath(params.id);

    // Single pass: collect files + find test case .md
    const { files: outputFiles, mdPath, mdMtime } = await collectOutputFiles(outputDir, params.id);

    // Try file-based cache (persists across restarts, invalidated by md mtime)
    if (mdPath) {
      const cachePath = path.join(path.dirname(mdPath), CACHE_FILE);
      const cached = await readCache(cachePath, mdMtime);
      if (cached) {
        const data = cached as Record<string, unknown>;
        // Recompute outputFiles each time (download URLs may change)
        return NextResponse.json({ ...data, outputFiles });
      }
    }

    if (!mdPath) {
      return NextResponse.json({
        tree: null,
        summary: { totalCases: 0, qualityScore: 0, modules: 0 },
        rawMarkdown: "",
        outputFiles,
        meta: { sourceDoc: "", generatedAt: "", prdVersion: "" },
      });
    }

    // Cold path: read and parse the markdown
    const mdContent = await fs.readFile(mdPath, "utf-8");
    const parsed = parseTestcaseMarkdown(mdContent);

    const data = {
      tree: parsed.tree,
      summary: parsed.summary,
      rawMarkdown: mdContent,
      outputFiles,
      meta: parsed.meta,
      duration: task.duration,
    };

    // Persist cache for next request
    const cachePath = path.join(path.dirname(mdPath), CACHE_FILE);
    await writeCache(cachePath, data);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json(
      { error: "Failed to load report" },
      { status: 500 }
    );
  }
}
