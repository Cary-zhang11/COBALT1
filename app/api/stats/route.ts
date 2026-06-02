import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const completedFilter = {
      status: { in: ["completed", "paused"] },
    };

    // KPI
    const [totalAgg, avgAgg] = await Promise.all([
      prisma.task.aggregate({
        _sum: { totalCases: true },
        where: completedFilter,
      }),
      prisma.task.aggregate({
        _avg: { qualityScore: true, duration: true, tokenUsage: true },
        where: completedFilter,
      }),
    ]);

    // Monthly active users
    const mauResult = await prisma.task.groupBy({
      by: ["userId"],
      where: { ...completedFilter, createdAt: { gte: monthAgo } },
    });

    // Daily trend (last 30 days)
    const dailyTasks = await prisma.task.findMany({
      where: { ...completedFilter, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, qualityScore: true },
      orderBy: { createdAt: "asc" },
    });
    const dailyMap = new Map<string, { count: number; scores: number[] }>();
    for (const t of dailyTasks) {
      const date = t.createdAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(date) || { count: 0, scores: [] };
      entry.count++;
      if (t.qualityScore != null) entry.scores.push(t.qualityScore);
      dailyMap.set(date, entry);
    }
    const dailyTrend = Array.from(dailyMap.entries()).map(([date, v]) => ({
      date,
      count: v.count,
      avgScore: v.scores.length > 0
        ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length)
        : 0,
    }));

    // Category distribution
    const categoryResult = await prisma.task.groupBy({
      by: ["category"],
      where: completedFilter,
      _count: true,
    });
    const categoryDistribution = categoryResult.map((r) => ({
      category: r.category || "未分类",
      count: r._count,
    }));

    // Dimension coverage
    const tasksWithDimensions = await prisma.task.findMany({
      where: { ...completedFilter, dimensionCoverage: { not: null } },
      select: { dimensionCoverage: true },
    });
    const dimMap = new Map<string, { covered: number; total: number }>();
    for (const t of tasksWithDimensions) {
      const dims = t.dimensionCoverage as Array<{ name: string; covered: boolean }> | null;
      if (!dims) continue;
      for (const d of dims) {
        const entry = dimMap.get(d.name) || { covered: 0, total: 0 };
        entry.total++;
        if (d.covered) entry.covered++;
        dimMap.set(d.name, entry);
      }
    }
    const dimensionCoverage = Array.from(dimMap.entries()).map(([name, v]) => ({
      name,
      covered: v.covered,
      total: v.total,
    }));

    // Top users
    const userResult = await prisma.task.groupBy({
      by: ["userId"],
      where: completedFilter,
      _count: true,
      orderBy: { _count: { userId: "desc" } },
      take: 10,
    });
    const userIds = userResult.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name || u.id]));
    const topUsers = userResult.map((r) => ({
      userName: userMap.get(r.userId) || r.userId,
      count: r._count,
    }));

    // Efficiency
    const totalCompleted = await prisma.task.count({ where: completedFilter });
    const editedCount = await prisma.task.count({
      where: { ...completedFilter, tweakCount: { gt: 0 } },
    });

    // Recent records
    const recent = await prisma.task.findMany({
      where: completedFilter,
      select: {
        createdAt: true,
        input: true,
        totalCases: true,
        qualityScore: true,
        tokenUsage: true,
        category: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      kpi: {
        totalCases: totalAgg._sum?.totalCases || 0,
        monthlyActiveUsers: mauResult.length,
        avgQualityScore: Math.round(avgAgg._avg?.qualityScore || 0),
        avgDuration: Math.round(avgAgg._avg?.duration || 0),
      },
      dailyTrend,
      categoryDistribution,
      dimensionCoverage,
      topUsers,
      efficiency: {
        avgScore: Math.round(avgAgg._avg?.qualityScore || 0),
        avgDuration: Math.round(avgAgg._avg?.duration || 0),
        avgTokens: Math.round(avgAgg._avg?.tokenUsage || 0),
        editRate: totalCompleted > 0 ? Math.round((editedCount / totalCompleted) * 100) / 100 : 0,
      },
      recentRecords: recent.map((r) => ({
        time: r.createdAt.toLocaleDateString("zh-CN"),
        user: r.user?.name || "未知",
        req: (r.input || "").slice(0, 60),
        count: r.totalCases || 0,
        score: r.qualityScore || 0,
        tokens: r.tokenUsage || 0,
        category: r.category || "未分类",
      })),
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
