import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

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
    const { title, content, tags } = body;

    const knowledge = await prisma.knowledge.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(tags !== undefined && { tags }),
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

    await prisma.knowledge.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Knowledge delete error:", error);
    return NextResponse.json({ error: "Failed to delete knowledge" }, { status: 500 });
  }
}
