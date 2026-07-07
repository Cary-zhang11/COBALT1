"use client";

import { useState } from "react";
import { ChevronDown, Table } from "lucide-react";
import type { UsecaseModule } from "./types";

interface ModuleOverviewTableProps {
  modules: UsecaseModule[];
  totalCases: number;
  qualityScore?: number | null;
  duration?: number | null;
}

export function ModuleOverviewTable({ modules, totalCases, qualityScore, duration }: ModuleOverviewTableProps) {
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());

  const toggleModule = (index: number) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedModules(new Set(modules.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedModules(new Set());
  };

  const allExpanded = expandedModules.size === modules.length;

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border/60 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between gap-2 border-b bg-muted/20 min-h-[44px]">
        <h3 className="font-semibold text-sm flex items-center gap-2 leading-none min-w-0">
          <Table className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="truncate">模块用例概览</span>
          <span className="text-muted-foreground font-normal">
            ({modules.length} 模块 · {totalCases} 用例)
          </span>
          {(qualityScore != null || duration != null) && (
            <span className="ml-1 pl-2 border-l border-border/60 flex items-center gap-2 text-xs text-muted-foreground font-normal">
              {qualityScore != null && (
                <span>
                  评分{" "}
                  <span
                    className={`font-semibold tabular-nums ${
                      qualityScore >= 80
                        ? "text-emerald-600"
                        : qualityScore >= 60
                        ? "text-amber-500"
                        : "text-red-500"
                    }`}
                  >
                    {qualityScore}
                  </span>
                </span>
              )}
              {qualityScore != null && duration != null && (
                <span className="text-border">·</span>
              )}
              {duration != null && (
                <span>
                  耗时{" "}
                  <span className="font-semibold tabular-nums">
                    {(duration / 60000).toFixed(1)}min
                  </span>
                </span>
              )}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={expandAll}
            disabled={allExpanded}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-40 transition-colors"
          >
            全部展开
          </button>
          <button
            type="button"
            onClick={collapseAll}
            disabled={expandedModules.size === 0}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-40 transition-colors"
          >
            全部收起
          </button>
        </div>
      </div>

      {/* Module accordion */}
      <div className="divide-y divide-border/40">
        {modules.map((mod, mi) => {
          const expanded = expandedModules.has(mi);
          const p0 = mod.cases.filter((c) => c.priority === "P0").length;
          const p1 = mod.cases.filter((c) => c.priority === "P1").length;
          const p2 = mod.cases.filter((c) => c.priority === "P2").length;

          return (
            <div key={mi}>
              {/* Module header */}
              <div
                className="px-5 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/20 transition-colors min-h-[40px]"
                onClick={() => toggleModule(mi)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${
                      expanded ? "" : "-rotate-90"
                    }`}
                  />
                  <span className="font-medium text-sm truncate">{mod.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{mod.cases.length} 用例</span>
                  <span className="inline-flex gap-1">
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">P0×{p0}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">P1×{p1}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">P2×{p2}</span>
                  </span>
                </div>
              </div>

              {/* Expanded case list */}
              {expanded && (
                <div className="px-5 pb-3 pt-1 space-y-3 bg-muted/10">
                  {mod.cases.map((tc, ci) => (
                    <div key={ci} className="border border-border/40 rounded-lg p-3 bg-card">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            tc.priority === "P0"
                              ? "bg-red-100 text-red-700"
                              : tc.priority === "P1"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {tc.priority}
                        </span>
                        <span className="font-medium text-sm">{tc.title}</span>
                      </div>
                      {tc.precondition && (
                        <div className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">前置条件：</span>
                          <span>{tc.precondition}</span>
                        </div>
                      )}
                      {tc.steps && (
                        <div className="text-xs text-muted-foreground mb-1 whitespace-pre-line">
                          <span className="font-medium">步骤：</span>
                          <span>{tc.steps}</span>
                        </div>
                      )}
                      {tc.expected && (
                        <div className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">预期结果：</span>
                          <span>{tc.expected}</span>
                        </div>
                      )}
                      {tc.tags && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">标签：</span>
                          <span>{tc.tags}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
