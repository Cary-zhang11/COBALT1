"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3, Users, Target, Clock, Loader2, Star,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

interface StatsData {
  kpi: {
    totalCases: number;
    monthlyActiveUsers: number;
    avgQualityScore: number;
    avgDuration: number;
    avgUserRating: number;
  };
  dailyTrend: { date: string; count: number; avgScore: number }[];
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
    totalCases:        { current: number; previous: number; changePercent: number | null };
    monthlyActiveUsers:{ current: number; previous: number; changePercent: number | null };
    avgQualityScore:   { current: number; previous: number; changePercent: number | null };
    avgDuration:       { current: number; previous: number; changePercent: number | null };
    avgUserRating:     { current: number; previous: number; changePercent: number | null };
  };
  recentRecords: {
    time: string;
    user: string;
    req: string;
    count: number;
    score: number;
    tokens: number;
    category: string;
    userRating: number | null;
    userComment: string | null;
  }[];
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

/** 对齐 preview .ant-stat-card / .ant-chart-card */
const STAT_CARD =
  "bg-card rounded-lg border border-border/60 px-6 py-5 flex items-start justify-between";
const CHART_CARD = "bg-card rounded-lg border border-border/60 overflow-hidden";
const CHART_HEAD = "flex items-center justify-between gap-2 flex-wrap px-6 pt-4";
const CHART_BODY = "px-6 pb-6 pt-3 h-[200px]";

