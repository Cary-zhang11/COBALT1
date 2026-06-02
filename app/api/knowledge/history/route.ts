import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const search = req.nextUrl.searchParams.get("search") || "";
    const businessType = req.nextUrl.searchParams.get("businessType") || "";
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
    const pageSize = 20;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      status: { in: ["completed", "paused"] },
      report: { not: null },
    };
    if (search) {
      where.input = { contains: search, mode: "insensitive" };
    }
    if (businessType) {
      // "unclassified" 映射为 IS NULL
      if (businessType === "unclassified") {
        where.businessType = null;
      } else {
        where.businessType = businessType;
      }
    }

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          id: true,
          input: true,
          createdAt: true,
          totalCases: true,
          qualityScore: true,
          report: true,
          outputFiles: true,
          businessType: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({
      items: items.map((t) => {
        const report = t.report as Record<string, unknown> | null;
        const summary = report?.summary as Record<string, unknown> | undefined;
        const outputFiles = t.outputFiles as string[] | null;
        const mdFile = outputFiles?.find((f: string) => f.endsWith(".md") && f.includes("测试用例")) || "";
        return {
          id: t.id,
          req: (t.input || "").slice(0, 60),
          createdAt: t.createdAt.toLocaleDateString("zh-CN"),
          totalCases: t.totalCases || 0,
          qualityScore: t.qualityScore || 0,
          modules: summary?.modules as number || 0,
          userName: t.user?.name || "未知",
          mdFileName: mdFile,
          businessType: t.businessType || null,
        };
      }),
      total,
    });
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
