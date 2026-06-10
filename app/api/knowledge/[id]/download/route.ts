import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const knowledge = await prisma.knowledge.findUnique({
      where: { id: params.id },
      select: { title: true, content: true },
    });

    if (!knowledge) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!knowledge.content) {
      return NextResponse.json({ error: "No file content" }, { status: 404 });
    }

    // 路径安全校验 — 防止路径穿越
    const absolutePath = path.resolve(UPLOADS_ROOT, knowledge.content);
    if (!absolutePath.startsWith(UPLOADS_ROOT)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const content = await readFile(absolutePath, "utf-8");

    // ?download=1 触发下载，否则返回纯文本（预览用）
    const isDownload = req.nextUrl.searchParams.get("download") === "1";

    if (isDownload) {
      const filename = `${knowledge.title}.md`;
      return new NextResponse(content, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    return new NextResponse(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Knowledge download error:", error);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
