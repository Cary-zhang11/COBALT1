"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTask } from "@/hooks/use-tasks";
import { useTaskEvents } from "@/hooks/use-task-events";
import { useResumeTask, useCancelTask } from "@/hooks/use-tasks";
import {
  Loader2,
  Send,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Bot,
  User,
  Wrench,
} from "lucide-react";

const WORKFLOW_STEPS = [
  { id: "parse", name: "解析输入" },
  { id: "analyze", name: "AI 分析" },
  { id: "match", name: "匹配 Skill" },
  { id: "generate", name: "生成内容" },
  { id: "review", name: "人工审核" },
  { id: "output", name: "输出结果" },
];

export default function TaskExecutePage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const { data: taskData } = useTask(taskId);
  const resumeTask = useResumeTask();
  const cancelTask = useCancelTask();

  const [replyInput, setReplyInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { logs, status, pausedData } = useTaskEvents({
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

  const handleSend = async () => {
    if (!replyInput.trim()) return;
    await resumeTask.mutateAsync({ taskId, userReply: replyInput });
    setReplyInput("");
  };

  const handleCancel = async () => {
    await cancelTask.mutateAsync(taskId);
  };

  const task = taskData?.task;
  const isInputEnabled = status === "paused" || status === "connected";

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Sidebar - Workflow Steps */}
      <div className="w-64 border-r bg-gray-50/50 flex-shrink-0 overflow-y-auto">
        <div className="p-4">
          <h3 className="text-sm font-medium mb-3">执行步骤</h3>
          <div className="space-y-1">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isActive = idx === 2; // Mock current step
              const isCompleted = idx < 2;
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                    isActive
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : isCompleted
                      ? "text-gray-700"
                      : "text-gray-400"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      isCompleted
                        ? "bg-green-100 text-green-600"
                        : isActive
                        ? "bg-blue-100 text-blue-600"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span>{step.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Panel - Chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
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
            {status !== "completed" && status !== "failed" && (
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

        {/* Messages */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {logs.map((log, i) => (
              <ChatMessage key={i} log={log} />
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
        </div>

        {/* Input - Always visible */}
        <div className="border-t px-6 py-4">
          <div className="max-w-3xl mx-auto">
            {pausedData?.reason === "tool_call" && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800 text-sm">
                  <Wrench className="w-4 h-4" />
                  <span className="font-medium">
                    需要确认: {pausedData.toolName}
                  </span>
                </div>
                {pausedData.toolInput != null && (
                  <pre className="mt-2 text-xs text-amber-700 bg-amber-100/50 p-2 rounded overflow-auto">
                    {JSON.stringify(pausedData.toolInput, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <input
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  status === "paused"
                    ? "输入回复以继续执行..."
                    : "随时输入指令..."
                }
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!replyInput.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
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

function ChatMessage({
  log,
}: {
  log: { type: string; output: string | null; input: string | null };
}) {
  if (log.type === "system") return null;

  if (log.type === "tool_call" && log.input) {
    try {
      const data = JSON.parse(log.input);
      return (
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Wrench className="w-4 h-4 text-gray-600" />
          </div>
          <div className="px-4 py-2 bg-gray-50 border rounded-xl text-xs font-mono max-w-[80%]">
            <span className="text-blue-600 font-medium">[{data.tool}]</span>{" "}
            <span className="text-muted-foreground">
              {typeof data.input === "string"
                ? data.input.slice(0, 100)
                : JSON.stringify(data.input).slice(0, 100)}
            </span>
          </div>
        </div>
      );
    } catch {}
  }

  if (log.type === "chunk" && log.output) {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="px-4 py-2.5 bg-white border rounded-2xl rounded-tl-md text-sm whitespace-pre-wrap max-w-[80%]">
          {log.output}
        </div>
      </div>
    );
  }

  if (log.type === "error" && log.output) {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-4 h-4 text-red-600" />
        </div>
        <div className="px-4 py-2.5 bg-red-50 text-red-700 text-sm rounded-2xl rounded-tl-md max-w-[80%]">
          {log.output}
        </div>
      </div>
    );
  }

  return null;
}
