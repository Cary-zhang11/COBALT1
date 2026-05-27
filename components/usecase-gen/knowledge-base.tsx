"use client";

import { useState } from "react";
import { mockKBTabs, mockKBTags, mockKBItems, mockPromptTemplates } from "./shared/mock-data";
import { FileText, Plus } from "lucide-react";

export function KnowledgeBase() {
  const [kbTab, setKbTab] = useState(0);

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Sub-tab bar */}
      <div className="bg-card rounded-xl shadow-sm p-1 flex gap-1 mb-4 w-fit">
        {mockKBTabs.map((t, i) => (
          <button key={i} onClick={() => setKbTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${kbTab === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Filters */}
        <div className="w-48 flex-shrink-0 space-y-3">
          <div className="bg-card rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">搜索</p>
            <input type="text" placeholder="关键词..." className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="bg-card rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">标签筛选</p>
            <div className="space-y-1">
              {mockKBTags.map((tag, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-cyan-500 w-3 h-3" />
                  <span className="text-xs">{tag}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {kbTab < 3 && (
            <div>
              <div className="space-y-2">
                {(mockKBItems[kbTab] || []).map((item, i) => (
                  <div key={i} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">{item.date}</span>
                        {item.tags.map((tag, ti) => (
                          <span key={ti} className="text-xs bg-muted text-muted-foreground px-1.5 rounded">{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-center flex-shrink-0">
                      <p className="text-lg font-bold text-cyan-500">{item.refs}</p>
                      <p className="text-xs text-muted-foreground">引用次数</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground">预览</button>
                      <button className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg">删除</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:border-cyan-500 hover:text-cyan-500 transition-all flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />添加新条目
              </button>
            </div>
          )}

          {kbTab === 3 && (
            <div className="space-y-3">
              {mockPromptTemplates.map((pt, i) => (
                <div key={i} className="bg-card rounded-xl shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{pt.name}</span>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{pt.version}</span>
                      {pt.active ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">线上</span> : <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">草稿</span>}
                    </div>
                    <div className="flex gap-2">
                      {!pt.active && <button className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded-lg">上线</button>}
                      <button className="text-xs border border-border text-muted-foreground px-3 py-1 rounded-lg">编辑</button>
                      <button className="text-xs border border-border text-muted-foreground px-3 py-1 rounded-lg">复制</button>
                    </div>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground leading-relaxed max-h-24 overflow-hidden relative">
                    {pt.content}
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted to-transparent" />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>被使用 {pt.usage} 次</span><span>平均质量分 {pt.avgScore}</span><span>更新于 {pt.date}</span>
                    </div>
                    <span className={`text-xs ${pt.active ? "text-green-600" : "text-muted-foreground"}`}>{pt.active ? "当前线上版本" : "历史版本"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
