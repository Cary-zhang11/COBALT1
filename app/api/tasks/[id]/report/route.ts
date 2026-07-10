import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getOutputPath, getWorkspacePath } from "@/lib/sandbox";
import { parseTestcaseMarkdown } from "@/lib/parse-testcase-md";
import type { Prisma } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

/**
 * startGenerate 会把参考文件说明拼接到 input 末尾，形如：
 *   {原始文案}

---
## 工作目录参考文件说明
...
 * 详情页只需要展示用户实际写的文案，做一次简单还原。
 */
function extractOriginalInputText(rawInput: string | null | undefined): string {
  if (!rawInput) return "";
  const marker = "\n\n---\n## 工作目录参考文件说明";
  const idx = rawInput.indexOf(marker);
  const trimmed = idx >= 0 ? rawInput.slice(0, idx) : rawInput;
  return trimmed
    .replace(/\n\n\[附件:[^\]]*\]\s*$/g, "")
    .replace(/^上传文件:[^\n]*(\n|$)/, "")
    .trim();
}

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
      } else if (
        entry.name.includes("测试用例") &&
        entry.name.endsWith(".md") &&
        // Detail / wizard step3 must always reflect the original source md.
        // The .edited.md sibling produced by the xmind editor is intentionally
        // ignored here so user edits don't mutate the parsed tree / KPI.
        !entry.name.includes(".edited.")
      ) {
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

/**
 * 扫描 workspace 子目录（knowledge/history），返回文件名列表。
 * 供详情结果页右侧「输入物料」区块回显关联的知识库与历史范文。
 */
async function listReferenceFileNames(
  taskId: string,
  subdir: "knowledge" | "history",
): Promise<string[]> {
  try {
    const dir = path.join(getWorkspacePath(taskId), subdir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const task = await prisma.task.findUnique({
      where: { id: params.id },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    let report = (task.report as Record<string, unknown>) || {};
    let fileList = task.outputFiles as string[];

    // Always scan filesystem for latest files (DB may be stale between write and saveOutputAndReport)
    const outputDir = getOutputPath(params.id);
    const fsFiles = await collectFilesRelative(outputDir);
    if (fsFiles.length > 0) {
      fileList = fsFiles;
    }

    // Try filesystem parse for latest tree (DB report may be stale during tweak)
    let duration = task.duration;
    const mdPath = await findLatestMdFile(outputDir);
    if (mdPath) {
      try {
        const mdContent = await fs.readFile(mdPath, "utf-8");
        const parsed = parseTestcaseMarkdown(mdContent);
        if (parsed.tree) {
          report = {
            tree: parsed.tree,
            summary: parsed.summary,
            meta: parsed.meta,
          };
          // Duration: use DB value if set, otherwise fall back to file mtime
          if (duration == null) {
            try {
              const stat = await fs.stat(mdPath);
              duration = Math.max(0, stat.mtimeMs - task.createdAt.getTime());
            } catch {
              // stat failed, leave duration as null
            }
          }
        }
      } catch {
        console.error("Failed to parse md for task", params.id);
      }
    }

    // Persist to DB if changed (don't block response)
    if (!task.report || fsFiles.length > 0 || (task.duration == null && duration != null)) {
      prisma.task
        .update({
          where: { id: params.id },
          data: {
            report: report as Prisma.InputJsonValue,
            outputFiles: fileList,
            ...(task.duration == null && duration != null ? { duration } : {}),
          },
        })
        .catch((err) => console.error("Failed to persist report for task", params.id, err));
    }

    const outputFiles = buildFileEntries(params.id, fileList);

    // Re-read tweakHistory — P0 may have updated it during filesystem scan + MD parse
    let tweakHistory = task.tweakHistory;
    try {
      const fresh = await prisma.task.findUnique({
        where: { id: params.id },
        select: { tweakHistory: true },
      });
      if (fresh?.tweakHistory) tweakHistory = fresh.tweakHistory;
    } catch { /* keep stale value on error */ }

    // 输入物料回显：需求文件、需求文案（还原）、关联知识库、历史范文
    const [knowledgeRefs, historyRefs] = await Promise.all([
      listReferenceFileNames(params.id, "knowledge"),
      listReferenceFileNames(params.id, "history"),
    ]);
    const inputFileNames = (task.inputFiles || []).map((p) => path.basename(p));
    const requirementText = extractOriginalInputText(task.input);

    console.log(`[report] taskId="${params.id}" status="${task.status}" duration=${task.duration} outputFiles=${fileList.length}`);
    return NextResponse.json({
      status: task.status,
      tree: report.tree ?? null,
      summary: report.summary ?? { totalCases: 0, qualityScore: 0, modules: 0 },
      rawMarkdown: "",
      outputFiles,
      meta: report.meta ?? {},
      duration,
      tweakCount: task.tweakCount,
      tweakHistory,
      materials: {
        requirementFiles: inputFileNames,
        requirementText,
        knowledgeItems: knowledgeRefs,
        historyItems: historyRefs,
      },
      usability: {
        usabilityRate: task.usabilityRate,
        reviewDuration: task.reviewDuration,
        manualDuration: task.manualDuration,
        aiDurationMinutes: task.duration != null
          ? Math.max(0, Math.round(task.duration / 60000))
          : null,
      },
    });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json(
      { error: "Failed to load report" },
      { status: 500 }
    );
  }
}
