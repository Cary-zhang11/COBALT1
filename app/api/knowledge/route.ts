import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = [".md"];

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const search = req.nextUrl.searchParams.get("search") || "";
    const businessType = req.nextUrl.searchParams.get("businessType") || "";
    const type = req.nextUrl.searchParams.get("type") || "";
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
    const pageSizeRaw = parseInt(req.nextUrl.searchParams.get("pageSize") || "20", 10);
    const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }
    if (businessType) {
      if (businessType === "unclassified") {
        where.businessType = null;
      } else {
        where.businessType = businessType;
      }
    }
    if (type) {
      where.type = type;
    }

    const [items, total] = await Promise.all([
      prisma.knowledge.findMany({
        where,
        select: {
          id: true,
          title: true,
          content: true,
          businessType: true,
          type: true,
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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "";
    const submittedBusinessType = (formData.get("businessType") as string) || null;
    const submittedType = (formData.get("type") as string) || "knowledge";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // 校验文件后缀
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: "Only .md files are allowed" }, { status: 400 });
    }

    // 校验文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size exceeds 5MB limit" }, { status: 400 });
    }

    // 先创建 Knowledge 记录获取 uuid
    const knowledge = await prisma.knowledge.create({
      data: {
        title: title || file.name.replace(/\.md$/i, ""),
        content: "", // 临时值，下面更新为路径
        tags: [],
        businessType: submittedBusinessType || null,
        type: submittedType,
        userId,
      },
    });

    // 写入磁盘文件
    const subDir = submittedType === "history_uploaded" ? "history" : "knowledge";
    const targetDir = path.join(UPLOADS_ROOT, subDir);
    await mkdir(targetDir, { recursive: true });

    const filePath = path.join(subDir, `${knowledge.id}.md`);
    const absolutePath = path.join(UPLOADS_ROOT, filePath);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, buffer);

    // 更新 content 为相对路径
    const updated = await prisma.knowledge.update({
      where: { id: knowledge.id },
      data: { content: filePath },
    });

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error("Knowledge create error:", error);
    return NextResponse.json({ error: "Failed to create knowledge" }, { status: 500 });
  }
}
