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
    const includeAi = searchParams.get("includeAi") === "true";

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
      avgUsabilityRate: number;
      avgReviewDuration: number;
      tasksPerWeek: number;
      requirementsPerWeek: number;
      savedDuration: number;        // 节省时间总值（分钟）
      avgEfficiencyGain: number;     // 平均效率提升（%）
      cEndUsabilityRate: number;     // C端可用率（C1C+C2C）
      bEndUsabilityRate: number;     // B端可用率（C1B+C2B）
      otherUsabilityRate: number;    // 其他可用率（数科/车小妹/未分类）
    };
    let kpiTrend: {
      totalCases: { current: number; previous: number; changePercent: number | null };
      weeklyActiveUsers: { current: number; previous: number; changePercent: number | null };
      avgDuration: { current: number; previous: number; changePercent: number | null };
      avgUserRating: { current: number; previous: number; changePercent: number | null };
      avgUsabilityRate:   { current: number; previous: number; changePercent: number | null };
      avgReviewDuration:  { current: number; previous: number; changePercent: number | null };
      tasksPerWeek: { current: number; previous: number; changePercent: number | null };
      requirementsPerWeek: { current: number; previous: number; changePercent: number | null };
      savedDuration:      { current: number; previous: number; changePercent: number | null };
      avgEfficiencyGain:  { current: number; previous: number; changePercent: number | null };
      cEndUsabilityRate:  { current: number; previous: number; changePercent: number | null };
      bEndUsabilityRate:  { current: number; previous: number; changePercent: number | null };
      otherUsabilityRate: { current: number; previous: number; changePercent: number | null };
    };

    // 计算一组任务的 节省时间总值 / 平均效率提升
    // 只统计同时填写了 manualDuration 和 reviewDuration 的任务
    // includeAi=true 时在节省值中额外扣除 AI 生成耗时（duration 字段，毫秒→分钟）
    function computeEfficiency(
      tasks: { manualDuration?: number | null; reviewDuration?: number | null; duration?: number | null }[],
      includeAi: boolean,
    ): { totalSaved: number; avgGain: number } {
      const paired = tasks.filter(
        (t) => t.manualDuration != null && t.reviewDuration != null,
      ) as { manualDuration: number; reviewDuration: number; duration?: number | null }[];
      if (paired.length === 0) return { totalSaved: 0, avgGain: 0 };
      const aiMin = (t: { duration?: number | null }) =>
        includeAi && t.duration != null ? t.duration / 60000 : 0;
      const savedList = paired.map((t) => t.manualDuration - t.reviewDuration - aiMin(t));
      const gainList = paired
        .filter((t) => t.manualDuration > 0)
        .map((t) => ((t.manualDuration - t.reviewDuration - aiMin(t)) / t.manualDuration) * 100);
      const totalSaved = Math.round(savedList.reduce((a, b) => a + b, 0));
      const avgGain = gainList.length > 0
        ? Math.round(gainList.reduce((a, b) => a + b, 0) / gainList.length)
        : 0;
      return { totalSaved, avgGain };
    }

    // 按业务类型分组计算可用率
    // C端: C1C, C2C; B端: C1B, C2B; 其他: 数科, 车小妹, null/未分类
    function computeGroupedUsability(
      tasks: { businessType?: string | null; usabilityRate?: number | null }[],
    ): { cEnd: number; bEnd: number; other: number } {
      const groups: { cEnd: number[]; bEnd: number[]; other: number[] } = { cEnd: [], bEnd: [], other: [] };
      for (const t of tasks) {
        if (t.usabilityRate == null) continue;
        const bt = t.businessType;
        if (bt === "C1C" || bt === "C2C") {
          groups.cEnd.push(t.usabilityRate);
        } else if (bt === "C1B" || bt === "C2B") {
          groups.bEnd.push(t.usabilityRate);
        } else {
          groups.other.push(t.usabilityRate);
        }
      }
      const avg = (arr: number[]) =>
        arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      return { cEnd: avg(groups.cEnd), bEnd: avg(groups.bEnd), other: avg(groups.other) };
    }

    if (kpiWindow) {
      // 有时间窗口：查询两窗口数据，内存计算 KPI 值和同比
      const [currentTasks, previousTasks] = await Promise.all([
        prisma.task.findMany({
          where: { ...completedFilter, ...(kpiRange === "custom" && kpiCustomEnd
            ? { createdAt: { gte: kpiWindow.currentStart, lt: (() => { const d = new Date(kpiCustomEnd); d.setDate(d.getDate() + 1); return d; })() } }
            : { createdAt: { gte: kpiWindow.currentStart } }) },
          select: { id: true, totalCases: true, duration: true, userId: true, inputFiles: true, usabilityRate: true, reviewDuration: true, manualDuration: true, businessType: true },
        }),
        prisma.task.findMany({
          where: { ...completedFilter, createdAt: { gte: kpiWindow.previousStart, lt: kpiWindow.previousEnd } },
          select: { id: true, totalCases: true, duration: true, userId: true, inputFiles: true, usabilityRate: true, reviewDuration: true, manualDuration: true, businessType: true },
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

      const thisUsabilityRates = currentTasks.map((t) => t.usabilityRate).filter((r): r is number => r != null);
      const lastUsabilityRates = previousTasks.map((t) => t.usabilityRate).filter((r): r is number => r != null);
      const thisUsability = thisUsabilityRates.length > 0
        ? Math.round(thisUsabilityRates.reduce((a, b) => a + b, 0) / thisUsabilityRates.length)
        : 0;
      const lastUsability = lastUsabilityRates.length > 0
        ? Math.round(lastUsabilityRates.reduce((a, b) => a + b, 0) / lastUsabilityRates.length)
        : 0;

      const thisReviewDurations = currentTasks.map((t) => t.reviewDuration).filter((r): r is number => r != null);
      const lastReviewDurations = previousTasks.map((t) => t.reviewDuration).filter((r): r is number => r != null);
      const thisReviewDuration = thisReviewDurations.length > 0
        ? Math.round(thisReviewDurations.reduce((a, b) => a + b, 0) / thisReviewDurations.length)
        : 0;
      const lastReviewDuration = lastReviewDurations.length > 0
        ? Math.round(lastReviewDurations.reduce((a, b) => a + b, 0) / lastReviewDurations.length)
        : 0;

      const thisEff = computeEfficiency(currentTasks, includeAi);
      const lastEff = computeEfficiency(previousTasks, includeAi);

      const thisGroupedUsability = computeGroupedUsability(currentTasks);
      const lastGroupedUsability = computeGroupedUsability(previousTasks);

      kpiValues = {
        totalCases: thisCaseSum,
        weeklyActiveUsers: thisUsers,
        avgDuration: thisDur,
        avgUserRating: thisRating,
        avgUsabilityRate: thisUsability,
        avgReviewDuration: thisReviewDuration,
        tasksPerWeek: thisTaskCount,
        requirementsPerWeek: thisReqIds.size,
        savedDuration: thisEff.totalSaved,
        avgEfficiencyGain: thisEff.avgGain,
        cEndUsabilityRate: thisGroupedUsability.cEnd,
        bEndUsabilityRate: thisGroupedUsability.bEnd,
        otherUsabilityRate: thisGroupedUsability.other,
      };

      kpiTrend = {
        totalCases: { current: thisCaseSum, previous: lastCaseSum, changePercent: calcChangePercent(thisCaseSum, lastCaseSum) },
        weeklyActiveUsers: { current: thisUsers, previous: lastUsers, changePercent: calcChangePercent(thisUsers, lastUsers) },
        avgDuration: { current: thisDur, previous: lastDur, changePercent: calcChangePercent(thisDur, lastDur) },
        avgUserRating: { current: thisRating, previous: lastRating, changePercent: calcChangePercent(thisRating, lastRating) },
        avgUsabilityRate: { current: thisUsability, previous: lastUsability, changePercent: calcChangePercent(thisUsability, lastUsability) },
        avgReviewDuration: { current: thisReviewDuration, previous: lastReviewDuration, changePercent: calcChangePercent(thisReviewDuration, lastReviewDuration) },
        tasksPerWeek: { current: thisTaskCount, previous: lastTaskCount, changePercent: calcChangePercent(thisTaskCount, lastTaskCount) },
        requirementsPerWeek: { current: thisReqIds.size, previous: lastReqIds.size, changePercent: calcChangePercent(thisReqIds.size, lastReqIds.size) },
        savedDuration: { current: thisEff.totalSaved, previous: lastEff.totalSaved, changePercent: calcChangePercent(thisEff.totalSaved, lastEff.totalSaved) },
        avgEfficiencyGain: { current: thisEff.avgGain, previous: lastEff.avgGain, changePercent: calcChangePercent(thisEff.avgGain, lastEff.avgGain) },
        cEndUsabilityRate: { current: thisGroupedUsability.cEnd, previous: lastGroupedUsability.cEnd, changePercent: calcChangePercent(thisGroupedUsability.cEnd, lastGroupedUsability.cEnd) },
        bEndUsabilityRate: { current: thisGroupedUsability.bEnd, previous: lastGroupedUsability.bEnd, changePercent: calcChangePercent(thisGroupedUsability.bEnd, lastGroupedUsability.bEnd) },
        otherUsabilityRate: { current: thisGroupedUsability.other, previous: lastGroupedUsability.other, changePercent: calcChangePercent(thisGroupedUsability.other, lastGroupedUsability.other) },
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

      const usabilityAgg = await prisma.task.aggregate({
        _avg: { usabilityRate: true },
        where: { ...completedFilter, usabilityRate: { not: null } },
      });
      const avgUsability = Math.round(usabilityAgg._avg?.usabilityRate || 0);

      const reviewDurationAgg = await prisma.task.aggregate({
        _avg: { reviewDuration: true },
        where: { ...completedFilter, reviewDuration: { not: null } },
      });
      const avgReviewDuration = Math.round(reviewDurationAgg._avg?.reviewDuration || 0);

      const efficiencyTasks = await prisma.task.findMany({
        where: {
          ...completedFilter,
          manualDuration: { not: null },
          reviewDuration: { not: null },
        },
        select: { manualDuration: true, reviewDuration: true, duration: true },
      });
      const allEff = computeEfficiency(efficiencyTasks, includeAi);

      // 分组可用率：需要 businessType + usabilityRate
      const groupedUsabilityTasks = await prisma.task.findMany({
        where: { ...completedFilter, usabilityRate: { not: null } },
        select: { businessType: true, usabilityRate: true },
      });
      const allGroupedUsability = computeGroupedUsability(groupedUsabilityTasks);

      kpiValues = {
        totalCases: totalAgg._sum?.totalCases || 0,
        weeklyActiveUsers: wauResult.length,
        avgDuration: Math.round(avgDurAgg._avg?.duration || 0),
        avgUserRating: avgUserRating(allLatestRatings),
        avgUsabilityRate: avgUsability,
        avgReviewDuration: avgReviewDuration,
        tasksPerWeek: taskCount,
        requirementsPerWeek: reqIdSet.size,
        savedDuration: allEff.totalSaved,
        avgEfficiencyGain: allEff.avgGain,
        cEndUsabilityRate: allGroupedUsability.cEnd,
        bEndUsabilityRate: allGroupedUsability.bEnd,
        otherUsabilityRate: allGroupedUsability.other,
      };

      kpiTrend = {
        totalCases: { current: 0, previous: 0, changePercent: null },
        weeklyActiveUsers: { current: 0, previous: 0, changePercent: null },
        avgDuration: { current: 0, previous: 0, changePercent: null },
        avgUserRating: { current: 0, previous: 0, changePercent: null },
        avgUsabilityRate: { current: 0, previous: 0, changePercent: null },
        avgReviewDuration: { current: 0, previous: 0, changePercent: null },
        tasksPerWeek: { current: 0, previous: 0, changePercent: null },
        requirementsPerWeek: { current: 0, previous: 0, changePercent: null },
        savedDuration: { current: 0, previous: 0, changePercent: null },
        avgEfficiencyGain: { current: 0, previous: 0, changePercent: null },
        cEndUsabilityRate: { current: 0, previous: 0, changePercent: null },
        bEndUsabilityRate: { current: 0, previous: 0, changePercent: null },
        otherUsabilityRate: { current: 0, previous: 0, changePercent: null },
      };
    }

    // ---- Daily trend（使用 trendRange） ----
    const trendDateFilter = buildDateFilter(trendRange, trendCustomStart, trendCustomEnd);
    const trendStart = trendRange === "custom" && trendCustomStart ? trendCustomStart : getChartStartDate(trendRange);
    const dailyTasks = await prisma.task.findMany({
      where: { ...completedFilter, ...trendDateFilter },
      select: { createdAt: true, userId: true },
      orderBy: { createdAt: "asc" },
    });
    const dailyMap = new Map<string, { count: number; userIds: Set<string> }>();
    for (const t of dailyTasks) {
      const date = t.createdAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(date) || { count: 0, userIds: new Set<string>() };
      entry.count++;
      entry.userIds.add(t.userId);
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
        dailyMap.set(dateStr, { count: 0, userIds: new Set<string>() });
      }
      fillCursor.setUTCDate(fillCursor.getUTCDate() + 1);
    }
    const dailyTrend = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        count: v.count,
        userCount: v.userIds.size,
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
        businessType: true,
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
          id: r.id,
          time: r.createdAt.toLocaleDateString("zh-CN"),
          user: r.user?.name || "未知",
          req: (r.input || "").slice(0, 60),
          count: r.totalCases || 0,
          score: r.qualityScore || 0,
          tokens: r.tokenUsage || 0,
          category: r.businessType || "未分类",
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