function formatDuration(ms: number): string {
  return (ms / 60000).toFixed(1) + " 分钟";
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
}: {
  title: string;
  extra?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${CHART_CARD} ${className}`}>
      <div className={CHART_HEAD}>
        <span className="font-semibold text-sm text-foreground/85">{title}</span>
        {extra ? <span className="text-xs text-muted-foreground">{extra}</span> : null}
      </div>
      <div className={CHART_BODY}>{children}</div>
    </div>
  );
}

function TrendLegend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-0.5 bg-[#3b82f6] rounded" />
        生成量（左轴）
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-0.5 bg-[#10b981] rounded" />
        质量分（右轴）
      </span>
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

function TopUsersHorizontalBars({
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
    <div className="h-full flex flex-col justify-center gap-2">
      {users.map((u) => (
        <div key={u.userName} className="flex items-center gap-2 text-xs">
          <span className="w-10 text-muted-foreground truncate shrink-0" title={u.userName}>
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
      <div className="w-full h-full">{children}</div>
    </div>
  );
}

type RecentRecord = StatsData["recentRecords"][number];

type RecordFilter = "all" | "rated" | "unrated";

function filterRecentRecords(
  rows: RecentRecord[],
  search: string,
  filter: RecordFilter,
): RecentRecord[] {
  return rows.filter((row) => {
    if (filter === "rated" && row.userRating == null) return false;
    if (filter === "unrated" && row.userRating != null) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      row.req.toLowerCase().includes(q) ||
      row.user.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q)
    );
  });
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

function DashboardBody({ data }: { data: StatsData }) {
  const [recordSearch, setRecordSearch] = useState("");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("all");

  const filteredRecords = useMemo(
    () => filterRecentRecords(data.recentRecords, recordSearch, recordFilter),
    [data.recentRecords, recordSearch, recordFilter],
  );

  const kpis = [
    { label: "累计用例数", value: data.kpi.totalCases.toLocaleString(), icon: BarChart3, bg: "bg-primary/10", iconColor: "text-primary", trendKey: "totalCases" as const },
    { label: "月活跃用户", value: data.kpi.monthlyActiveUsers.toString(), icon: Users, bg: "bg-emerald-100", iconColor: "text-emerald-600", trendKey: "monthlyActiveUsers" as const },
    { label: "AI 平均质量分", value: data.kpi.avgQualityScore.toString(), icon: Target, bg: "bg-amber-100", iconColor: "text-amber-600", trendKey: "avgQualityScore" as const },
    { label: "平均耗时", value: formatDuration(data.kpi.avgDuration), icon: Clock, bg: "bg-violet-100", iconColor: "text-violet-600", trendKey: "avgDuration" as const },
    {
      label: "用户平均评分",
      value: data.kpi.avgUserRating > 0 ? data.kpi.avgUserRating.toFixed(1) : "—",
      icon: Star,
      bg: "bg-amber-50",
      iconColor: "text-amber-700",
      trendKey: "avgUserRating" as const,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className={STAT_CARD}>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground mb-2">{kpi.label}</p>
                <p className="text-[30px] leading-[38px] font-semibold tabular-nums text-foreground/85">
                  {kpi.value}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {(() => {
                    const trend = data.kpiTrend[kpi.trendKey];
                    if (trend.changePercent === null) {
                      if (trend.current === 0 && trend.previous === 0) {
                        return <span className="text-muted-foreground/70">—</span>;
                      }
                      return <span className="text-emerald-600 font-medium">新增</span>;
                    }
                    const isUp = trend.changePercent > 0;
                    const isDown = trend.changePercent < 0;
                    const colorClass = isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-muted-foreground";
                    const arrow = isUp ? "↑" : isDown ? "↓" : "";
                    return (
                      <span className={`${colorClass} font-medium`}>
                        {arrow} {Math.abs(trend.changePercent)}%
                      </span>
                    );
                  })()}
                  <span className="ml-1">周同比</span>
                </p>
              </div>
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ml-4 ${kpi.bg}`}
              >
                <Icon className={`w-5 h-5 ${kpi.iconColor}`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border/60 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h4 className="font-semibold text-sm text-foreground/85">每日生成量 &amp; 质量分趋势</h4>
            <TrendLegend />
          </div>
          <div className="h-[176px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="count" stroke="#3b82f6" name="生成量" />
                <Line yAxisId="right" type="monotone" dataKey="avgScore" stroke="#10b981" name="质量分" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <DashboardChartCard title="需求类型分布">
          <PieChartCentered>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.categoryDistribution}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  label={({ name }) => name as string}
                >
                  {data.categoryDistribution.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </PieChartCentered>
        </DashboardChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <DashboardChartCard title="覆盖维度分布" extra="测试维度">
          <PieChartCentered>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.dimensionCoverage}
                  dataKey="covered"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  label={({ name }) => (name as string).slice(0, 4)}
                >
                  {data.dimensionCoverage.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </PieChartCentered>
        </DashboardChartCard>

        <DashboardChartCard title="用户评价分布" extra="近 30 天 · 1–5 星占比">
          <UserRatingDistributionBars
            rows={data.userRatingDistribution}
            rate={data.userRatingRate}
          />
        </DashboardChartCard>

        <DashboardChartCard title="人员使用 Top 10" extra="近 30 天" className="md:col-span-2 xl:col-span-2">
          <TopUsersHorizontalBars users={data.topUsers} />
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
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">时间</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">用户</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">需求名</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">用例数</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">AI质量分</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap bg-amber-100/80 text-amber-900">
                  用户评价
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Token</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">类型</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    暂无生成记录
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    无匹配记录
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.time}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.user}</td>
                    <td className="px-4 py-3 max-w-[8rem] truncate" title={row.req}>
                      {row.req}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.count}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-1.5 py-0.5 rounded tabular-nums ${
                          row.score >= 90
                            ? "text-emerald-600 bg-emerald-50"
                            : row.score >= 60
                              ? "text-amber-600 bg-amber-50"
                              : "text-red-500 bg-red-50"
                        }`}
                      >
                        {row.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top bg-amber-50/40">
                      <UserRatingCell rating={row.userRating} comment={row.userComment} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {row.tokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{row.category}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  return (
    <div className="pb-16 min-h-0">
      <DashboardPageHeader />
      {isLoading ? (
        <div className={`${CHART_CARD} py-24 flex items-center justify-center`}>
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error || !data ? (
        <div className={`${CHART_CARD} py-24 flex items-center justify-center text-muted-foreground text-sm`}>
          数据加载失败
        </div>
      ) : (
        <DashboardBody data={data} />
      )}
    </div>
  );
}
