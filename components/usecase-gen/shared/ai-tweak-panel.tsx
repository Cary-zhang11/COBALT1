"use client";

import { useState } from "react";
import { Send, Loader2, History, CheckCircle2, AlertCircle } from "lucide-react";
import type { TweakEntry } from "./types";

interface AITweakPanelProps {
  taskId: string | null;
  generating: boolean;
  modules: string[];
  tweakHistory: TweakEntry[];
  onTweakStarted: () => void;
  onCancelTweak: () => void;
  onRecordTweak: (entry: TweakEntry) => void;
  onTweakHistoryUpdate: (history: TweakEntry[]) => void;
  sectioned?: boolean;
}

const QUICK_CHIPS = [
  "补充边界场景",
  "增加异常覆盖",
  "精简步骤描述",
  "提升P0覆盖率",
  "增加安全场景",
  "补充兼容测试",
];

export function AITweakPanel({
  taskId,
  generating,
  modules,
  tweakHistory,
  onTweakStarted,
  onCancelTweak,
  onRecordTweak,
  onTweakHistoryUpdate,
  sectioned,
}: AITweakPanelProps) {
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("all");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !taskId || sending) return;

    const instruction =
      scope !== "all" && scope ? `${text}（仅针对"${scope}"模块）` : text;

    setInput("");
    setSending(true);

    try {
      if (generating) {
        await fetch(`/api/tasks/${taskId}/inject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, scope: scope !== "all" ? scope : undefined }),
        });
      } else {
        const res = await fetch(`/api/tasks/${taskId}/tweak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, scope: scope !== "all" ? scope : undefined }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("Tweak POST failed:", errData.error || res.status);
          return;
        }

        const data = await res.json();

        if (data.tweakHistory) {
          onTweakHistoryUpdate(
            data.tweakHistory as TweakEntry[]
          );
        } else {
          onRecordTweak({
            round: data.round || tweakHistory.length + 1,
            instruction: text,
            time: new Date().toLocaleString("zh-CN"),
            delta: scope !== "all" ? `模块: ${scope}` : "全部模块",
            status: "running",
          });
        }

        onTweakStarted();
      }
    } finally {
      setSending(false);
    }
  };

  const body = (
    <>
      {!sectioned && <h3 className="font-semibold text-sm mb-3">AI 微调</h3>}

      {/* Quick chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => setInput(chip)}
            className={`px-2.5 py-1 rounded-lg text-xs border font-medium transition-all ${
              input === chip
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Scope + input */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground flex-shrink-0">范围:</span>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          disabled={modules.length === 0 || generating}
          className="border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-40"
        >
          <option value="all">全部模块</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={
            generating
              ? "注入追加指令，如「补充短信登录场景」"
              : "描述想要的修改，如「给登录模块补充异常场景」"
          }
          className="flex-1 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending || !taskId}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40 transition-opacity flex items-center gap-1.5"
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          发送
        </button>
      </div>

      {/* Tweak history as unified timeline */}
      {tweakHistory.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <History className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              微调记录 ({tweakHistory.length})
            </span>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {tweakHistory.slice().reverse().map((entry, i) => (
              <div
                key={entry.round}
                className="bg-muted/40 rounded-lg px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    {entry.status === "running" ? (
                      <Loader2 className="w-3 h-3 text-primary animate-spin" />
                    ) : entry.status === "failed" ? (
                      <AlertCircle className="w-3 h-3 text-red-500" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    )}
                    <span className="font-medium text-foreground">
                      第 {entry.round} 轮
                    </span>
                  </div>
                  <span className="text-muted-foreground">{entry.time}</span>
                </div>
                <p className="text-muted-foreground">{entry.instruction}</p>
                <div className="flex items-center gap-2 mt-1">
                  {entry.delta && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary">
                      {entry.delta}
                    </span>
                  )}
                  {entry.summary && (
                    <span className="text-xs text-emerald-600">{entry.summary}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  if (sectioned) {
    return (
      <div data-ai-tweak>
        {body}
      </div>
    );
  }

  return (
    <div id="step3-ai-tweak" className="bg-card rounded-xl shadow-sm p-5" data-ai-tweak>
      {body}
    </div>
  );
}
