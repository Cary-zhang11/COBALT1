"use client";

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatLine {
  role: "user" | "ai";
  text: string;
}

interface AITweakPanelProps {
  taskId: string | null;
  generating: boolean;
  modules: string[];
  onTweakStarted: () => void;
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
  onTweakStarted,
}: AITweakPanelProps) {
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("all");
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !taskId || sending) return;

    const instruction =
      scope !== "all" && scope ? `${text}（仅针对"${scope}"模块）` : text;

    setChatLines((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setSending(true);

    try {
      if (generating) {
        // Inject into running session
        await fetch(`/api/tasks/${taskId}/inject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, scope: scope !== "all" ? scope : undefined }),
        });
        setChatLines((prev) => [
          ...prev,
          { role: "ai", text: "指令已注入，AI 正在调整生成方向..." },
        ]);
      } else {
        // Conversational tweak on existing result
        await fetch(`/api/tasks/${taskId}/tweak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, scope: scope !== "all" ? scope : undefined }),
        });
        setChatLines((prev) => [
          ...prev,
          { role: "ai", text: "正在基于已有用例进行修改..." },
        ]);
        onTweakStarted();
      }
    } catch {
      setChatLines((prev) => [
        ...prev,
        { role: "ai", text: "发送失败，请重试" },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-card rounded-xl shadow-sm p-5" data-ai-tweak>
      <h3 className="font-semibold text-sm mb-3">AI 微调</h3>

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

      {/* Chat history */}
      {chatLines.length > 0 && (
        <div className="mt-3 bg-muted/40 rounded-lg p-3 max-h-32 overflow-y-auto space-y-2">
          {chatLines.map((line, i) => (
            <div key={i} className="text-xs">
              <span
                className={`font-medium ${
                  line.role === "user" ? "text-primary" : "text-emerald-600"
                }`}
              >
                {line.role === "user" ? "You: " : "AI: "}
              </span>
              <span className="text-muted-foreground">{line.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
