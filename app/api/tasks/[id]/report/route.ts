import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getOutputPath } from "@/lib/sandbox";
import { parseTestcaseMarkdown } from "@/lib/parse-testcase-md";
import type { Prisma } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

async function findLatestMdFile(outputDir: string): Promise<string | null> {
  const candidates: { path: string; version: number }[] = [];

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
      } else if (entry.name.includes("测试用例") && entry.name.endsWith(".md")) {
        const m = entry.name.match(/_v(\d+)\.md$/);
        candidates.push({
          path: fullPath,
          version: m ? parseInt(m[1], 10) : 0,
        });
      }
    }
  }

  await walk(outputDir);
  candidates.sort((a, b) => b.version - a.version);
  return candidates[0]?.path ?? null;
}

async function collectFilesRelative(dir: string, base?: string): Promise<string[]> {
  const baseDir = base || dir;
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await collectFilesRelative(fullPath, baseDir);
        results.push(...subFiles);
      } else {
        results.push(path.relative(baseDir, fullPath));
      }
    }
  } catch {
    // dir not found
  }
  return results;
}

function normalizeOutputFilePaths(
  outputFiles: string[],
  outputDir: string
): string[] {
  return outputFiles.map((f) => {
    // If already a relative path (no backslash, no colon), return as-is
    if (!f.includes("\\") && !f.includes(":") && !f.startsWith("/")) {
      return f;
    }
    // Convert absolute path to relative
    try {
      return path.relative(outputDir, f);
    } catch {
      return path.basename(f);
    }
  });
}

function buildFileEntries(taskId: string, files: string[]) {
  return files.map((f) => ({
    name: path.basename(f),
    path: `/api/tasks/${taskId}/download?file=${encodeURIComponent(f)}`,
  }));
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

    let report = (task.report as Record<string, unknown>) || {};
    let fileList = task.outputFiles as string[];

    // Fallback: rebuild report from filesystem for tasks without DB report
    if (!task.report) {
      const outputDir = getOutputPath(params.id);

      // Normalize old absolute paths to relative
      fileList = normalizeOutputFilePaths(task.outputFiles as string[], outputDir);

      // Try to find and parse the md file from filesystem
      const mdPath = await findLatestMdFile(outputDir);
      if (mdPath) {
        try {
          const mdContent = await fs.readFile(mdPath, "utf-8");
          const parsed = parseTestcaseMarkdown(mdContent);
          report = {
            tree: parsed.tree,
            summary: parsed.summary,
            meta: parsed.meta,
          };
        } catch {
          console.error("Failed to parse md for task", params.id);
        }
      }

      // Persist the rebuilt report to DB (don't block response on this)
      prisma.task
        .update({
          where: { id: params.id },
          data: { report: report as Prisma.InputJsonValue, outputFiles: fileList },
        })
        .catch((err) => console.error("Failed to persist report for task", params.id, err));
    }

    const outputFiles = buildFileEntries(params.id, fileList);

    return NextResponse.json({
      tree: report.tree ?? null,
      summary: report.summary ?? { totalCases: 0, qualityScore: 0, modules: 0 },
      rawMarkdown: "",
      outputFiles,
      meta: report.meta ?? {},
      duration: task.duration,
      tweakCount: task.tweakCount,
      tweakHistory: task.tweakHistory,
    });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json(
      { error: "Failed to load report" },
      { status: 500 }
    );
  }
}
