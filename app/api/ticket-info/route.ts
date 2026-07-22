import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ticketId = searchParams.get("ticketId") || undefined;
    const userName = searchParams.get("userName") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo   = searchParams.get("dateTo")   || undefined;

    const where: Record<string, unknown> = { status: "completed" };

    if (ticketId) {
      where.ticketId = ticketId;
    }

    if (userName) {
      where.user = { name: { contains: userName } };
    }

    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? {
          lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999))
        } : {}),
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        ticketId: true,
        totalCases: true,
        usabilityRate: true,
        manualDuration: true,
        reviewDuration: true,
        businessType: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        ticketId: t.ticketId,
        ticketUrl: t.ticketId
          ? `https://xz.corpautohome.com/requirement/detail/${t.ticketId}`
          : null,
        userName: t.user?.name || "未知",
        totalCases: t.totalCases,
        caseFileCount: 3,
        usabilityRate: t.usabilityRate,
        manualDuration: t.manualDuration,
        reviewDuration: t.reviewDuration,
        businessType: t.businessType,
        createdAt: formatDateTime(t.createdAt),
      })),
    });
  } catch (error) {
    console.error("Ticket info error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
