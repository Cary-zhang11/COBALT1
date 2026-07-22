"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, Users, Clock, Loader2, Star, CheckCircle2, Zap, TrendingUp, ExternalLink, Copy,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
} from "recharts";
import type { KpiRange, ChartRange } from "@/lib/stats-time-range";
import {
  KPI_LABELS,
  KPI_TREND_LABELS,
  KPI_PERIOD_LABELS,
  KPI_PERIOD_UNIT,
  CHART_LABELS,
  shortChartOptions,
  fullChartOptions,
} from "@/lib/stats-time-range";

interface StatsData {
  kpi: {
    totalCases: number;
    weeklyActiveUsers: number;
    avgDuration: number;
    avgUserRating: number;
    avgUsabilityRate: number;
    avgReviewDuration: number;
    tasksPerWeek: number;
    requirementsPerWeek: number;
    savedDuration: number;
    avgEfficiencyGain: number;
    cEndUsabilityRate: number;
    bEndUsabilityRate: number;
    otherUsabilityRate: number;
  };
  dailyTrend: { date: string; count: number; userCount: number }[];
  categoryDistribution: { category: string; count: number }[];
  dimensionCoverage: { name: string; covered: number; total: number }[];
  topUsers: { userName: string; count: number }[];
  userRatingDistribution: { stars: number; count: number }[];
  userRatingRate: {
    percent: number;
    ratedCount: number;
    completedCount: number;
  };
  kpiTrend: {
    totalCases:         { current: number; previous: number; changePercent: number | null };
    weeklyActiveUsers:  { current: number; previous: number; changePercent: number | null };
    avgDuration:        { current: number; previous: number; changePercent: number | null };
    avgUserRating:      { current: number; previous: number; changePercent: number | null };
    avgUsabilityRate:   { current: number; previous: number; changePercent: number | null };
    avgReviewDuration:  { current: number; previous: number; changePercent: number | null };
    tasksPerWeek:       { current: number; previous: number; changePercent: number | null };
    requirementsPerWeek:{ current: number; previous: number; changePercent: number | null };
    savedDuration:      { current: number; previous: number; changePercent: number | null };
    avgEfficiencyGain:  { current: number; previous: number; changePercent: number | null };
    cEndUsabilityRate:  { current: number; previous: number; changePercent: number | null };
    bEndUsabilityRate:  { current: number; previous: number; changePercent: number | null };
    otherUsabilityRate: { current: number; previous: number; changePercent: number | null };
  };
  recentRecords: {
    id: string;
    time: string;
    user: string;
    req: string;
    count: number;
    ticketId: string | null;
    usabilityRate: number | null;
    manualDuration: number | null;
    reviewDuration: number | null;
    category: string;
    userRating: number | null;
    userComment: string | null;
  }[];
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const MAIN_DIMENSIONS: { code: string; names: string[] }[] = [
  { code: "D1", names: ["主流程"] },
  { code: "D2", names: ["分支流程"] },
  { code: "D3", names: ["异常与容错", "异常"] },
  { code: "D4", names: ["边界条件", "边界"] },
  { code: "D5", names: ["权限与安全", "权限安全", "权限"] },
  { code: "D6", names: ["兼容性"] },
  { code: "D7", names: ["性能"] },
];

function resolveMainDimensionCode(name: string): string | null {
  const tagged = name.match(/（(D\d+)）/);
  if (tagged) {
    const code = tagged[1];
    return MAIN_DIMENSIONS.some((d) => d.code === code) ? code : null;
  }
  for (const dim of MAIN_DIMENSIONS) {
    if (dim.names.some((n) => name === n || name.startsWith(n))) return dim.code;
  }
  return null;
}

function filterMainDimensions(
  data: { name: string; covered: number; total: number }[],
): { name: string; covered: number; total: number }[] {
  const order = new Map(MAIN_DIMENSIONS.map((d, i) => [d.code, i]));
  return data
    .map((item) => ({ item, code: resolveMainDimensionCode(item.name) }))
    .filter((x): x is { item: typeof data[number]; code: string } => x.code !== null)
    .sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99))
    .map((x) => x.item);
}

const STAT_CARD =
  "bg-card rounded-lg border border-border/60 px-4 py-3 flex items-start justify-between";
