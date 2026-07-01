// KPI 时间范围类型
export type KpiRange = "all" | "week" | "7d" | "month" | "30d" | "custom";

// 图表时间范围类型
export type ChartRange = "all" | "7d" | "30d" | "90d" | "custom";

// 允许的图表范围选项（不同图表可选范围不同）
const FULL_CHART_OPTIONS: ChartRange[] = ["all", "7d", "30d", "90d", "custom"];
const SHORT_CHART_OPTIONS: ChartRange[] = ["all", "7d", "30d", "custom"];

// KPI 时间窗口
export interface KpiDateWindow {
  currentStart: Date;
  previousStart: Date;
  previousEnd: Date;
}

// KPI 标签映射
export const KPI_LABELS: Record<KpiRange, string> = {
  week: "本周",
  month: "本月",
  "7d": "近7天",
  "30d": "近30天",
  all: "全部",
  custom: "自定义",
};

// KPI 同比标签映射
export const KPI_TREND_LABELS: Record<KpiRange, string> = {
  all: "",
  week: "周同比",
  "7d": "7天同比",
  month: "月同比",
  "30d": "30天同比",
  custom: "自定义同比",
};

// KPI 本期/上期文字
export const KPI_PERIOD_LABELS: Record<Exclude<KpiRange, "all">, { current: string; previous: string }> = {
  week: { current: "本周", previous: "上周" },
  "7d": { current: "近7天", previous: "前7天" },
  month: { current: "本月", previous: "上月" },
  "30d": { current: "近30天", previous: "前30天" },
  custom: { current: "自定义", previous: "上期" },
};

// KPI 周期单位（用于拼接 "任务数/周" 等动态标签）
export const KPI_PERIOD_UNIT: Record<KpiRange, string> = {
  all: "",
  week: "周",
  "7d": "7天",
  month: "月",
  "30d": "30天",
  custom: "自定义",
};

// 图表标签映射
export const CHART_LABELS: Record<ChartRange, string> = {
  all: "全部",
  "7d": "近7天",
  "30d": "近30天",
  "90d": "近90天",
  custom: "自定义",
};

/** 解析 KPI 范围参数 */
export function parseKpiRange(value: string | null): KpiRange {
  if (value === "all" || value === "week" || value === "7d" || value === "month" || value === "30d" || value === "custom") return value;
  return "week";
}

/** 解析图表范围参数 */
export function parseChartRange(
  value: string | null,
  allowed: ChartRange[] = FULL_CHART_OPTIONS,
): ChartRange {
  if (allowed.includes(value as ChartRange)) return value as ChartRange;
  return "30d";
}

/** 短范围选项（仅 all/7d/30d） */
export function shortChartOptions(): ChartRange[] {
  return SHORT_CHART_OPTIONS;
}

/** 获取 KPI 时间窗口（currentStart 到 now, previousStart 到 previousEnd） */
export function getKpiDateWindow(range: KpiRange): KpiDateWindow | null {
  if (range === "all" || range === "custom") return null;
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // 日历周：本周一 00:00 ~ now，上期 = 上周一 ~ 本周一
  if (range === "week") {
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday...
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(now);
    thisMonday.setHours(0, 0, 0, 0);
    thisMonday.setDate(now.getDate() - daysSinceMonday);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    return {
      currentStart: thisMonday,
      previousStart: lastMonday,
      previousEnd: thisMonday,
    };
  }

  // 日历月：本月1日 00:00 ~ now，上期 = 上月1日 ~ 本月1日
  if (range === "month") {
    const thisFirst = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      currentStart: thisFirst,
      previousStart: lastFirst,
      previousEnd: thisFirst,
    };
  }

  // 滚动窗口：7d 和 30d
  const days = range === "7d" ? 7 : 30;
  const nowMs = now.getTime();
  return {
    currentStart: new Date(nowMs - days * dayMs),
    previousStart: new Date(nowMs - 2 * days * dayMs),
    previousEnd: new Date(nowMs - days * dayMs),
  };
}

/** 获取图表起始日期（null 表示不过滤，custom 由 route.ts 单独处理） */
export function getChartStartDate(range: ChartRange): Date | null {
  if (range === "all" || range === "custom") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** 解析自定义日期范围（YYYY-MM-DD） */
export function parseCustomDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

/** 获取 KPI 自定义时间窗口（上期 = 相同长度往前推） */
export function getCustomKpiWindow(start: Date, end: Date): KpiDateWindow {
  const dayMs = 24 * 60 * 60 * 1000;
  const lengthMs = end.getTime() - start.getTime();
  return {
    currentStart: start,
    previousStart: new Date(start.getTime() - lengthMs - dayMs),
    previousEnd: new Date(start.getTime() - dayMs),
  };
}

/** 获取图表自定义日期范围 */
export function getCustomChartDates(start: Date, end: Date): { start: Date; end: Date } {
  return { start, end };
}

/** 从 inputFiles 提取需求标识 */
export function extractReqIdentifier(taskId: string, inputFiles: string[]): string {
  if (inputFiles && inputFiles.length > 0) {
    const fullPath = inputFiles[0];
    const fileName = fullPath.split("/").pop()?.split("\\").pop() || fullPath;
    return fileName.replace(/^\d+-/, "");
  }
  return `__no_file__:${taskId}`;
}

/** 计算同比百分比 */
export function calcChangePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
