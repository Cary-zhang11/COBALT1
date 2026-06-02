"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Users, Target, Clock, Loader2,
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
  };
  dailyTrend: { date: string; count: number; avgScore: number }[];
  categoryDistribution: { category: string; count: number }[];
  dimensionCoverage: { name: string; covered: number; total: number }[];
  topUsers: { userName: string; count: number }[];
  efficiency: {
    avgScore: number;
    avgDuration: number;
    avgTokens: number;
    editRate: number;
  };
  recentRecords: {
    time: string;
    user: string;
    req: string;
    count: number;
    score: number;
    tokens: number;
    category: string;
  }[];
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function formatDuration(ms: number): string {
  return (ms / 60000).toFixed(1) + " 分钟";
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        数据加载失败
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "累计用例数", value: data.kpi.totalCases.toLocaleString(), icon: BarChart3, color: "text-primary", bg: "bg-primary/10" },
          { label: "月活跃用户", value: data.kpi.monthlyActiveUsers.toString(), icon: Users, color: "text-emerald-600", bg: "bg-emerald-100" },
          { label: "平均质量分", value: data.kpi.avgQualityScore.toString(), icon: Target, color: "text-amber-600", bg: "bg-amber-100" },
          { label: "平均耗时", value: formatDuration(data.kpi.avgDuration), icon: Clock, color: "text-violet-600", bg: "bg-violet-100" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} className="bg-card rounded-xl shadow-sm p-5 flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                <p className={`text-3xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.bg}`}>
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="col-span-2 bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">每日生成量 &amp; 质量分趋势</h4>
          <div className="focus:outline-none">
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
        </div>
        <div className="bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">需求类型分布</h4>
          <div className="focus:outline-none">
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
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">覆盖维度分布</h4>
          <div className="focus:outline-none">
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
        </div>
        <div className="col-span-2 bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">人员使用 Top 10</h4>
          <div className="focus:outline-none">
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
      </div>

      {/* Efficiency */}
      <div className="bg-card rounded-xl shadow-sm p-5 mb-4 border-l-4 border-cyan-400">
        <h4 className="font-semibold text-sm mb-3">生成效率统计</h4>
        <div className="grid grid-cols-4 gap-4 text-center">
          {[
            { v: data.efficiency.avgScore.toString(), l: "平均质量分" },
            { v: formatDuration(data.efficiency.avgDuration), l: "平均耗时" },
            { v: data.efficiency.avgTokens.toLocaleString(), l: "平均 Token" },
            { v: Math.round(data.efficiency.editRate * 100) + "%", l: "用例编辑率" },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-xl font-bold text-cyan-600">{s.v}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="bg-card rounded-xl shadow-sm p-5">
        <h4 className="font-semibold text-sm mb-4">最近生成记录</h4>
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-2 pr-3 text-muted-foreground font-medium">时间</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">用户</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">需求名</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">用例数</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">质量分</th>
              <th className="pb-2 pr-3 text-muted-foreground font-medium">Token</th>
              <th className="pb-2 text-muted-foreground font-medium">类型</th>
            </tr>
          </thead>
          <tbody>
            {data.recentRecords.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted">
                <td className="py-2.5 pr-3 text-muted-foreground">{row.time}</td>
                <td className="py-2.5 pr-3">{row.user}</td>
                <td className="py-2.5 pr-3 max-w-32 truncate">{row.req}</td>
                <td className="py-2.5 pr-3 font-medium">{row.count}</td>
                <td className="py-2.5 pr-3">
                  <span className={`px-1.5 py-0.5 rounded ${row.score >= 90 ? "text-green-600 bg-green-50" : row.score >= 60 ? "text-amber-600 bg-amber-50" : "text-red-500 bg-red-50"}`}>
                    {row.score}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">{row.tokens.toLocaleString()}</td>
                <td className="py-2.5">{row.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
