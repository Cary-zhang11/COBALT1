"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTask } from "@/hooks/use-tasks";
import { useTaskEvents } from "@/hooks/use-task-events";
import { useResumeTask, useCancelTask } from "@/hooks/use-tasks";
import {
  Loader2,
  Send,
  XCircle,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Bot,
  User,
  Wrench,
  Download,
  FolderOutput,
} from "lucide-react";

interface DisplayMessage {
  id: string;
  type: "user_input" | "chunk" | "tool_call" | "error" | "thinking";
  content: string;
  toolName?: string;
  toolInput?: unknown;
}

export default function TaskExecutePage() {
  const params = useParams();
  const taskId = params.id as string;
  const { data: taskData } = useTask(taskId);
  const resumeTask = useResumeTask();
  const cancelTask = useCancelTask();

  const [replyInput, setReplyInput] = useState("");
  const [chatFiles, setChatFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [outputFiles, setOutputFiles] = useState<{ name: string; path: string }[]>([]);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const prevLogCountRef = useRef(0);
  const sentMessagesRef = useRef(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [cancelConfirming, setCancelConfirming] = useState(false);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { logs, status, pausedData } = useTaskEvents({
    taskId,
    enabled: !!taskId,
  });

  // Show initial prompt at top when task loads
  const [initialPromptShown, setInitialPromptShown] = useState(false);
  useEffect(() => {
    if (!initialPromptShown && taskData?.task?.input) {
      setInitialPromptShown(true);
      setDisplayMessages((prev) => [
        {
          id: "initial-prompt",
          type: "user_input",
          content: taskData.task.input,
        },
        ...prev,
      ]);
    }
  }, [taskData?.task?.input, initialPromptShown]);

  // Append new SSE logs to display
  useEffect(() => {
    const newLogs = logs.slice(prevLogCountRef.current);
    if (newLogs.length === 0) return;

    const newMessages: DisplayMessage[] = [];
    let hasNonMeta = false;
    for (const log of newLogs) {
      if (log.type === "user_input") {
        if (sentMessagesRef.current.has(log.output || "")) continue;
        newMessages.push({ id: `sselog-${log.sequence || prevLogCountRef.current + newMessages.length}`, type: "user_input", content: log.output || "" });
      } else if (log.type === "chunk" && log.output) {
        hasNonMeta = true;
        newMessages.push({ id: `log-${prevLogCountRef.current + newMessages.length}`, type: "chunk", content: log.output });
      } else if (log.type === "tool_call" && log.input) {
        hasNonMeta = true;
        let toolName = "";
        let toolInput: unknown = log.input;
        try {
          const parsed = JSON.parse(log.input);
          toolName = parsed.tool || "";
          toolInput = parsed.input;
        } catch {}
        newMessages.push({ id: `log-tc-${prevLogCountRef.current + newMessages.length}`, type: "tool_call", content: "", toolName, toolInput });
      } else if (log.type === "error" && log.output) {
        hasNonMeta = true;
        newMessages.push({ id: `log-err-${prevLogCountRef.current + newMessages.length}`, type: "error", content: log.output });
      }
    }

    setDisplayMessages((prev) => {
      // Remove thinking bubble when real content arrives
      const next = hasNonMeta ? prev.filter((m) => m.type !== "thinking") : prev;
      return [...next, ...newMessages];
    });
    prevLogCountRef.current = logs.length;
  }, [logs]);

  const pollOutputFiles = useCallback(async () => {
    try {
      const r = await fetch(`/api/tasks/${taskId}/download`);
      const d = await r.json();
      setOutputFiles(d.files || []);
    } catch {}
  }, [taskId]);

  useEffect(() => {
    pollOutputFiles();
    const interval = setInterval(pollOutputFiles, 5000);
    return () => clearInterval(interval);
  }, [pollOutputFiles]);

  useEffect(() => {
    return () => {
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    setUploading(true);
    const uploadedPaths: string[] = [];

    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          uploadedPaths.push(data.filePath);
        }
      } catch {}
    }

    setChatFiles((prev) => [...prev, ...uploadedPaths]);
    setUploading(false);
  };

  const handleSend = async () => {
    if (!replyInput.trim() && chatFiles.length === 0) return;

    let content = replyInput.trim();
    if (chatFiles.length > 0) {
      const fileNames = chatFiles.map((f) => f.split(/[/\\]/).pop()).join(", ");
      content = content
        ? `${content}\n\n[附件: ${fileNames}]`
        : `上传了 ${chatFiles.length} 个文件: ${fileNames}`;
    }

    // Instant local display (deduped against SSE by sentMessagesRef)
    sentMessagesRef.current.add(content);
    const ts = Date.now();
    setDisplayMessages((prev) => [
      ...prev,
      { id: `u-${ts}`, type: "user_input", content },
      { id: `thinking-${ts}`, type: "thinking", content: "" },
    ]);
    setReplyInput("");
    setChatFiles([]);

    await resumeTask.mutateAsync({
      taskId,
      userReply: content,
      uploadedFiles: chatFiles.length > 0 ? chatFiles : undefined,
    });
  };

  const handleCancel = () => {
    if (!cancelConfirming) {
      setCancelConfirming(true);
      cancelTimerRef.current = setTimeout(() => {
        setCancelConfirming(false);
      }, 3000);
      return;
    }
    if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
    cancelTask.mutateAsync(taskId);
  };

  const task = taskData?.task;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Chat Panel */}
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
            {status !== "completed" && status !== "failed" && status !== "cancelled" && (
              <button
                onClick={handleCancel}
                className={`px-3 py-1.5 text-xs border rounded-lg transition-all ${
                  cancelConfirming
                    ? "border-red-400 bg-red-500 text-white"
                    : "border-red-200 text-red-600 hover:bg-red-50"
                }`}
              >
                <XCircle className="w-3 h-3 inline mr-1" />
                {cancelConfirming ? "确认取消?" : "取消"}
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {displayMessages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} />
            ))}

            {status === "connected" && logs.length === 0 && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                等待执行输出...
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

        {/* Input */}
        <div className="border-t px-6 py-4">
          <div className="max-w-3xl mx-auto">
            {["completed", "failed", "cancelled"].includes(status) ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>任务已{status === "completed" ? "完成" : status === "failed" ? "失败" : "取消"}，会话已结束</span>
              </div>
            ) : status === "error" || status === "disconnected" ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span>连接已断开，请刷新页面重试</span>
              </div>
            ) : (
              <>
                {pausedData?.reason === "tool_outside_workspace" && (
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

                {chatFiles.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-3">
                    {chatFiles.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700"
                      >
                        <FileText className="w-3 h-3" />
                        {f.split(/[/\\]/).pop()}
                        <button
                          onClick={() => setChatFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="ml-1 hover:text-blue-900"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    id="chat-file-input"
                  />
                  <label
                    htmlFor="chat-file-input"
                    className="p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors flex-shrink-0"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 text-muted-foreground" />
                    )}
                  </label>
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
                    disabled={!replyInput.trim() && chatFiles.length === 0}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors flex-shrink-0"
                  >
                    {resumeTask.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar — Output Files */}
      <div className="w-64 border-l bg-gray-50/50 flex-shrink-0 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <FolderOutput className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">输出文件</h3>
          </div>

          {outputFiles.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              暂无输出文件，任务执行过程中将自动出现...
            </p>
          ) : (
            <div className="space-y-1.5">
              {outputFiles.map((file, i) => (
                <a
                  key={i}
                  href={file.path}
                  download
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white hover:shadow-sm transition-all group text-sm border border-transparent hover:border-gray-200"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="flex-1 truncate text-xs group-hover:text-blue-600 transition-colors">
                    {file.name}
                  </span>
                  <Download className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: DisplayMessage }) {
  if (msg.type === "thinking") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="px-4 py-3 bg-white border rounded-2xl rounded-tl-md text-sm max-w-[80%]">
          <span className="inline-flex gap-0.5">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        </div>
      </div>
    );
  }

  if (msg.type === "user_input") {
    const isInitialPrompt = msg.id === "initial-prompt";
    return (
      <div className="flex gap-3 flex-row-reverse">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-gray-600" />
        </div>
        <div className={`px-4 py-2.5 rounded-2xl rounded-br-md text-sm whitespace-pre-wrap max-w-[80%] ${isInitialPrompt ? "bg-white border text-foreground" : "bg-blue-600 text-white"}`}>
          {isInitialPrompt && (
            <div className="text-xs text-muted-foreground mb-1 font-medium">📋 初始 Prompt</div>
          )}
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.type === "tool_call") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Wrench className="w-4 h-4 text-gray-600" />
        </div>
        <div className="px-4 py-2 bg-gray-50 border rounded-xl text-xs font-mono max-w-[80%]">
          <span className="text-blue-600 font-medium">[{msg.toolName}]</span>{" "}
          <span className="text-muted-foreground">
            {typeof msg.toolInput === "string"
              ? (msg.toolInput as string).slice(0, 100)
              : JSON.stringify(msg.toolInput).slice(0, 100)}
          </span>
        </div>
      </div>
    );
  }

  if (msg.type === "error") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-4 h-4 text-red-600" />
        </div>
        <div className="px-4 py-2.5 bg-red-50 text-red-700 text-sm rounded-2xl rounded-tl-md max-w-[80%]">
          {msg.content}
        </div>
      </div>
    );
  }

  // chunk (AI)
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="px-4 py-2.5 bg-white border rounded-2xl rounded-tl-md text-sm whitespace-pre-wrap max-w-[80%]">
        {msg.content}
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
    cancelled: { label: "已取消", cls: "text-gray-600 bg-gray-100" },
    disconnected: { label: "已断开", cls: "text-gray-600 bg-gray-100" },
    error: { label: "连接错误", cls: "text-red-600 bg-red-50" },
  };
  const c = config[status] || config.connecting;
  const showSpinner = status === "connected" || status === "connecting";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.cls}`}>
      {showSpinner && <Loader2 className="w-3 h-3 animate-spin" />}
      {c.label}
    </span>
  );
}
