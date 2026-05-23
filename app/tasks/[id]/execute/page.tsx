"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTask } from "@/hooks/use-tasks";
import { useTaskEvents } from "@/hooks/use-task-events";
import { useResumeTask, useCancelTask } from "@/hooks/use-tasks";
import { Loader2, Send, XCircle, CheckCircle2, AlertCircle } from "lucide-react";

export default function TaskExecutePage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const { data: taskData } = useTask(taskId);
  const resumeTask = useResumeTask();
  const cancelTask = useCancelTask();

  const [replyInput, setReplyInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { logs, status } = useTaskEvents({
    taskId,
    enabled: !!taskId,
    onComplete: (finalStatus) => {
      if (finalStatus === "completed") {
        setTimeout(() => router.push(`/tasks/${taskId}/result`), 1500);
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleResume = async () => {
    if (!replyInput.trim()) return;
    await resumeTask.mutateAsync({ taskId, userReply: replyInput });
    setReplyInput("");
  };

  const handleCancel = async () => {
    await cancelTask.mutateAsync(taskId);
  };

  const task = taskData?.task;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-lg">
            {task?.skill?.name || "任务执行中"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Task ID: {taskId.slice(0, 8)}...
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          {(status === "connected" || status === "paused") && (
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <XCircle className="w-3 h-3 inline mr-1" />
              取消
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-3">
        {logs.map((log, i) => (
          <LogMessage key={i} log={log} />
        ))}

        {status === "connected" && logs.length === 0 && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            等待执行输出...
          </div>
        )}

        {status === "completed" && (
          <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 px-4 py-3 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
            任务已完成，正在跳转到结果页...
          </div>
        )}

        {status === "failed" && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            任务执行失败
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {status === "paused" && (
        <div className="border-t px-6 py-4">
          <div className="flex gap-3">
            <input
              value={replyInput}
              onChange={(e) => setReplyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleResume()}
              placeholder="输入回复以继续执行..."
              className="flex-1 px-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <button
              onClick={handleResume}
              disabled={!replyInput.trim()}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    connecting: { label: "连接中", cls: "text-gray-600 bg-gray-100" },
    connected: { label: "执行中", cls: "text-blue-600 bg-blue-50" },
    paused: { label: "等待输入", cls: "text-orange-600 bg-orange-50" },
    completed: { label: "已完成", cls: "text-green-600 bg-green-50" },
    failed: { label: "失败", cls: "text-red-600 bg-red-50" },
    disconnected: { label: "已断开", cls: "text-gray-600 bg-gray-100" },
    error: { label: "连接错误", cls: "text-red-600 bg-red-50" },
  };
  const c = config[status] || config.connecting;
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function LogMessage({ log }: { log: { type: string; output: string | null; input: string | null } }) {
  if (log.type === "system") return null;

  if (log.type === "tool_call" && log.input) {
    try {
      const data = JSON.parse(log.input);
      return (
        <div className="px-4 py-2 bg-gray-50 border rounded-lg text-xs font-mono">
          <span className="text-blue-600 font-medium">[{data.tool}]</span>{" "}
          <span className="text-muted-foreground">
            {typeof data.input === "string"
              ? data.input.slice(0, 100)
              : JSON.stringify(data.input).slice(0, 100)}
          </span>
        </div>
      );
    } catch {}
  }

  if (log.type === "chunk" && log.output) {
    return (
      <div className="px-4 py-2 text-sm whitespace-pre-wrap">
        {log.output}
      </div>
    );
  }

  if (log.type === "error" && log.output) {
    return (
      <div className="px-4 py-2 bg-red-50 text-red-700 text-sm rounded-lg">
        {log.output}
      </div>
    );
  }

  return null;
}
