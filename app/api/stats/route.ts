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
import {
  parseKpiRange,
  parseChartRange,
  getKpiDateWindow,
  getChartStartDate,
  extractReqIdentifier,
  calcChangePercent,
  shortChartOptions,
  parseCustomDate,
  getCustomKpiWindow,
} from "@/lib/stats-time-range";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    // 解析 query 参数
    const { searchParams } = new URL(req.url);
    const kpiRange = parseKpiRange(searchParams.get("kpiRange"));
    const trendRange = parseChartRange(searchParams.get("trendRange"));
    const categoryRange = parseChartRange(searchParams.get("categoryRange"), shortChartOptions());
    const dimensionRange = parseChartRange(searchParams.get("dimensionRange"), shortChartOptions());
    const ratingRange = parseChartRange(searchParams.get("ratingRange"), shortChartOptions());
    const userRange = parseChartRange(searchParams.get("userRange"), shortChartOptions());
    const recordRange = parseChartRange(searchParams.get("recordRange"));

    // 解析自定义日期参数（7 组 × 2 = 14 个）
    const kpiCustomStart = parseCustomDate(searchParams.get("kpiStart"));
    const kpiCustomEnd = parseCustomDate(searchParams.get("kpiEnd"));
    const trendCustomStart = parseCustomDate(searchParams.get("trendStart"));
    const trendCustomEnd = parseCustomDate(searchParams.get("trendEnd"));
    const categoryCustomStart = parseCustomDate(searchParams.get("categoryStart"));
    const categoryCustomEnd = parseCustomDate(searchParams.get("categoryEnd"));
    const dimensionCustomStart = parseCustomDate(searchParams.get("dimensionStart"));
    const dimensionCustomEnd = parseCustomDate(searchParams.get("dimensionEnd"));
    const ratingCustomStart = parseCustomDate(searchParams.get("ratingStart"));
    const ratingCustomEnd = parseCustomDate(searchParams.get("ratingEnd"));
    const userCustomStart = parseCustomDate(searchParams.get("userStart"));
    const userCustomEnd = parseCustomDate(searchParams.get("userEnd"));
    const recordCustomStart = parseCustomDate(searchParams.get("recordStart"));
    const recordCustomEnd = parseCustomDate(searchParams.get("recordEnd"));

    // 辅助函数：根据 range 和自定义日期构建 createdAt 过滤条件
    function buildDateFilter(range: string, customStart: Date | null, customEnd: Date | null): object {
      if (range === "all") return {};
      if (range === "custom" && customStart && customEnd) {
        const endInclusive = new Date(customEnd);
        endInclusive.setDate(endInclusive.getDate() + 1);
        return { createdAt: { gte: customStart, lt: endInclusive } };
      }
      const start = getChartStartDate(range as any);
      return start ? { createdAt: { gte: start } } : {};
    }

    // 统计不按任务状态过滤，所有任务均计入
    const completedFilter = {};

    // KPI 时间窗口
    const kpiWindow = kpiRange === "custom" && kpiCustomStart && kpiCustomEnd
      ? getCustomKpiWindow(kpiCustomStart, kpiCustomEnd)
      : getKpiDateWindow(kpiRange);
    const kpiTimeFilter = kpiWindow
      ? { ...completedFilter, createdAt: kpiRange === "custom" && kpiCustomEnd
          ? { gte: kpiWindow.currentStart, lt: (() => { const d = new Date(kpiCustomEnd); d.setDate(d.getDate() + 1); return d; })() }
          : { gte: kpiWindow.currentStart } }
      : completedFilter;

    // ---- 反馈数据（全量，用于评价率和最近记录） ----
    const feedbackRows = await prisma.taskFeedback.findMany({
      select: { taskId: true, rating: true, comment: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const latestByTask = latestFeedbackByTaskId(feedbackRows);
    const allLatestRatings = Array.from(latestByTask.values()).map((f) => f.rating);

    function avgRatingForTaskIds(taskIds: string[]): number {
      if (taskIds.length === 0) return 0;
      const ratings = taskIds
        .map((id) => latestByTask.get(id)?.rating)
        .filter((r): r is number => r != null);
      if (ratings.length === 0) return 0;
      return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    }

    // ---- KPI 值 + kpiTrend 计算 ----
    let kpiValues: {
      totalCases: number;
      weeklyActiveUsers: number;
      avgDuration: number;
      avgUserRating: number;
      tasksPerWeek: number;
      requirementsPerWeek: number;
    };
    let kpiTrend: {
      totalCases: { current: number; previous: number; changePercent: number | null };
      weeklyActiveUsers: { current: number; previous: number; changePercent: number | null };
      avgDuration: { current: number; previous: number; changePercent: number | null };
      avgUserRating: { current: number; previous: number; changePercent: number | null };
      tasksPerWeek: { current: number; previous: number; changePercent: number | null };
      requirementsPerWeek: { current: number; previous: number; changePercent: number | null };
    };

    if (kpiWindow) {
      // 有时间窗口：查询两窗口数据，内存计算 KPI 值和同比
      const [currentTasks, previousTasks] = await Promise.all([
        prisma.task.findMany({
          where: { ...completedFilter, ...(kpiRange === "custom" && kpiCustomEnd
            ? { createdAt: { gte: kpiWindow.currentStart, lt: (() => { const d = new Date(kpiCustomEnd); d.setDate(d.getDate() + 1); return d; })() } }
            : { createdAt: { gte: kpiWindow.currentStart } }) },
          select: { id: true, totalCases: true, duration: true, userId: true, inputFiles: true },
        }),
        prisma.task.findMany({
          where: { ...completedFilter, createdAt: { gte: kpiWindow.previousStart, lt: kpiWindow.previousEnd } },
          select: { id: true, totalCases: true, duration: true, userId: true, inputFiles: true },
        }),
      ]);

      const thisCaseSum = currentTasks.reduce((s, t) => s + (t.totalCases || 0), 0);
      const lastCaseSum = previousTasks.reduce((s, t) => s + (t.totalCases || 0), 0);
      const thisUsers = new Set(currentTasks.map((t) => t.userId)).size;
      const lastUsers = new Set(previousTasks.map((t) => t.userId)).size;
      const thisDur = currentTasks.length > 0
        ? Math.round(currentTasks.reduce((s, t) => s + (t.duration || 0), 0) / currentTasks.length)
        : 0;
      const lastDur = previousTasks.length > 0
        ? Math.round(previousTasks.reduce((s, t) => s + (t.duration || 0), 0) / previousTasks.length)
        : 0;
      const thisTaskCount = currentTasks.length;
      const lastTaskCount = previousTasks.length;

      const thisReqIds = new Set(currentTasks.map((t) => extractReqIdentifier(t.id, t.inputFiles)));
      const lastReqIds = new Set(previousTasks.map((t) => extractReqIdentifier(t.id, t.inputFiles)));

      const thisRating = avgRatingForTaskIds(currentTasks.map((t) => t.id));
      const lastRating = avgRatingForTaskIds(previousTasks.map((t) => t.id));

      kpiValues = {
        totalCases: thisCaseSum,
        weeklyActiveUsers: thisUsers,
        avgDuration: thisDur,
        avgUserRating: thisRating,
        tasksPerWeek: thisTaskCount,
        requirementsPerWeek: thisReqIds.size,
      };

      kpiTrend = {
        totalCases: { current: thisCaseSum, previous: lastCaseSum, changePercent: calcChangePercent(thisCaseSum, lastCaseSum) },
        weeklyActiveUsers: { current: thisUsers, previous: lastUsers, changePercent: calcChangePercent(thisUsers, lastUsers) },
        avgDuration: { current: thisDur, previous: lastDur, changePercent: calcChangePercent(thisDur, lastDur) },
        avgUserRating: { current: thisRating, previous: lastRating, changePercent: calcChangePercent(thisRating, lastRating) },
        tasksPerWeek: { current: thisTaskCount, previous: lastTaskCount, changePercent: calcChangePercent(thisTaskCount, lastTaskCount) },
        requirementsPerWeek: { current: thisReqIds.size, previous: lastReqIds.size, changePercent: calcChangePercent(thisReqIds.size, lastReqIds.size) },
      };

      // ===== DEBUG: 打印同比计算的原始数据 =====
      console.log("[stats] kpiRange:", kpiRange);
      console.log("[stats] 时间窗口:", {
        currentStart: kpiWindow!.currentStart.toISOString(),
        previousStart: kpiWindow!.previousStart.toISOString(),
        previousEnd: kpiWindow!.previousEnd.toISOString(),
      });
      console.log("[stats] 当前窗口任务数:", currentTasks.length, "上期窗口任务数:", previousTasks.length);
      console.log("[stats] 同比原始数据:", {
        totalCases:        { current: thisCaseSum,    previous: lastCaseSum,    changePercent: calcChangePercent(thisCaseSum, lastCaseSum) },
        weeklyActiveUsers: { current: thisUsers,      previous: lastUsers,      changePercent: calcChangePercent(thisUsers, lastUsers) },
        avgDuration:       { current: thisDur,        previous: lastDur,        changePercent: calcChangePercent(thisDur, lastDur) },
        avgUserRating:     { current: thisRating,     previous: lastRating,     changePercent: calcChangePercent(thisRating, lastRating) },
        tasksPerWeek:      { current: thisTaskCount,  previous: lastTaskCount,  changePercent: calcChangePercent(thisTaskCount, lastTaskCount) },
        requirementsPerWeek:{ current: thisReqIds.size, previous: lastReqIds.size, changePercent: calcChangePercent(thisReqIds.size, lastReqIds.size) },
      });
      // ===== DEBUG END =====
    } else {
      // all 模式：KPI 值取全量，同比为 null
      const [totalAgg, avgDurAgg, taskCount, reqTasks] = await Promise.all([
        prisma.task.aggregate({
          _sum: { totalCases: true },
          where: completedFilter,
        }),
        prisma.task.aggregate({
          _avg: { duration: true },
          where: completedFilter,
        }),
        prisma.task.count({ where: completedFilter }),
        prisma.task.findMany({
          where: completedFilter,
          select: { id: true, inputFiles: true },
        }),
      ]);
      const wauResult = await prisma.task.groupBy({
        by: ["userId"],
        where: completedFilter,
      });
      const reqIdSet = new Set(reqTasks.map((t) => extractReqIdentifier(t.id, t.inputFiles)));

      kpiValues = {
        totalCases: totalAgg._sum?.totalCases || 0,
        weeklyActiveUsers: wauResult.length,
        avgDuration: Math.round(avgDurAgg._avg?.duration || 0),
        avgUserRating: avgUserRating(allLatestRatings),
        tasksPerWeek: taskCount,
        requirementsPerWeek: reqIdSet.size,
      };

      kpiTrend = {
        totalCases: { current: 0, previous: 0, changePercent: null },
        weeklyActiveUsers: { current: 0, previous: 0, changePercent: null },
        avgDuration: { current: 0, previous: 0, changePercent: null },
        avgUserRating: { current: 0, previous: 0, changePercent: null },
        tasksPerWeek: { current: 0, previous: 0, changePercent: null },
        requirementsPerWeek: { current: 0, previous: 0, changePercent: null },
      };
    }

    // ---- Daily trend（使用 trendRange） ----
    const trendDateFilter = buildDateFilter(trendRange, trendCustomStart, trendCustomEnd);
    const trendStart = trendRange === "custom" && trendCustomStart ? trendCustomStart : getChartStartDate(trendRange);
    const dailyTasks = await prisma.task.findMany({
      where: { ...completedFilter, ...trendDateFilter },
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
    // 补全范围内没有任务的日期（count=0）
    const trendEndDate = trendRange === "custom" && trendCustomEnd ? new Date(trendCustomEnd.getTime() + 86400000) : new Date();
    const trendRangeStart = trendStart || (dailyTasks.length > 0 ? dailyTasks[0].createdAt : trendEndDate);
    const fillCursor = new Date(trendRangeStart);
    fillCursor.setUTCHours(0, 0, 0, 0);
    while (fillCursor <= trendEndDate) {
      const dateStr = fillCursor.toISOString().slice(0, 10);
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { count: 0, scores: [] });
      }
      fillCursor.setUTCDate(fillCursor.getUTCDate() + 1);
    }
    const dailyTrend = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        count: v.count,
        avgScore: v.scores.length > 0
          ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length)
          : 0,
      }));

    // ---- Category distribution（使用 categoryRange） ----
    const categoryDateFilter = buildDateFilter(categoryRange, categoryCustomStart, categoryCustomEnd);
    const categoryResult = await prisma.task.groupBy({
      by: ["businessType"],
      where: { ...completedFilter, ...categoryDateFilter },
      _count: true,
    });
    const categoryDistribution = categoryResult.map((r) => ({
      category: r.businessType || "未分类",
      count: r._count,
    }));

    // ---- Dimension coverage（使用 dimensionRange） ----
    const dimensionDateFilter = buildDateFilter(dimensionRange, dimensionCustomStart, dimensionCustomEnd);
    const tasksWithDimensions = await prisma.task.findMany({
      where: {
        ...completedFilter,
        ...dimensionDateFilter,
        dimensionCoverage: { not: Prisma.DbNull },
      },
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

    // ---- Top users（使用 userRange，移除 take 限制） ----
    const userDateFilter = buildDateFilter(userRange, userCustomStart, userCustomEnd);
    const userResult = await prisma.task.groupBy({
      by: ["userId"],
      where: { ...completedFilter, ...userDateFilter },
      _count: true,
      orderBy: { _count: { userId: "desc" } },
    });
    const userIds = userResult.map((r) => r.userId);
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name || u.id]));
    const topUsers = userResult.map((r) => ({
      userName: userMap.get(r.userId) || r.userId,
      count: r._count,
    }));

    // ---- 评价率（全量，不随时间筛选变化） ----
    const terminalFilter = {};
    const terminalTasks = await prisma.task.findMany({
      where: terminalFilter,
      select: { id: true },
    });
    const terminalCount = terminalTasks.length;
    const terminalIdSet = new Set(terminalTasks.map((t) => t.id));
    const ratedAmongTerminal = [...latestByTask.keys()].filter((id) =>
      terminalIdSet.has(id)
    ).length;
    const userRatingRatePercent =
      terminalCount > 0
        ? Math.round((ratedAmongTerminal / terminalCount) * 100)
        : 0;

    // ---- 评价分布（使用 ratingRange） ----
    const ratingDateFilter = buildDateFilter(ratingRange, ratingCustomStart, ratingCustomEnd);
    const ratingHasFilter = Object.keys(ratingDateFilter).length > 0;
    let ratingRatings = allLatestRatings;
    if (ratingHasFilter) {
      const ratingTaskIds = new Set(
        (await prisma.task.findMany({
          where: { ...completedFilter, ...ratingDateFilter },
          select: { id: true },
        })).map((t) => t.id)
      );
      ratingRatings = Array.from(latestByTask.entries())
        .filter(([taskId]) => ratingTaskIds.has(taskId))
        .map(([, fb]) => fb.rating);
    }
    const ratingDist = ratingDistribution(ratingRatings);

    // ---- Recent records（使用 recordRange） ----
    const recordDateFilter = buildDateFilter(recordRange, recordCustomStart, recordCustomEnd);
    const recent = await prisma.task.findMany({
      where: { ...completedFilter, ...recordDateFilter },
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

    return NextResponse.json({
      kpi: kpiValues,
      kpiTrend,
      dailyTrend,
      categoryDistribution,
      dimensionCoverage,
      topUsers,
      userRatingDistribution: ratingDist,
      userRatingRate: {
        percent: userRatingRatePercent,
        ratedCount: ratedAmongTerminal,
        completedCount: terminalCount,
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
