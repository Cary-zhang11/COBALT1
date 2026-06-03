import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  avgUserRating,
  ratingDistribution,
  latestFeedbackByTaskId,
} from "@/lib/stats-user-rating";

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

    // Business type distribution
    const categoryResult = await prisma.task.groupBy({
      by: ["businessType"],
      where: completedFilter,
      _count: true,
    });
    const categoryDistribution = categoryResult.map((r) => ({
      category: r.businessType || "未分类",
      count: r._count,
    }));

    // Dimension coverage
    const tasksWithDimensions = await prisma.task.findMany({
      where: { ...completedFilter, dimensionCoverage: { not: Prisma.DbNull } },
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

    const feedbackRows = await prisma.taskFeedback.findMany({
      select: { taskId: true, rating: true, comment: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const latestByTask = latestFeedbackByTaskId(feedbackRows);
    const allLatestRatings = Array.from(latestByTask.values()).map((f) => f.rating);

    const completedTasks = await prisma.task.findMany({
      where: completedFilter,
      select: { id: true },
    });
    const completedCount = completedTasks.length;
    const completedIdSet = new Set(completedTasks.map((t) => t.id));
    const ratedAmongCompleted = [...latestByTask.keys()].filter((id) =>
      completedIdSet.has(id)
    ).length;
    const userRatingRatePercent =
      completedCount > 0
        ? Math.round((ratedAmongCompleted / completedCount) * 100)
        : 0;

    const recent = await prisma.task.findMany({
      where: completedFilter,
      select: {
        id: true,
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

    // ---- 周同比计算 ----
    const now = new Date();
    const thisWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const lastWeekEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    function calcChangePercent(current: number, previous: number): number | null {
      if (previous === 0) return null;
      return Math.round(((current - previous) / previous) * 100);
    }

    const [thisWeekCases, lastWeekCases] = await Promise.all([
      prisma.task.aggregate({
        _sum: { totalCases: true },
        where: { ...completedFilter, createdAt: { gte: thisWeekStart } },
      }),
      prisma.task.aggregate({
        _sum: { totalCases: true },
        where: { ...completedFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
      }),
    ]);

    const [thisWeekUsers, lastWeekUsers] = await Promise.all([
      prisma.task.groupBy({
        by: ["userId"],
        where: { ...completedFilter, createdAt: { gte: thisWeekStart } },
      }),
      prisma.task.groupBy({
        by: ["userId"],
        where: { ...completedFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
      }),
    ]);

    const [thisWeekAvg, lastWeekAvg] = await Promise.all([
      prisma.task.aggregate({
        _avg: { qualityScore: true, duration: true },
        where: { ...completedFilter, createdAt: { gte: thisWeekStart } },
      }),
      prisma.task.aggregate({
        _avg: { qualityScore: true, duration: true },
        where: { ...completedFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
      }),
    ]);

    function avgRatingForWindow(start: Date, end?: Date): number {
      const taskIdsInWindow = allLatestRatings.length > 0
        ? (() => {
            // Use pre-filtered task IDs from the window
            const ids: string[] = [];
            for (const [taskId, fb] of latestByTask) {
              // We need to check if the task is in the window - use a simple approach:
              // Since we already fetched all completed task IDs, we can filter by createdAt
              // But we don't have task createdAt in latestByTask map. Use a different approach:
              ids.push(taskId);
            }
            return ids;
          })()
        : [];
      // Simpler approach: use the feedback rows directly, filtering by feedback createdAt
      // Actually, let's use a simpler approach that matches the other KPIs:
      // Get tasks in the window, then match their feedback
      return 0; // placeholder - replaced below
    }

    // Re-fetch window-specific task IDs for rating computation
    const [thisWeekTaskRows, lastWeekTaskRows] = await Promise.all([
      prisma.task.findMany({
        where: { ...completedFilter, createdAt: { gte: thisWeekStart } },
        select: { id: true },
      }),
      prisma.task.findMany({
        where: { ...completedFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
        select: { id: true },
      }),
    ]);

    function avgRatingForTaskIds(taskIds: string[]): number {
      if (taskIds.length === 0) return 0;
      const ratings = taskIds
        .map((id) => latestByTask.get(id)?.rating)
        .filter((r): r is number => r != null);
      if (ratings.length === 0) return 0;
      return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    }

    const thisWeekCaseCount = thisWeekCases._sum?.totalCases || 0;
    const lastWeekCaseCount = lastWeekCases._sum?.totalCases || 0;

    const kpiTrend = {
      totalCases: {
        current: thisWeekCaseCount,
        previous: lastWeekCaseCount,
        changePercent: calcChangePercent(thisWeekCaseCount, lastWeekCaseCount),
      },
      monthlyActiveUsers: {
        current: thisWeekUsers.length,
        previous: lastWeekUsers.length,
        changePercent: calcChangePercent(thisWeekUsers.length, lastWeekUsers.length),
      },
      avgQualityScore: {
        current: Math.round(thisWeekAvg._avg?.qualityScore || 0),
        previous: Math.round(lastWeekAvg._avg?.qualityScore || 0),
        changePercent: calcChangePercent(
          Math.round(thisWeekAvg._avg?.qualityScore || 0),
          Math.round(lastWeekAvg._avg?.qualityScore || 0)
        ),
      },
      avgDuration: {
        current: Math.round(thisWeekAvg._avg?.duration || 0),
        previous: Math.round(lastWeekAvg._avg?.duration || 0),
        changePercent: calcChangePercent(
          Math.round(thisWeekAvg._avg?.duration || 0),
          Math.round(lastWeekAvg._avg?.duration || 0)
        ),
      },
      avgUserRating: {
        current: avgRatingForTaskIds(thisWeekTaskRows.map((t) => t.id)),
        previous: avgRatingForTaskIds(lastWeekTaskRows.map((t) => t.id)),
        changePercent: calcChangePercent(
          avgRatingForTaskIds(thisWeekTaskRows.map((t) => t.id)),
          avgRatingForTaskIds(lastWeekTaskRows.map((t) => t.id))
        ),
      },
    };

    return NextResponse.json({
      kpi: {
        totalCases: totalAgg._sum?.totalCases || 0,
        monthlyActiveUsers: mauResult.length,
        avgQualityScore: Math.round(avgAgg._avg?.qualityScore || 0),
        avgDuration: Math.round(avgAgg._avg?.duration || 0),
        avgUserRating: avgUserRating(allLatestRatings),
      },
      kpiTrend,
      dailyTrend,
      categoryDistribution,
      dimensionCoverage,
      topUsers,
      userRatingDistribution: ratingDistribution(allLatestRatings),
      userRatingRate: {
        percent: userRatingRatePercent,
        ratedCount: ratedAmongCompleted,
        completedCount,
      },
      recentRecords: recent.map((r) => {
        const fb = latestByTask.get(r.id);
        return {
          time: r.createdAt.toLocaleDateString("zh-CN"),
          user: r.user?.name || "未知",
          req: (r.input || "").slice(0, 60),
          count: r.totalCases || 0,
          score: r.qualityScore || 0,
          tokens: r.tokenUsage || 0,
          category: r.category || "未分类",
          userRating: fb?.rating ?? null,
          userComment: fb?.comment ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
