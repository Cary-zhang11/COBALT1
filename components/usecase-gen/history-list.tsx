"use client";

import { useState } from "react";
import { useTasks } from "@/hooks/use-tasks";
import {
  Loader2, Clock, FileText, AlertCircle, ExternalLink, Play, RefreshCw,
} from "lucide-react";

interface HistoryListProps {
  skillId: string | undefined;
  onSelectTask: (taskId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  completed: { label: "已完成", className: "bg-emerald-100 text-emerald-700" },
  running: { label: "进行中", className: "bg-blue-100 text-blue-700" },
  pending: { label: "排队中", className: "bg-slate-100 text-slate-600" },
  paused: { label: "已暂停", className: "bg-amber-100 text-amber-700" },
  failed: { label: "失败", className: "bg-red-100 text-red-600" },
  cancelled: { label: "已取消", className: "bg-slate-100 text-slate-500" },
};

function extractReqName(input: string): string {
  const firstLine = input.split("\n")[0] || input;
  return firstLine.length > 30 ? firstLine.slice(0, 30) + "..." : firstLine;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) +
    " " +
    d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
  );
}

export function HistoryList({ skillId, onSelectTask }: HistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useTasks(undefined, skillId);
  const tasks = data?.tasks || [];

  if (!skillId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">Skill 未配置</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">加载失败</p>
          <button
            onClick={() => refetch()}
            className="text-sm text-primary hover:underline"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-xs">
          <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium text-muted-foreground mb-1">
            暂无历史记录
          </p>
          <p className="text-xs text-muted-foreground">
            使用「生成向导」创建第一个用例生成任务
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">
          历史记录
          <span className="ml-1.5 text-xs text-muted-foreground font-normal">
            ({tasks.length})
          </span>
        </h3>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => {
          const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
          const reqName = extractReqName(task.input || "未命名需求");
          const isExpanded = expandedId === task.id;
          const isRunning =
            task.status === "running" ||
            task.status === "pending" ||
            task.status === "paused";
          const isCompleted = task.status === "completed";

          return (
            <div
              key={task.id}
              className={`bg-card rounded-lg border transition-all ${
                isExpanded
                  ? "border-primary/30 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div
                onClick={() => {
                  setExpandedId(isExpanded ? null : task.id);
                  onSelectTask(task.id);
                }}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{reqName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(task.createdAt)}
                    {task.duration != null && (
                      <span className="ml-2">
                        {(task.duration / 1000).toFixed(1)}s
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusConf.className}`}
                >
                  {statusConf.label}
                </span>
                {task.tweakCount != null && task.tweakCount > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700 flex-shrink-0 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    已微调 {task.tweakCount} 次
                  </span>
                )}
                {isRunning && (
                  <Play className="w-4 h-4 text-blue-500 flex-shrink-0" />
                )}
                {isCompleted && (
                  <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>

              {isExpanded && task.status === "failed" && (
                <div className="border-t px-3 py-2 text-xs text-red-600 bg-red-50/50 rounded-b-lg">
                  任务执行失败，请检查需求内容后重试
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
