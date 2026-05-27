import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getOutputPath, validatePath } from "@/lib/sandbox";
import fs from "fs/promises";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const taskId = params.id;
    const outputDir = getOutputPath(taskId);
    const fileName = req.nextUrl.searchParams.get("file");

    if (!fileName) {
      // List output files
      try {
        const files = await fs.readdir(outputDir);
        const fileList = files.map((f) => ({
          name: f,
          path: `/api/tasks/${taskId}/download?file=${encodeURIComponent(f)}`,
        }));
        return NextResponse.json({ files: fileList });
      } catch {
        return NextResponse.json({ files: [] });
      }
    }

    const filePath = path.resolve(outputDir, fileName);
    if (!validatePath(filePath, taskId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const content = await fs.readFile(filePath);
    const ext = path.extname(fileName).toLowerCase();

    const mimeTypes: Record<string, string> = {
      ".md": "text/markdown; charset=utf-8",
      ".xmind": "application/xml",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".json": "application/json; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".csv": "text/csv; charset=utf-8",
      ".pdf": "application/pdf",
    };

    return new NextResponse(content, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
