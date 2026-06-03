"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { UsecaseModule } from "./types";

interface ModuleOverviewTableProps {
  modules: UsecaseModule[];
  totalCases: number;
}

export function ModuleOverviewTable({ modules, totalCases }: ModuleOverviewTableProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border/60 overflow-hidden">
      <div
        className="px-5 py-3 flex items-center justify-between gap-2 border-b bg-muted/20 min-h-[44px] cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="font-semibold text-sm">
          模块用例概览{" "}
          <span className="text-muted-foreground font-normal">
            ({modules.length} 模块 · {totalCases} 用例)
          </span>
        </h3>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>
      {expanded && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-t bg-muted/30">
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">模块</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">用例数</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">P0 / P1 / P2</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((mod, mi) => {
              const p0 = mod.cases.filter((c) => c.priority === "P0").length;
              const p1 = mod.cases.filter((c) => c.priority === "P1").length;
              const p2 = mod.cases.filter((c) => c.priority === "P2").length;
              return (
                <tr key={mi} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium">{mod.name}</td>
                  <td className="text-center px-4 py-3">{mod.cases.length}</td>
                  <td className="text-center px-4 py-3">
                    <span className="inline-flex gap-1">
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{p0}</span>
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">{p1}</span>
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">{p2}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
