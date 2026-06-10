"use client";

import { useState } from "react";
import type { UsecaseModule, UsecaseCase } from "./shared/types";
import { mockQuickActions } from "./shared/mock-data";
import { ChevronRight, Download, Wand2, CheckCircle2 } from "lucide-react";

interface CaseEditorProps {
  usecaseTree: UsecaseModule[] | null;
}

export function CaseEditor({ usecaseTree }: CaseEditorProps) {
  const [modules, setModules] = useState<UsecaseModule[]>(usecaseTree || []);
  const [selectedCase, setSelectedCase] = useState<UsecaseCase | null>(null);
  const [showSaveTip, setShowSaveTip] = useState(false);

  const totalCases = modules.reduce((s, m) => s + m.cases.length, 0);
  const p0 = modules.flatMap((m) => m.cases).filter((c) => c.priority === "P0").length;
  const p1 = modules.flatMap((m) => m.cases).filter((c) => c.priority === "P1").length;
  const p2 = modules.flatMap((m) => m.cases).filter((c) => c.priority === "P2").length;

  if (!usecaseTree || usecaseTree.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <div className="text-center">
          <Wand2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="text-sm text-muted-foreground">暂无生成结果，请先在「生成向导」中生成用例</p>
        </div>
      </div>
    );
  }

  const toggleModule = (mi: number) => {
    const next = [...modules];
    next[mi] = { ...next[mi], open: !next[mi].open };
    setModules(next);
  };

  const selectCase = (c: UsecaseCase) => {
    setSelectedCase({ ...c });
  };

  const updateCase = (field: keyof UsecaseCase, value: string) => {
    if (!selectedCase) return;
    setSelectedCase({ ...selectedCase, [field]: value });
  };

  return (
    <div className="flex flex-col flex-1">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">用例编辑</h1>
        <p className="text-sm text-muted-foreground mt-1">编辑 AI 生成的测试用例，保存后可反哺知识库</p>
      </header>

      <div className="bg-card rounded-xl shadow-sm px-4 py-3 flex items-center justify-between mb-4 flex-shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button disabled className="border border-border text-muted-foreground px-3 py-1.5 rounded-lg text-xs cursor-not-allowed">版本对比</button>
          <button disabled className="border border-border text-muted-foreground px-3 py-1.5 rounded-lg text-xs cursor-not-allowed flex items-center gap-1"><Download className="w-3.5 h-3.5" />导出 XMind</button>
          <button disabled className="border border-border text-muted-foreground px-3 py-1.5 rounded-lg text-xs cursor-not-allowed flex items-center gap-1"><Download className="w-3.5 h-3.5" />导出 Excel</button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>共 {totalCases} 个用例</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />P0 {p0}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />P1 {p1}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/40" />P2 {p2}</span>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Tree */}
        <div className="w-72 flex-shrink-0 bg-card rounded-xl shadow-sm p-4 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">用例树结构</div>
          {modules.map((mod, mi) => (
            <div key={mi} className="mb-1">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer group" onClick={() => toggleModule(mi)}>
                <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${mod.open ? "rotate-90" : ""}`} />
                <span className="text-sm font-medium flex-1">{mod.name}</span>
                <span className="text-xs bg-muted text-muted-foreground px-1.5 rounded">{mod.cases.length}</span>
              </div>
              {mod.open && mod.cases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => selectCase(c)}
                  className={`ml-4 flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm border transition-all ${
                    selectedCase?.id === c.id ? "bg-primary/10 border-primary/30 text-primary" : "border-transparent hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${c.priority === "P0" ? "bg-red-500" : c.priority === "P1" ? "bg-orange-400" : "bg-muted-foreground/30"}`} />
                  <span className="truncate">{c.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Center: Detail */}
        <div className="flex-1 bg-card rounded-xl shadow-sm p-5 overflow-y-auto">
          {selectedCase ? (
            <div>
              <h3 className="font-semibold text-lg mb-4">{selectedCase.title}</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">前置条件</label>
                  <textarea value={selectedCase.precondition} onChange={(e) => updateCase("precondition", e.target.value)} rows={2} className="w-full border border-border rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">测试步骤</label>
                  <textarea value={selectedCase.steps} onChange={(e) => updateCase("steps", e.target.value)} rows={4} className="w-full border border-border rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">预期结果</label>
                  <textarea value={selectedCase.expected} onChange={(e) => updateCase("expected", e.target.value)} rows={3} className="w-full border border-border rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">优先级</label>
                    <select value={selectedCase.priority} onChange={(e) => updateCase("priority", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
                      <option>P0</option><option>P1</option><option>P2</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">标签</label>
                    <input value={selectedCase.tags} onChange={(e) => updateCase("tags", e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Wand2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">← 点击左侧用例查看详情</p>
            </div>
          )}
        </div>
      </div>

      {/* Save bar */}
      <div className="mt-4 bg-card rounded-xl shadow-sm px-5 py-3 flex items-center justify-between flex-shrink-0">
        <p className="text-xs text-muted-foreground">你的编辑修改会作为 few-shot 样例反哺到知识库</p>
        <div className="flex gap-2">
          <button className="border border-border text-muted-foreground px-4 py-2 rounded-lg text-sm">放弃修改</button>
          <button onClick={() => { setShowSaveTip(true); setTimeout(() => setShowSaveTip(false), 2000); }} className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />保存修改
          </button>
        </div>
      </div>
      {showSaveTip && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50">保存成功</div>
      )}
    </div>
  );
}