const CHART_CARD = "bg-card rounded-lg border border-border/60 overflow-hidden";
const CHART_HEAD = "flex items-center justify-between gap-2 flex-wrap px-6 pt-4";
const CHART_BODY = "px-6 pb-6 pt-3 h-[200px]";

function formatDuration(ms: number): string {
  return (ms / 60000).toFixed(1) + " 分钟";
}

function formatTrendValue(trendKey: string, value: number): string {
  if (trendKey === "avgDuration") return formatDuration(value);
  if (trendKey === "avgUserRating") return value.toFixed(1);
  if (trendKey === "avgUsabilityRate") return `${value}%`;
  if (trendKey === "avgReviewDuration") return `${value}分钟`;
  if (trendKey === "savedDuration") return `${value}分钟`;
  if (trendKey === "avgEfficiencyGain") return `${value}%`;
  if (trendKey === "cEndUsabilityRate" || trendKey === "bEndUsabilityRate" || trendKey === "otherUsabilityRate") return `${value}%`;
  return value.toString();
}

function DashboardPageHeader() {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold text-foreground/85">数据看板</h1>
      <p className="text-sm text-muted-foreground mt-1">
        用例生成统计 · 质量与用户评价概览
      </p>
    </header>
  );
}

function DashboardChartCard({
  title,
  extra,
  children,
  className = "",
  bodyClass = "",
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <div className={`${CHART_CARD} ${className}`}>
      <div className={CHART_HEAD}>
        <span className="font-semibold text-sm text-foreground/85">{title}</span>
        {extra != null ? <>{extra}</> : null}
      </div>
      <div className={`${CHART_BODY} ${bodyClass}`}>{children}</div>
    </div>
  );
}

type CustomDates = { start: string; end: string };

const DATE_INPUT_cls = "border border-border rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/40";

function KpiTimeFilter({
  value,
  onChange,
  customDates,
  onCustomDatesChange,
}: {
  value: KpiRange;
  onChange: (v: KpiRange) => void;
  customDates: CustomDates;
  onCustomDatesChange: (d: CustomDates) => void;
}) {
  if (value === "custom") {
    return (
      <div className="flex items-center gap-1">
        <input type="date" value={customDates.start} onChange={(e) => onCustomDatesChange({ ...customDates, start: e.target.value })} className={DATE_INPUT_cls} />
        <span className="text-xs text-muted-foreground">~</span>
        <input type="date" value={customDates.end} onChange={(e) => onCustomDatesChange({ ...customDates, end: e.target.value })} className={DATE_INPUT_cls} />
        <button onClick={() => onChange("week")} className="text-muted-foreground hover:text-foreground text-sm px-1 leading-none" title="返回预设">×</button>
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as KpiRange)}
      className="border border-border rounded px-2 py-1 text-xs bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {(Object.keys(KPI_LABELS) as KpiRange[]).map((k) => (
        <option key={k} value={k}>{KPI_LABELS[k]}</option>
      ))}
    </select>
  );
}

function ChartTimeFilter({
  value,
  onChange,
  options = fullChartOptions(),
  customDates,
  onCustomDatesChange,
}: {
  value: ChartRange;
  onChange: (v: ChartRange) => void;
  options?: ChartRange[];
  customDates: CustomDates;
  onCustomDatesChange: (d: CustomDates) => void;
}) {
  if (value === "custom") {
    return (
      <div className="flex items-center gap-1">
        <input type="date" value={customDates.start} onChange={(e) => onCustomDatesChange({ ...customDates, start: e.target.value })} className={DATE_INPUT_cls} />
        <span className="text-xs text-muted-foreground">~</span>
        <input type="date" value={customDates.end} onChange={(e) => onCustomDatesChange({ ...customDates, end: e.target.value })} className={DATE_INPUT_cls} />
        <button onClick={() => onChange("30d")} className="text-muted-foreground hover:text-foreground text-sm px-1 leading-none" title="返回预设">×</button>
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ChartRange)}
      className="border border-border rounded px-2 py-1 text-xs bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{CHART_LABELS[opt]}</option>
      ))}
    </select>
  );
}

