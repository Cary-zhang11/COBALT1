"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTasks } from "@/hooks/use-tasks";
import { getDisplayStatus } from "@/lib/task-display-status";
import {
  Loader2, Clock, FileText, AlertCircle, RefreshCw,
} from "lucide-react";

interface HistoryListProps {
  skillId: string | undefined;
  onSelectTask: (taskId: string) => void;
  onGoToGenerate?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  completed: { label: "已完成", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  running: { label: "进行中", className: "bg-blue-50 text-blue-700 border-blue-200" },
  pending: { label: "排队中", className: "bg-slate-50 text-slate-600 border-slate-200" },
  paused: { label: "已暂停", className: "bg-amber-50 text-amber-800 border-amber-200" },
  failed: { label: "失败", className: "bg-red-50 text-red-700 border-red-200" },
  cancelled: { label: "已取消", className: "bg-slate-50 text-slate-500 border-slate-200" },
};

const FILTER_CHIPS = [
  { label: "全部", value: "" },
  { label: "进行中", value: "active" },
  { label: "已暂停", value: "paused" },
  { label: "已完成", value: "completed" },
  { label: "失败", value: "failed" },
] as const;

type TaskRow = {
  id: string;
  status: string;
  hasTestcaseOutput?: boolean;
  input: string;
  duration: number | null;
  tweakCount?: number;
  createdAt: string;
};

function resolveDisplayStatus(task: TaskRow): string {
  return getDisplayStatus(task.status, task.hasTestcaseOutput === true);
}

function formatTaskTitle(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "未命名需求";
  const firstLine = trimmed.split("\n")[0].trim();
  if (firstLine.startsWith("上传文件:")) {
    return firstLine.length > 50 ? `${firstLine.slice(0, 50)}...` : firstLine;
  }
  const attach = trimmed.match(/\[附件:\s*([^\]]+)\]/);
  if (attach && !firstLine) {
    const names = attach[1].trim();
    const short = names.length > 40 ? `${names.slice(0, 40)}...` : names;
    return `上传文件: ${short}`;
  }
  const name = firstLine.length > 36 ? `${firstLine.slice(0, 36)}...` : firstLine;
  return `粘贴需求: ${name}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) +
    " " +
    d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
  );
}

/** task.duration 为毫秒，与看板/向导 KPI 一致 */
function formatDuration(ms: number): string {
  return `${(ms / 60000).toFixed(1)} 分钟`;
}

function formatTaskMeta(task: TaskRow): string {
  const dur =
    task.duration != null ? formatDuration(task.duration) : "—";
  return `${formatDate(task.createdAt)} · ${dur}`;
}

function taskMatchesStatusFilter(task: TaskRow, filter: string): boolean {
  if (!filter) return true;
  const display = resolveDisplayStatus(task);
  if (filter === "active") {
    return display === "running" || display === "pending";
  }
  return display === filter;
}

function taskMatchesSearch(task: TaskRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const title = formatTaskTitle(task.input).toLowerCase();
  return title.includes(q) || (task.input || "").toLowerCase().includes(q);
}

function HistoryListRow({
  task,
  onSelect,
}: {
  task: TaskRow;
  onSelect: () => void;
}) {
  const displayStatus = resolveDisplayStatus(task);
  const statusConf = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.pending;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="flex items-center gap-4 px-4 py-3 min-h-[52px] hover:bg-muted/30 transition-colors border-b border-border/60 last:border-0 cursor-pointer group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{formatTaskTitle(task.input)}</p>
        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums truncate">
          {formatTaskMeta(task)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {task.tweakCount != null && task.tweakCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded tabular-nums shrink-0 bg-muted/60 border border-border text-muted-foreground">
            微调 {task.tweakCount}
          </span>
        )}
        <span
          className={`text-xs px-2 py-0.5 rounded-md font-medium whitespace-nowrap border ${statusConf.className}`}
        >
          {statusConf.label}
        </span>
        <span
          className="text-muted-foreground/40 text-sm group-hover:text-muted-foreground transition-colors"
          aria-hidden="true"
        >
          ›
        </span>
      </div>
    </div>
  );
}

function HistoryListShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[min(480px,calc(100vh-12rem))]">
      {children}
    </div>
  );
}

export function HistoryList({
  skillId,
  onSelectTask,
  onGoToGenerate,
}: HistoryListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { data, isLoading, error, refetch, isFetching } = useTasks(undefined, skillId);
  const tasks = data?.tasks || [];

  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (t) => taskMatchesStatusFilter(t, statusFilter) && taskMatchesSearch(t, search),
      ),
    [tasks, statusFilter, search],
  );

  if (!skillId) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">Skill 未配置</p>
        </div>
      </div>
    );
  }

  const pageHeader = (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">历史记录</h1>
      <p className="text-sm text-muted-foreground mt-1">
        查看并继续未完成的生成任务
      </p>
    </header>
  );

  const toolbar = (
    <div className="px-4 flex items-center justify-between gap-3 border-b border-border/60 bg-muted/20 min-h-[48px] h-12 box-border flex-wrap shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <input
          type="search"
          placeholder="搜索任务 / 文件名..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="hidden sm:flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg shrink-0">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setStatusFilter(chip.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                statusFilter === chip.value
                  ? "border-border bg-background text-foreground shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
        <span className="tabular-nums whitespace-nowrap">
          共 <strong className="text-foreground">{filteredTasks.length}</strong> 条
          {filteredTasks.length !== tasks.length && (
            <span className="text-muted-foreground/80"> / {tasks.length}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-lg border border-border hover:bg-muted/60 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {pageHeader}
        <HistoryListShell>
          {toolbar}
          <div className="flex-1 min-h-0 flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        </HistoryListShell>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {pageHeader}
        <HistoryListShell>
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">加载失败</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-sm text-primary hover:underline"
              >
                重试
              </button>
            </div>
          </div>
        </HistoryListShell>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div>
        {pageHeader}
        <HistoryListShell>
          <div className="px-6 py-12 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <p className="text-sm text-muted-foreground mb-3">暂无历史记录</p>
            {onGoToGenerate && (
              <button
                type="button"
                onClick={onGoToGenerate}
                className="h-9 px-4 text-sm font-medium rounded-lg border border-border bg-background hover:bg-muted/60"
              >
                去用例生成
              </button>
            )}
          </div>
        </HistoryListShell>
      </div>
    );
  }

  return (
    <div>
      {pageHeader}
      <HistoryListShell>
        {toolbar}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {filteredTasks.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              无匹配任务，请调整搜索或筛选条件
            </div>
          ) : (
            filteredTasks.map((task) => (
              <HistoryListRow
                key={task.id}
                task={task}
                onSelect={() => onSelectTask(task.id)}
              />
            ))
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-border/60 bg-muted/10 text-xs text-muted-foreground text-center shrink-0 tabular-nums">
          已展示 {filteredTasks.length} 条
          {filteredTasks.length < tasks.length ? `（共 ${tasks.length} 条）` : ""}
        </div>
      </HistoryListShell>
    </div>
  );
}
