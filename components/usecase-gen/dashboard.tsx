"use client";

import { mockKPICards, mockRecords } from "./shared/mock-data";
import { BarChart3 } from "lucide-react";

export function Dashboard() {
  return (
    <div className="flex-1 overflow-auto p-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {mockKPICards.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} className="bg-card rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                  <p className={`text-xs mt-1 ${kpi.reverse ? (kpi.trend < 0 ? "text-green-600" : "text-red-500") : (kpi.trend > 0 ? "text-green-600" : "text-red-500")}`}>
                    {kpi.trend > 0 ? "↑" : "↓"} {Math.abs(kpi.trend)}% 较上月
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.bg}`}>
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="col-span-2 bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">每日生成量 &amp; 质量分趋势</h4>
          <div className="h-44 flex items-center justify-center"><p className="text-xs text-muted-foreground">recharts 折线图</p></div>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">需求类型分布</h4>
          <div className="h-44 flex items-center justify-center"><p className="text-xs text-muted-foreground">recharts 饼图</p></div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">覆盖维度分布</h4>
          <div className="h-44 flex items-center justify-center"><p className="text-xs text-muted-foreground">recharts 饼图</p></div>
        </div>
        <div className="col-span-2 bg-card rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-4">人员使用 Top 10</h4>
          <div className="h-44 flex items-center justify-center"><p className="text-xs text-muted-foreground">recharts 柱状图</p></div>
        </div>
      </div>

      {/* Efficiency */}
      <div className="bg-card rounded-xl shadow-sm p-5 mb-4 border-l-4 border-cyan-400">
        <h4 className="font-semibold text-sm mb-3">生成效率统计</h4>
        <div className="grid grid-cols-4 gap-4 text-center">
          {[{ v: "91.7", l: "平均质量分" }, { v: "4.8s", l: "平均耗时" }, { v: "3.8K", l: "平均 Token" }, { v: "28%", l: "用例编辑率" }].map((s, i) => (
            <div key={i}><p className="text-xl font-bold text-cyan-600">{s.v}</p><p className="text-xs text-muted-foreground mt-0.5">{s.l}</p></div>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="bg-card rounded-xl shadow-sm p-5">
        <h4 className="font-semibold text-sm mb-4">最近生成记录</h4>
        <table className="w-full text-xs text-left">
          <thead><tr className="border-b border-border">
            <th className="pb-2 pr-3 text-muted-foreground font-medium">时间</th><th className="pb-2 pr-3 text-muted-foreground font-medium">用户</th>
            <th className="pb-2 pr-3 text-muted-foreground font-medium">需求名</th><th className="pb-2 pr-3 text-muted-foreground font-medium">用例数</th>
            <th className="pb-2 pr-3 text-muted-foreground font-medium">质量分</th><th className="pb-2 pr-3 text-muted-foreground font-medium">Token</th>
            <th className="pb-2 text-muted-foreground font-medium">方案</th>
          </tr></thead>
          <tbody>
            {mockRecords.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted">
                <td className="py-2.5 pr-3 text-muted-foreground">{row.time}</td>
                <td className="py-2.5 pr-3"><span>{row.user}</span></td>
                <td className="py-2.5 pr-3 max-w-32 truncate">{row.req}</td>
                <td className="py-2.5 pr-3 font-medium">{row.count}</td>
                <td className="py-2.5 pr-3"><span className={`px-1.5 py-0.5 rounded ${row.score >= 90 ? "text-green-600 bg-green-50" : "text-amber-600 bg-amber-50"}`}>{row.score}</span></td>
                <td className="py-2.5 pr-3 text-muted-foreground">{row.tokens.toLocaleString()}</td>
                <td className="py-2.5"><span className="px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">方案{row.scheme}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