function TrendLegend({
  visible,
  onToggle,
}: {
  visible: { count: boolean; userCount: boolean };
  onToggle: (key: "count" | "userCount") => void;
}) {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
      <button
        type="button"
        onClick={() => onToggle("count")}
        className={`flex items-center gap-1 transition-opacity hover:text-foreground ${visible.count ? "" : "opacity-30"}`}
      >
        <span className="inline-block w-3 h-0.5 bg-[#3b82f6] rounded" />
        生成量（左轴）
      </button>
      <button
        type="button"
        onClick={() => onToggle("userCount")}
        className={`flex items-center gap-1 transition-opacity hover:text-foreground ${visible.userCount ? "" : "opacity-30"}`}
      >
        <span className="inline-block w-3 h-0.5 bg-[#10b981] rounded" />
        使用人员（右轴）
      </button>
    </div>
  );
}

function UserRatingDistributionBars({
  rows,
  rate,
}: {
  rows: { stars: number; count: number }[];
  rate: StatsData["userRatingRate"];
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const ordered = [...rows].sort((a, b) => b.stars - a.stars);

  const rateFooter = (
    <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/50 tabular-nums">
      评价率 {rate.percent}%（有评任务 / 已完成）
    </p>
  );

  if (total === 0) {
    return (
      <div className="h-full flex flex-col justify-center">
        <p className="text-xs text-muted-foreground text-center">暂无星级分布数据</p>
        {rateFooter}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-center gap-2">
      {ordered.map((row) => {
        const pct = Math.round((row.count / total) * 100);
        return (
          <div key={row.stars} className="flex items-center gap-2 text-xs">
            <span className="w-9 text-muted-foreground tabular-nums shrink-0">{row.stars} 星</span>
            <div className="flex-1 h-4 bg-muted/50 rounded overflow-hidden">
              <div
                className="h-full bg-amber-400/90 rounded transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 text-right tabular-nums text-muted-foreground shrink-0">{pct}%</span>
          </div>
        );
      })}
      {rateFooter}
    </div>
  );
}

function TopUsersScrollableList({
  users,
}: {
  users: { userName: string; count: number }[];
}) {
  const max = Math.max(...users.map((u) => u.count), 1);

  if (users.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        暂无数据
      </div>
    );
  }

  return (
    <div className="h-full max-h-[200px] overflow-y-auto flex flex-col gap-1.5 pr-1">
      {users.map((u, i) => (
        <div key={`${u.userName}-${i}`} className="flex items-center gap-2 text-xs shrink-0">
          <span className="w-6 text-muted-foreground/70 tabular-nums text-right shrink-0">{i + 1}</span>
          <span className="w-20 text-muted-foreground shrink-0" title={u.userName}>
            {u.userName}
          </span>
          <div className="flex-1 h-5 bg-muted/50 rounded overflow-hidden">
            <div
              className="h-full bg-[#1890ff] rounded transition-all"
              style={{ width: `${Math.round((u.count / max) * 100)}%` }}
            />
          </div>
          <span className="tabular-nums text-muted-foreground w-6 text-right shrink-0">{u.count}</span>
        </div>
      ))}
    </div>
  );
}

function PieChartCentered({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="w-full h-full [&_.recharts-surface]:overflow-visible">{children}</div>
    </div>
  );
}

type RecentRecord = StatsData["recentRecords"][number];

type RecordFilter = "all" | "rated" | "unrated";

function filterRecentRecords(
  rows: RecentRecord[],
  search: string,
  filter: RecordFilter,
  ticketIdFilter: string,
): RecentRecord[] {
  return rows.filter((row) => {
    if (filter === "rated" && row.userRating == null) return false;
    if (filter === "unrated" && row.userRating != null) return false;

    // 工单ID精确匹配
    const ticketQ = ticketIdFilter.trim();
    if (ticketQ && row.ticketId !== ticketQ) return false;

    // 普通搜索
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      row.req.toLowerCase().includes(q) ||
      row.user.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q) ||
      (row.ticketId && row.ticketId.includes(q))
    );
  });
}

function copyToClipboard(text: string) {
  // 优先使用 Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showCopyTip('已复制');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  // 降级方案：使用 textarea
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showCopyTip('已复制');
  } catch (err) {
    showCopyTip('复制失败');
  }
  document.body.removeChild(textarea);
}

