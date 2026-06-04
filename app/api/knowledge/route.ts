import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const search = req.nextUrl.searchParams.get("search") || "";
    const tag = req.nextUrl.searchParams.get("tag") || "";
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
    const pageSize = 20;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }
    if (tag) {
      where.tags = { has: tag };
    }

    const [items, total] = await Promise.all([
      prisma.knowledge.findMany({
        where,
        select: {
          id: true,
          title: true,
          tags: true,
          refCount: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.knowledge.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, pageSize });
  } catch (error) {
    console.error("Knowledge list error:", error);
    return NextResponse.json({ error: "Failed to load knowledge" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    const body = await req.json();
    const { title, content, tags } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
    }

    const knowledge = await prisma.knowledge.create({
      data: {
        title,
        content,
        tags: tags || [],
        userId,
      },
    });

    return NextResponse.json(knowledge, { status: 201 });
  } catch (error) {
    console.error("Knowledge create error:", error);
    return NextResponse.json({ error: "Failed to create knowledge" }, { status: 500 });
  }
}
