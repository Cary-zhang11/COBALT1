import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const knowledge = await prisma.knowledge.findUnique({
      where: { id: params.id },
      include: { user: { select: { name: true } } },
    });

    if (!knowledge) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(knowledge);
  } catch (error) {
    console.error("Knowledge get error:", error);
    return NextResponse.json({ error: "Failed to load knowledge" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const body = await req.json();
    const { title, content, businessType } = body;

    // 如果传了 content（编辑后文本），写回磁盘文件
    if (content !== undefined) {
      const existing = await prisma.knowledge.findUnique({
        where: { id: params.id },
        select: { content: true },
      });
      if (existing?.content) {
        const absolutePath = path.join(UPLOADS_ROOT, existing.content);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content, "utf-8");
      }
    }

    const knowledge = await prisma.knowledge.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(businessType !== undefined && { businessType }),
      },
    });

    return NextResponse.json(knowledge);
  } catch (error) {
    console.error("Knowledge update error:", error);
    return NextResponse.json({ error: "Failed to update knowledge" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    // 先获取 content 路径以删除磁盘文件
    const knowledge = await prisma.knowledge.findUnique({
      where: { id: params.id },
      select: { content: true },
    });

    await prisma.knowledge.delete({ where: { id: params.id } });

    // 删磁盘文件（文件不存在时不阻塞）
    if (knowledge?.content) {
      try {
        const absolutePath = path.join(UPLOADS_ROOT, knowledge.content);
        await unlink(absolutePath);
      } catch {
        // 文件不存在时忽略
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Knowledge delete error:", error);
    return NextResponse.json({ error: "Failed to delete knowledge" }, { status: 500 });
  }
}