function showCopyTip(message: string) {
  const tip = document.createElement('div');
  tip.textContent = message;
  tip.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:8px 16px;border-radius:4px;z-index:9999;font-size:14px;';
  document.body.appendChild(tip);
  setTimeout(() => {
    if (document.body.contains(tip)) {
      document.body.removeChild(tip);
    }
  }, 1500);
}

function getUsabilityRateColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate < 60) return "text-red-600 bg-red-50";
  if (rate < 80) return "text-amber-600 bg-amber-50";
  return "text-emerald-600 bg-emerald-50";
}

function UserRatingCell({
  rating,
  comment,
}: {
  rating: number | null;
  comment: string | null;
}) {
  if (!rating) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="min-w-[6.5rem] max-w-[11rem]">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-amber-500 tracking-tight text-[11px] leading-none">
          {"★".repeat(rating)}
          {"☆".repeat(5 - rating)}
        </span>
        <span className="text-muted-foreground tabular-nums text-[10px]">{rating}</span>
      </div>
      {comment ? (
        <p
          className="text-[10px] text-muted-foreground mt-1 leading-snug line-clamp-2"
          title={comment}
        >
          {comment}
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground/50 mt-0.5 italic">无补充说明</p>
      )}
    </div>
  );
}

function CoverageBarChart({ data }: { data: { name: string; covered: number; total: number }[] }) {
  const visible = filterMainDimensions(data);

  if (visible.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">暂无核心维度覆盖数据</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 flex flex-col gap-1 pt-1 justify-center">
        {visible.map((dim) => {
          const pct = dim.total > 0 ? Math.round((dim.covered / dim.total) * 100) : 0;
          const barColor =
            pct >= 80 ? "bg-emerald-400" :
            pct >= 50 ? "bg-amber-400" :
            "bg-red-400";
          return (
            <div key={dim.name} className="flex items-center gap-1.5 text-[10px] shrink-0">
              <span
                className="w-[5.5rem] text-muted-foreground truncate shrink-0"
                title={dim.name}
              >
                {dim.name}
              </span>
              <div className="flex-1 h-2.5 bg-muted/50 rounded-sm overflow-hidden">
                <div
                  className={`h-full rounded-sm ${barColor} transition-all`}
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>
              <span className="w-7 text-right tabular-nums text-muted-foreground shrink-0">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DashboardBodyProps {
  data: StatsData;
  kpiRange: KpiRange;
  setKpiRange: (v: KpiRange) => void;
  kpiCustom: CustomDates;
  setKpiCustom: (d: CustomDates) => void;
  trendRange: ChartRange;
  setTrendRange: (v: ChartRange) => void;
  trendCustom: CustomDates;
  setTrendCustom: (d: CustomDates) => void;
  categoryRange: ChartRange;
  setCategoryRange: (v: ChartRange) => void;
  categoryCustom: CustomDates;
  setCategoryCustom: (d: CustomDates) => void;
  dimensionRange: ChartRange;
  setDimensionRange: (v: ChartRange) => void;
  dimensionCustom: CustomDates;
  setDimensionCustom: (d: CustomDates) => void;
  ratingRange: ChartRange;
  setRatingRange: (v: ChartRange) => void;
  ratingCustom: CustomDates;
  setRatingCustom: (d: CustomDates) => void;
  userRange: ChartRange;
  setUserRange: (v: ChartRange) => void;
  userCustom: CustomDates;
  setUserCustom: (d: CustomDates) => void;
  recordRange: ChartRange;
  setRecordRange: (v: ChartRange) => void;
  recordCustom: CustomDates;
  setRecordCustom: (d: CustomDates) => void;
  includeAi: boolean;
  setIncludeAi: (v: boolean) => void;
  onRecordClick: (id: string) => void;
}

function DashboardBody({
  data,
  kpiRange, setKpiRange, kpiCustom, setKpiCustom,
  trendRange, setTrendRange, trendCustom, setTrendCustom,
  categoryRange, setCategoryRange, categoryCustom, setCategoryCustom,
  dimensionRange, setDimensionRange, dimensionCustom, setDimensionCustom,
  ratingRange, setRatingRange, ratingCustom, setRatingCustom,
  userRange, setUserRange, userCustom, setUserCustom,
  recordRange, setRecordRange, recordCustom, setRecordCustom,
  includeAi, setIncludeAi,
  onRecordClick,
}: DashboardBodyProps) {
  const [recordSearch, setRecordSearch] = useState("");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("all");
  const [ticketIdSearch, setTicketIdSearch] = useState("");
  const [trendVisible, setTrendVisible] = useState({ count: true, userCount: true });

  const filteredRecords = useMemo(
    () => filterRecentRecords(data.recentRecords, recordSearch, recordFilter, ticketIdSearch),
    [data.recentRecords, recordSearch, recordFilter, ticketIdSearch],
  );

  // 根据 kpiRange 动态生成周期后缀
  const periodSuffix = kpiRange === "all" ? "" : `/${KPI_PERIOD_UNIT[kpiRange]}`;
  const activeUserPrefix = KPI_PERIOD_UNIT[kpiRange];

  const kpis = [
    { label: "用例数", value: data.kpi.totalCases.toLocaleString(), icon: BarChart3, bg: "bg-primary/10", iconColor: "text-primary", trendKey: "totalCases" as const },
    { label: `${activeUserPrefix}活跃用户`, value: data.kpi.weeklyActiveUsers.toString(), icon: Users, bg: "bg-emerald-100", iconColor: "text-emerald-600", trendKey: "weeklyActiveUsers" as const },
    { label: "平均耗时", value: formatDuration(data.kpi.avgDuration), icon: Clock, bg: "bg-violet-100", iconColor: "text-violet-600", trendKey: "avgDuration" as const },
    {
      label: "用户平均评分",
      value: data.kpi.avgUserRating > 0 ? data.kpi.avgUserRating.toFixed(1) : "—",
      icon: Star,
      bg: "bg-amber-50",
      iconColor: "text-amber-700",
      trendKey: "avgUserRating" as const,
    },
    {
      label: "平均可用率",
      value: data.kpi.avgUsabilityRate > 0 ? `${data.kpi.avgUsabilityRate}%` : "—",
      icon: CheckCircle2,
      bg: "bg-teal-50",
      iconColor: "text-teal-600",
      trendKey: "avgUsabilityRate" as const,
      subValues: [
        { label: "C端", value: data.kpi.cEndUsabilityRate > 0 ? `${data.kpi.cEndUsabilityRate}%` : "—" },
        { label: "B端", value: data.kpi.bEndUsabilityRate > 0 ? `${data.kpi.bEndUsabilityRate}%` : "—" },
        { label: "其他", value: data.kpi.otherUsabilityRate > 0 ? `${data.kpi.otherUsabilityRate}%` : "—" },
      ],
    },
    { label: `任务数${periodSuffix}`, value: data.kpi.tasksPerWeek.toString(), icon: BarChart3, bg: "bg-emerald-50", iconColor: "text-emerald-600", trendKey: "tasksPerWeek" as const },
    { label: `需求数${periodSuffix}`, value: data.kpi.requirementsPerWeek.toString(), icon: BarChart3, bg: "bg-blue-50", iconColor: "text-blue-600", trendKey: "requirementsPerWeek" as const },
    {
      label: `节省时间${includeAi ? " (含AI)" : ""}`,
      value: data.kpi.savedDuration !== 0 ? `${data.kpi.savedDuration} 分钟` : "—",
      icon: Zap,
      bg: "bg-orange-50",
      iconColor: "text-orange-600",
      trendKey: "savedDuration" as const,
    },
    {
      label: `平均效率提升${includeAi ? " (含AI)" : ""}`,
      value: data.kpi.avgEfficiencyGain !== 0 ? `${data.kpi.avgEfficiencyGain}%` : "—",
      icon: TrendingUp,
      bg: "bg-rose-50",
      iconColor: "text-rose-600",
      trendKey: "avgEfficiencyGain" as const,
    },
  ];

  return (
    <>
      <div className="flex justify-end items-center mb-2 gap-3">
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeAi}
            onChange={(e) => setIncludeAi(e.target.checked)}
            className="accent-primary w-3 h-3"
          />
          计入 AI 耗时
        </label>
        <KpiTimeFilter value={kpiRange} onChange={setKpiRange} customDates={kpiCustom} onCustomDatesChange={setKpiCustom} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const trend = data.kpiTrend[kpi.trendKey];
          const isUp = (trend.changePercent ?? 0) > 0;
          const isDown = (trend.changePercent ?? 0) < 0;
          const colorClass = isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-muted-foreground";
          const arrow = isUp ? "↑" : isDown ? "↓" : "";
          const periodLabels = kpiRange !== "all" ? KPI_PERIOD_LABELS[kpiRange] : null;
          const hasTrend = kpiRange !== "all" && trend.changePercent !== null;

          return (
            <div key={kpi.label} className={STAT_CARD}>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                <p className="text-2xl leading-7 font-semibold tabular-nums text-foreground/85 whitespace-nowrap">
                  {kpi.value}
                  {"subValues" in kpi && kpi.subValues?.some((s) => s.value !== "—") && (
                    <span className="text-xs font-normal text-muted-foreground/70 ml-1">
                      ({kpi.subValues.filter((s) => s.value !== "—").map((s) => `${s.label} ${s.value}`).join(" · ")})
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {kpiRange !== "all" ? (
                    <>
                      {hasTrend ? (
                        <span className={`${colorClass} font-medium`}>
                          {arrow} {Math.abs(trend.changePercent!)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                      <span className="ml-1">{KPI_TREND_LABELS[kpiRange]}</span>
                      {periodLabels && (
                        <span className="block text-[10px] text-muted-foreground/70 mt-0.5">
                          {periodLabels.current} {formatTrendValue(kpi.trendKey, trend.current)} · {periodLabels.previous} {formatTrendValue(kpi.trendKey, trend.previous)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/70">—</span>
                  )}
                </p>
              </div>
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ml-3 ${kpi.bg}`}
              >
                <Icon className={`w-4 h-4 ${kpi.iconColor}`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border/60 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h4 className="font-semibold text-sm text-foreground/85">每日生成量 &amp; 使用人员趋势</h4>
            <div className="flex items-center gap-3">
              <TrendLegend
                visible={trendVisible}
                onToggle={(key) => setTrendVisible((prev) => ({ ...prev, [key]: !prev[key] }))}
              />
              <ChartTimeFilter value={trendRange} onChange={setTrendRange} customDates={trendCustom} onCustomDatesChange={setTrendCustom} />
            </div>
          </div>
          <div className="h-[176px] w-full [&_.recharts-wrapper]:outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" tickFormatter={(d: string) => d.slice(5).replace("-", "/")} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="count" stroke="#3b82f6" name="生成量" hide={!trendVisible.count} />
                <Line yAxisId="right" type="monotone" dataKey="userCount" stroke="#10b981" name="使用人员" hide={!trendVisible.userCount} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <DashboardChartCard
          title="需求类型分布"
          bodyClass="overflow-visible"
          extra={<ChartTimeFilter value={categoryRange} onChange={setCategoryRange} options={shortChartOptions()} customDates={categoryCustom} onCustomDatesChange={setCategoryCustom} />}
        >
          <PieChartCentered>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.categoryDistribution}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={48}
                  label={(entry: any) => {
                    const { value, x, y, cx } = entry;
                    return (
                      <text
                        x={x}
                        y={y}
                        fill="#374151"
                        fontSize={13}
                        fontWeight="bold"
                        textAnchor={x > cx ? "start" : "end"}
                        dominantBaseline="middle"
                      >
                        {value}
                      </text>
                    );
                  }}
                  labelLine={{ stroke: "#bbb", strokeWidth: 1 }}
                >
                  {data.categoryDistribution.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </PieChartCentered>
        </DashboardChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <DashboardChartCard
          title="覆盖维度分布"
          extra={<ChartTimeFilter value={dimensionRange} onChange={setDimensionRange} options={shortChartOptions()} customDates={dimensionCustom} onCustomDatesChange={setDimensionCustom} />}
        >
          <CoverageBarChart data={data.dimensionCoverage} />
        </DashboardChartCard>

        <DashboardChartCard
          title="用户评价分布"
          extra={<ChartTimeFilter value={ratingRange} onChange={setRatingRange} options={shortChartOptions()} customDates={ratingCustom} onCustomDatesChange={setRatingCustom} />}
        >
          <UserRatingDistributionBars
            rows={data.userRatingDistribution}
            rate={data.userRatingRate}
          />
        </DashboardChartCard>

        <DashboardChartCard
          title="人员使用排行"
          className="md:col-span-2 xl:col-span-2"
          extra={<ChartTimeFilter value={userRange} onChange={setUserRange} options={shortChartOptions()} customDates={userCustom} onCustomDatesChange={setUserCustom} />}
        >
          <TopUsersScrollableList users={data.topUsers} />
        </DashboardChartCard>
      </div>

      <div className={CHART_CARD}>
        <div className={`${CHART_HEAD} border-b border-border/60 pb-3 mb-0`}>
          <span className="font-semibold text-sm text-foreground/85">最近生成记录</span>
          <div className="flex gap-2 ml-auto flex-wrap items-center">
            <input
              type="search"
              placeholder="搜索需求…"
              value={recordSearch}
              onChange={(e) => setRecordSearch(e.target.value)}
              className="border border-border rounded px-2 py-1 text-xs w-32 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <input
              type="text"
              placeholder="工单ID"
              value={ticketIdSearch}
              onChange={(e) => setTicketIdSearch(e.target.value)}
              className="border border-border rounded px-2 py-1 text-xs w-24 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <select
              value={recordFilter}
              onChange={(e) => setRecordFilter(e.target.value as RecordFilter)}
              className="border border-border rounded px-2 py-1 text-xs bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="筛选记录"
            >
              <option value="all">全部</option>
              <option value="rated">有评价</option>
              <option value="unrated">无评价</option>
            </select>
            <ChartTimeFilter value={recordRange} onChange={setRecordRange} customDates={recordCustom} onCustomDatesChange={setRecordCustom} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">需求名称</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">生成人</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">工单ID</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">工单地址</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">用例条数</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">可用率</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap bg-amber-100/80 text-amber-900">
                  用户评价
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">生成时间</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">人工时间</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">复核时间</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">类型</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    暂无生成记录
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    无匹配记录
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row) => {
                  const ticketUrl = row.ticketId
                    ? `https://xz.corpautohome.com/requirement/detail/${row.ticketId}`
                    : null;
                  const formattedTime = row.time
                    ? new Date(row.time).toLocaleString("zh-CN", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false
                      }).replace(/\//g, "-")
                    : "-";

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border/40 hover:bg-blue-50/60 transition-colors"
                    >
                      <td
                        className="px-4 py-3 max-w-[12rem] truncate cursor-pointer"
                        title={row.req}
                        onClick={() => onRecordClick(row.id)}
                      >
                        {row.req}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.user}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.ticketId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(row.ticketId!);
                            }}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 group"
                            title="点击复制"
                          >
                            <span className="tabular-nums">{row.ticketId}</span>
                            <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {ticketUrl ? (
                          <a
                            href={ticketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                          >
                            查看
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-right">{row.count || 0}</td>
                      <td className="px-4 py-3 text-right">
                        {row.usabilityRate !== null ? (
                          <span className={`px-1.5 py-0.5 rounded tabular-nums ${getUsabilityRateColor(row.usabilityRate)}`}>
                            {row.usabilityRate}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top bg-amber-50/40">
                        <UserRatingCell rating={row.userRating} comment={row.userComment} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formattedTime}</td>
                      <td className="px-4 py-3 tabular-nums text-right text-muted-foreground">
                        {row.manualDuration !== null ? `${row.manualDuration}分钟` : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-right text-muted-foreground">
                        {row.reviewDuration !== null ? `${row.reviewDuration}分钟` : "—"}
                      </td>
                      <td className="px-4 py-3">{row.category}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function Dashboard() {
  const router = useRouter();
  const [kpiRange, setKpiRange] = useState<KpiRange>("7d");
  const [kpiCustom, setKpiCustom] = useState<CustomDates>({ start: "", end: "" });
  const [trendRange, setTrendRange] = useState<ChartRange>("30d");
  const [trendCustom, setTrendCustom] = useState<CustomDates>({ start: "", end: "" });
  const [categoryRange, setCategoryRange] = useState<ChartRange>("30d");
  const [categoryCustom, setCategoryCustom] = useState<CustomDates>({ start: "", end: "" });
  const [dimensionRange, setDimensionRange] = useState<ChartRange>("30d");
  const [dimensionCustom, setDimensionCustom] = useState<CustomDates>({ start: "", end: "" });
  const [ratingRange, setRatingRange] = useState<ChartRange>("30d");
  const [ratingCustom, setRatingCustom] = useState<CustomDates>({ start: "", end: "" });
  const [userRange, setUserRange] = useState<ChartRange>("30d");
  const [userCustom, setUserCustom] = useState<CustomDates>({ start: "", end: "" });
  const [recordRange, setRecordRange] = useState<ChartRange>("30d");
  const [recordCustom, setRecordCustom] = useState<CustomDates>({ start: "", end: "" });
  const [includeAi, setIncludeAi] = useState(false);

  const params = new URLSearchParams({
    kpiRange,
    trendRange,
    categoryRange,
    dimensionRange,
    ratingRange,
    userRange,
    recordRange,
  });
  if (includeAi) {
    params.set("includeAi", "true");
  }
  if (kpiRange === "custom" && kpiCustom.start && kpiCustom.end) {
    params.set("kpiStart", kpiCustom.start);
    params.set("kpiEnd", kpiCustom.end);
  }
  if (trendRange === "custom" && trendCustom.start && trendCustom.end) {
    params.set("trendStart", trendCustom.start);
    params.set("trendEnd", trendCustom.end);
  }
  if (categoryRange === "custom" && categoryCustom.start && categoryCustom.end) {
    params.set("categoryStart", categoryCustom.start);
    params.set("categoryEnd", categoryCustom.end);
  }
  if (dimensionRange === "custom" && dimensionCustom.start && dimensionCustom.end) {
    params.set("dimensionStart", dimensionCustom.start);
    params.set("dimensionEnd", dimensionCustom.end);
  }
  if (ratingRange === "custom" && ratingCustom.start && ratingCustom.end) {
    params.set("ratingStart", ratingCustom.start);
    params.set("ratingEnd", ratingCustom.end);
  }
  if (userRange === "custom" && userCustom.start && userCustom.end) {
    params.set("userStart", userCustom.start);
    params.set("userEnd", userCustom.end);
  }
  if (recordRange === "custom" && recordCustom.start && recordCustom.end) {
    params.set("recordStart", recordCustom.start);
    params.set("recordEnd", recordCustom.end);
  }

  const { data, error, isFetching } = useQuery<StatsData>({
    queryKey: ["stats", kpiRange, kpiCustom, trendRange, trendCustom, categoryRange, categoryCustom, dimensionRange, dimensionCustom, ratingRange, ratingCustom, userRange, userCustom, recordRange, recordCustom, includeAi],
    queryFn: () => fetch(`/api/stats?${params}`).then((r) => r.json()),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="pb-16 min-h-0">
      <DashboardPageHeader />
      {!data ? (
        <div className={`${CHART_CARD} py-24 flex items-center justify-center`}>
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className={`${CHART_CARD} py-24 flex items-center justify-center text-muted-foreground text-sm`}>
          数据加载失败
        </div>
      ) : (
        <div className={isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
        <DashboardBody
          data={data}
          kpiRange={kpiRange}
          setKpiRange={setKpiRange}
          kpiCustom={kpiCustom}
          setKpiCustom={setKpiCustom}
          trendRange={trendRange}
          setTrendRange={setTrendRange}
          trendCustom={trendCustom}
          setTrendCustom={setTrendCustom}
          categoryRange={categoryRange}
          setCategoryRange={setCategoryRange}
          categoryCustom={categoryCustom}
          setCategoryCustom={setCategoryCustom}
          dimensionRange={dimensionRange}
          setDimensionRange={setDimensionRange}
          dimensionCustom={dimensionCustom}
          setDimensionCustom={setDimensionCustom}
          ratingRange={ratingRange}
          setRatingRange={setRatingRange}
          ratingCustom={ratingCustom}
          setRatingCustom={setRatingCustom}
          userRange={userRange}
          setUserRange={setUserRange}
          userCustom={userCustom}
          setUserCustom={setUserCustom}
          recordRange={recordRange}
          setRecordRange={setRecordRange}
          recordCustom={recordCustom}
          setRecordCustom={setRecordCustom}
          includeAi={includeAi}
          setIncludeAi={setIncludeAi}
          onRecordClick={(id) => router.replace(`/usecase-gen?tab=history&taskId=${id}&from=dashboard`, { scroll: false })}
        />
        </div>
      )}
    </div>
  );
}
