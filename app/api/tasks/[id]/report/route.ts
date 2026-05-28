import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getOutputPath } from "@/lib/sandbox";
import { parseTestcaseMarkdown } from "@/lib/parse-testcase-md";
import fs from "fs/promises";
import path from "path";

async function collectOutputFiles(outputDir: string, taskId: string): Promise<{ name: string; path: string }[]> {
  const results: { name: string; path: string }[] = [];
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(outputDir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await collectOutputFiles(fullPath, taskId);
        results.push(...subFiles);
      } else {
        const relativePath = path.relative(outputDir, fullPath);
        results.push({
          name: entry.name,
          path: `/api/tasks/${taskId}/download?file=${encodeURIComponent(relativePath)}`,
        });
      }
    }
  } catch {
    // output dir may not exist
  }
  return results;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    // Verify task ownership
    const task = await prisma.task.findFirst({
      where: { id: params.id, userId },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const outputDir = getOutputPath(params.id);

    // Collect output file list for download URLs
    const outputFiles = await collectOutputFiles(outputDir, params.id);

    // Find and read the test case .md file
    let mdContent = "";
    try {
      const entries = await fs.readdir(outputDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.includes("测试用例") && entry.name.endsWith(".md")) {
          mdContent = await fs.readFile(path.join(outputDir, entry.name), "utf-8");
          break;
        }
        // Also check one level of subdirs
        if (entry.isDirectory()) {
          const subDir = path.join(outputDir, entry.name);
          try {
            const subEntries = await fs.readdir(subDir, { withFileTypes: true });
            for (const sub of subEntries) {
              if (sub.isFile() && sub.name.includes("测试用例") && sub.name.endsWith(".md")) {
                mdContent = await fs.readFile(path.join(subDir, sub.name), "utf-8");
                break;
              }
            }
          } catch { /* skip unreadable subdir */ }
          if (mdContent) break;
        }
      }
    } catch {
      // output dir may not exist
    }

    if (!mdContent) {
      return NextResponse.json({
        tree: null,
        summary: { totalCases: 0, qualityScore: 0, modules: 0 },
        rawMarkdown: "",
        outputFiles,
        meta: { sourceDoc: "", generatedAt: "", prdVersion: "" },
      });
    }

    const parsed = parseTestcaseMarkdown(mdContent);

    return NextResponse.json({
      tree: parsed.tree,
      summary: parsed.summary,
      rawMarkdown: mdContent,
      outputFiles,
      meta: parsed.meta,
      duration: task.duration,
    });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json(
      { error: "Failed to load report" },
      { status: 500 }
    );
  }
}
