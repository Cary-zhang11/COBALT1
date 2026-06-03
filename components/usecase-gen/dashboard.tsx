"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Users, Target, Clock, Loader2, Star,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer,
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

function formatDuration(ms: number): string {
  return (ms / 60000).toFixed(1) + " 分钟";
}

function UserRatingDistributionBars({
  rows,
}: {
  rows: { stars: number; count: number }[];
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const ordered = [...rows].sort((a, b) => b.stars - a.stars);

  if (total === 0) {
    return (
      <div className="min-h-[176px] flex items-center justify-center text-xs text-muted-foreground">
        暂无评价数据
      </div>
    );
  }

  return (
    <div className="min-h-[176px] flex flex-col justify-center gap-2 py-1">
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
      <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/50">
        共 {total} 条评价（按星级占比）
      </p>
    </div>
  );
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

export function Dashboard() {
  const { data, isLoading, error } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-16">
        数据加载失败
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground/90">数据看板</h1>
        <p className="text-sm text-muted-foreground mt-1">用例生成统计 · 质量与用户评价概览</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-2">
        {[
          { label: "累计用例数", value: data.kpi.totalCases.toLocaleString(), icon: BarChart3, color: "text-primary", bg: "bg-primary/10" },
          { label: "月活跃用户", value: data.kpi.monthlyActiveUsers.toString(), icon: Users, color: "text-emerald-600", bg: "bg-emerald-100" },
          { label: "AI 平均质量分", value: data.kpi.avgQualityScore.toString(), icon: Target, color: "text-amber-600", bg: "bg-amber-100" },
          { label: "平均耗时", value: formatDuration(data.kpi.avgDuration), icon: Clock, color: "text-violet-600", bg: "bg-violet-100" },
          {
            label: "用户平均评分",
            value: data.kpi.avgUserRating > 0 ? data.kpi.avgUserRating.toFixed(1) : "—",
            icon: Star,
            color: "text-rose-600",
            bg: "bg-rose-100",
          },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} className="bg-card rounded-xl border border-border/60 shadow-sm p-5 flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                <p className={`text-3xl font-bold mt-1 tabular-nums ${kpi.color}`}>{kpi.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.bg}`}>
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mb-6 px-1">
        第五格为 TaskFeedback 评分均值（1–5），与「AI 平均质量分」勿混用
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border/60 shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">每日生成量 &amp; 质量分趋势</h4>
          <ResponsiveContainer width="100%" height={176}>
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
        <div className="bg-card rounded-xl border border-border/60 shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">需求类型分布</h4>
          <ResponsiveContainer width="100%" height={176}>
            <PieChart>
              <Pie data={data.categoryDistribution} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={60} label={({ name }) => name as string}>
                {data.categoryDistribution.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <div className="bg-card rounded-xl border border-border/60 shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">覆盖维度分布</h4>
          <ResponsiveContainer width="100%" height={176}>
            <PieChart>
              <Pie data={data.dimensionCoverage} dataKey="covered" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name }) => (name as string).slice(0, 4)}>
                {data.dimensionCoverage.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card rounded-xl border border-border/60 shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-1">用户评价分布</h4>
          <p className="text-[10px] text-muted-foreground mb-3">近 30 天 · 1–5 星占比</p>
          <UserRatingDistributionBars rows={data.userRatingDistribution} />
        </div>
        <div className="md:col-span-2 xl:col-span-2 bg-card rounded-xl border border-border/60 shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">人员使用 Top 10</h4>
          <ResponsiveContainer width="100%" height={176}>
            <BarChart data={data.topUsers} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="userName" width={80} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" name="生成数" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-sm">最近生成记录</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-muted-foreground font-medium">时间</th>
                <th className="px-4 py-2.5 text-muted-foreground font-medium">用户</th>
                <th className="px-4 py-2.5 text-muted-foreground font-medium">需求名</th>
                <th className="px-4 py-2.5 text-muted-foreground font-medium">用例数</th>
                <th className="px-4 py-2.5 text-muted-foreground font-medium">AI质量分</th>
                <th className="px-4 py-2.5 text-muted-foreground font-medium">用户评价</th>
                <th className="px-4 py-2.5 text-muted-foreground font-medium">Token</th>
                <th className="px-4 py-2.5 text-muted-foreground font-medium">类型</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRecords.map((row, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.time}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.user}</td>
                  <td className="px-4 py-3 max-w-[8rem] truncate" title={row.req}>{row.req}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{row.count}</td>
                  <td className="px-4 py-3">
                    <span className={`px-1.5 py-0.5 rounded tabular-nums ${row.score >= 90 ? "text-green-600 bg-green-50" : row.score >= 60 ? "text-amber-600 bg-amber-50" : "text-red-500 bg-red-50"}`}>
                      {row.score}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top bg-amber-50/40">
                    <UserRatingCell rating={row.userRating} comment={row.userComment} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{row.tokens.toLocaleString()}</td>
                  <td className="px-4 py-3">{row.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
