import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getOutputPath, getWorkspacePath, validatePath } from "@/lib/sandbox";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

async function collectFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip the archive/ sub-directory entirely — it contains legacy
      // snapshots and must not be exposed in the wizard / history file lists.
      if (entry.isDirectory() && entry.name === "archive") continue;
      if (entry.isDirectory()) {
        const subFiles = await collectFilesRecursive(path.join(dir, entry.name));
        results.push(...subFiles);
      } else {
        results.push(path.join(dir, entry.name));
      }
    }
  } catch {
    // dir not found
  }
  return results;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const taskId = params.id;
    const dirParam = req.nextUrl.searchParams.get("dir"); // 可选：workspace | output
    const baseDir =
      dirParam === "workspace" ? getWorkspacePath(taskId) : getOutputPath(taskId);
    const outputDir = getOutputPath(taskId);
    const fileParam = req.nextUrl.searchParams.get("file");

    if (!fileParam) {
      const allFiles = await collectFilesRecursive(outputDir);
      const fileList = allFiles.map((fullPath) => {
        const name = path.basename(fullPath);
        const relativePath = path.relative(outputDir, fullPath);
        return {
          name,
          path: `/api/tasks/${taskId}/download?file=${encodeURIComponent(relativePath)}`,
        };
      });
      return NextResponse.json({ files: fileList });
    }

    const filePath = path.resolve(baseDir, fileParam);
    if (!validatePath(filePath, taskId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if file exists before reading
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: `File not found: ${fileParam}` }, { status: 404 });
    }

    const content = await fs.readFile(filePath);
    const ext = path.extname(fileParam).toLowerCase();

    const mimeTypes: Record<string, string> = {
      ".md": "text/markdown; charset=utf-8",
      ".xmind": "application/xml",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".json": "application/json; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".csv": "text/csv; charset=utf-8",
      ".pdf": "application/pdf",
    };

    const downloadName = path.basename(fileParam);
    return new NextResponse(content, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
