"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSkillMatch } from "@/hooks/use-skill-match";
import { useCreateTask, useExecuteTask } from "@/hooks/use-tasks";
import { Upload, Send, Loader2, FileText, Wand2, CheckCircle2 } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  skills?: Array<{
    skillId: string;
    name: string;
    description: string;
    confidence: number;
    reason: string;
  }>;
}

export default function NewTaskPage() {
  const router = useRouter();
  const createTask = useCreateTask();
  const executeTask = useExecuteTask();
  const { matches, isLoading: matching, match } = useSkillMatch();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "ai",
      content: "你好！我是 COBALT 助手。\n\n请告诉我你想处理什么需求？你可以直接描述，或上传需求文档。",
    },
  ]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "matching" | "confirming">("input");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const uploadedFilesRef = useRef<string[]>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    setUploading(true);
    const uploadedPaths: string[] = [];

    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        uploadedPaths.push(data.filePath);
      }
    }

    setFiles((prev) => [...prev, ...uploadedPaths]);
    uploadedFilesRef.current = [...uploadedFilesRef.current, ...uploadedPaths];
    setUploading(false);
  };

  const handleSend = async () => {
    if (!input.trim() && files.length === 0) return;

    let content = input.trim();
    if (files.length > 0) {
      const fileNames = files.map((f) => f.split(/[/\\]/).pop()).join(", ");
      content = content
        ? `${content}\n\n[附件: ${fileNames}]`
        : `上传了 ${files.length} 个文件: ${fileNames}`;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setFiles([]);
    setPhase("matching");

    // Call skill matching
    const result = await match(userMsg.content);

    const aiMsg: ChatMessage = {
      id: `ai-${Date.now()}`,
      role: "ai",
      content: result?.matches?.length
        ? "基于你的需求，我为你匹配了以下工具："
        : "未找到精确匹配的工具，请手动选择或继续。",
      skills: result?.matches || [],
    };
    setMessages((prev) => [...prev, aiMsg]);
    setPhase("confirming");
  };

  const handleSelectSkill = (skillId: string) => {
    setSelectedSkillId(skillId);
    const skill = matches.find((m) => m.skillId === skillId);
    if (skill) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-confirm-${Date.now()}`,
          role: "ai",
          content: `已选择 **${skill.name}**。准备好后点击下方按钮启动工作流。`,
        },
      ]);
    }
  };

  const handleStartWorkflow = async () => {
    if (!selectedSkillId) return;

    // Collect all user messages as input
    const fullInput = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n\n");

    const result = await createTask.mutateAsync({
      skillId: selectedSkillId,
      input: fullInput,
      uploadedFiles: uploadedFilesRef.current.length > 0 ? uploadedFilesRef.current : undefined,
    });
    uploadedFilesRef.current = [];

    await executeTask.mutateAsync(result.taskId);
    router.push(`/tasks/${result.taskId}/execute`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">新建任务</h1>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">AI 在线</span>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "ai"
                    ? "bg-gradient-to-br from-violet-500 to-cyan-500"
                    : "bg-gray-200"
                }`}
              >
                {msg.role === "ai" ? (
                  <Wand2 className="w-4 h-4 text-white" />
                ) : (
                  <span className="text-xs font-medium text-gray-600">U</span>
                )}
              </div>
              <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : ""}`}>
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-white border shadow-sm rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>

                {/* Skill Recommendations */}
                {msg.skills && msg.skills.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.skills.map((skill, idx) => (
                      <button
                        key={skill.skillId}
                        onClick={() => handleSelectSkill(skill.skillId)}
                        className={`w-full text-left p-4 border rounded-xl transition-all ${
                          selectedSkillId === skill.skillId
                            ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                            : "hover:border-blue-300 hover:bg-blue-50/50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Wand2 className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm">{skill.name}</h4>
                              {idx === 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                  最匹配
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {skill.description}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                                匹配度: {(skill.confidence * 100).toFixed(0)}%
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {skill.reason}
                              </span>
                            </div>
                          </div>
                          {selectedSkillId === skill.skillId && (
                            <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {matching && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">正在分析需求...</span>
            </div>
          )}

          {phase === "confirming" && selectedSkillId && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleStartWorkflow}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                启动工作流
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {files.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700"
                >
                  <FileText className="w-3 h-3" />
                  {f.split(/[/\\]/).pop()}
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
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
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className="p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 text-muted-foreground" />
              )}
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="描述你的需求..."
              className="flex-1 px-4 py-3 border rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-h-[44px] max-h-[120px]"
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && files.length === 0) || matching}
              className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
