"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Send,
  Bot,
  User,
  Paperclip,
  FileText,
  X,
  Check,
  Loader2,
  Sparkles,
  ListChecks,
  Zap,
  CheckCircle2,
  ArrowRight,
  Upload,
  MessageSquare,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "ai" | "user" | "system";
  type?: "text" | "skill-recommend" | "file-upload" | "thinking";
  content: string;
  options?: string[];
  skills?: SkillCard[];
  files?: { name: string; size: string }[];
  timestamp: string;
}

interface SkillCard {
  id: string;
  name: string;
  description: string;
  matchScore: number;
  matchReason: string;
  icon: React.ReactNode;
}

const initialMessages: Message[] = [
  {
    id: "welcome",
    role: "ai",
    type: "text",
    content:
      "你好！我是 **SkillFlow** 智能助手。\n\n请告诉我你想处理什么需求？你可以：\n\n1. **直接描述**你的需求场景\n2. **上传需求文档**（PRD、用户故事、API 文档等）\n3. **两者结合**——先描述再补充文档\n\n我会根据你的需求自动推荐最适合的 Skill。",
    timestamp: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  },
];

const mockSkills: SkillCard[] = [
  {
    id: "test-cases",
    name: "测试用例生成",
    description: "根据需求自动生成结构化测试用例，包含场景、步骤和预期结果",
    matchScore: 0.94,
    matchReason: "检测到 PRD 文档，包含用户故事和验收标准",
    icon: <ListChecks className="w-5 h-5" />,
  },
  {
    id: "test-code",
    name: "测试代码生成",
    description: "基于 API 规格生成可执行的自动化测试代码",
    matchScore: 0.78,
    matchReason: "文档中包含 API 接口定义",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    id: "test-plan",
    name: "测试计划生成",
    description: "生成完整的测试计划文档，包含策略、范围和资源安排",
    matchScore: 0.65,
    matchReason: "内容涵盖多个功能模块",
    icon: <FileText className="w-5 h-5" />,
  },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<
    "greeting" | "collecting" | "analyzing" | "recommending" | "confirming"
  >("greeting");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const simulateAiResponse = (userContent: string) => {
    setIsAiThinking(true);
    setCurrentPhase("analyzing");

    setTimeout(() => {
      // First response: acknowledge + ask clarifying question
      const clarifyMsg: Message = {
        id: `ai-${Date.now()}`,
        role: "ai",
        type: "text",
        content: `收到！我已经了解了你的需求背景。\n\n你提到的是**订单管理系统**的测试需求，涵盖了商品浏览、购物车、订单提交等模块。\n\n为了更精准地为你生成测试用例，我想确认几个细节：`,
        timestamp: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      const questionMsg: Message = {
        id: `ai-question-${Date.now()}`,
        role: "ai",
        type: "text",
        content: `**关于退款流程的覆盖范围：**\n\n你希望测试用例覆盖哪些退款场景？`,
        options: [
          "仅标准退款（用户申请 → 审核 → 退款）",
          "包含异常场景（重复申请、超时、部分退款）",
          "全部场景，包括边界情况和安全测试",
        ],
        timestamp: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, clarifyMsg, questionMsg]);
      setIsAiThinking(false);
      setCurrentPhase("collecting");
    }, 1500);
  };

  const simulateSkillRecommendation = () => {
    setIsAiThinking(true);
    setCurrentPhase("analyzing");

    setTimeout(() => {
      const recommendMsg: Message = {
        id: `ai-recommend-${Date.now()}`,
        role: "ai",
        type: "skill-recommend",
        content:
          "基于你的需求描述和文档分析，我为你匹配了以下 Skills。推荐度综合考虑了需求类型、文档格式和预期产出：",
        skills: mockSkills,
        timestamp: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, recommendMsg]);
      setIsAiThinking(false);
      setCurrentPhase("recommending");
    }, 2000);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() && attachedFiles.length === 0) return;

    // Determine if this is answering a multiple choice question
    const lastAiMessage = messages
      .slice()
      .reverse()
      .find((m) => m.role === "ai");
    const isAnsweringChoice =
      lastAiMessage?.options && lastAiMessage.options.includes(inputValue.trim());

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      type: attachedFiles.length > 0 ? "file-upload" : "text",
      content: inputValue || `上传了 ${attachedFiles.length} 个文件`,
      files: attachedFiles.map((f) => ({
        name: f.name,
        size: `${(f.size / 1024).toFixed(1)} KB`,
      })),
      timestamp: new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setAttachedFiles([]);

    // Simulate AI response flow
    if (currentPhase === "greeting" || currentPhase === "collecting") {
      if (isAnsweringChoice) {
        // User answered the clarifying question
        simulateSkillRecommendation();
      } else {
        simulateAiResponse(inputValue);
      }
    }
  };

  const handleSkillSelect = (skillId: string) => {
    setSelectedSkill(skillId);

    const skill = mockSkills.find((s) => s.id === skillId);
    const confirmMsg: Message = {
      id: `ai-confirm-${Date.now()}`,
      role: "ai",
      type: "text",
      content: `已选择 **${skill?.name}**。\n\n我将基于你的需求文档，使用此 Skill 生成对应的产出。整个过程大约需要 3-5 分钟，期间可能会暂停向你确认一些关键细节。\n\n准备好了吗？`,
      timestamp: new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, confirmMsg]);
    setCurrentPhase("confirming");
  };

  const handleStartWorkflow = () => {
    router.push(`/projects/new-project/workflow`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-card/50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              项目列表
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">新建项目</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">AI 在线</span>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-4 max-w-4xl mx-auto",
              msg.role === "user" ? "flex-row-reverse" : ""
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
                msg.role === "ai"
                  ? "bg-gradient-to-br from-skill-500 to-cyan-500"
                  : "bg-slate-200"
              )}
            >
              {msg.role === "ai" ? (
                <Bot className="w-4 h-4 text-white" />
              ) : (
                <User className="w-4 h-4 text-slate-600" />
              )}
            </div>

            {/* Content */}
            <div
              className={cn(
                "space-y-2",
                msg.role === "user" ? "items-end" : "items-start",
                msg.role === "user" ? "max-w-[80%]" : "max-w-[85%]"
              )}
            >
              {/* Text Message */}
              {msg.type === "text" && (
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-skill-600 text-white"
                      : "bg-card border shadow-sm"
                  )}
                >
                  <div className="whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert">
                    {msg.content.split("**").map((part, i) =>
                      i % 2 === 1 ? (
                        <strong key={i} className="font-semibold">
                          {part}
                        </strong>
                      ) : (
                        part
                      )
                    )}
                  </div>
                </div>
              )}

              {/* File Upload Message */}
              {msg.type === "file-upload" && (
                <div className="space-y-2">
                  {msg.content && (
                    <div className="rounded-2xl px-4 py-3 text-sm bg-skill-600 text-white">
                      {msg.content}
                    </div>
                  )}
                  {msg.files && (
                    <div className="space-y-2">
                      {msg.files.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-3 bg-card border rounded-xl"
                        >
                          <FileText className="w-5 h-5 text-skill-600" />
                          <div>
                            <p className="text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.size}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Skill Recommendation Cards */}
              {msg.type === "skill-recommend" && msg.skills && (
                <div className="w-full space-y-3">
                  <div className="rounded-2xl px-4 py-3 text-sm bg-card border shadow-sm">
                    {msg.content}
                  </div>
                  {msg.skills.map((skill, index) => (
                    <div
                      key={skill.id}
                      onClick={() => handleSkillSelect(skill.id)}
                      className={cn(
                        "border rounded-xl p-4 cursor-pointer transition-all duration-200",
                        selectedSkill === skill.id
                          ? "border-skill-500 bg-skill-50/50 shadow-md"
                          : "hover:border-skill-300 hover:shadow-sm bg-card"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                            selectedSkill === skill.id
                              ? "bg-skill-100 text-skill-700"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {skill.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{skill.name}</h4>
                              {index === 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                                  最匹配
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-skill-600">
                                {(skill.matchScore * 100).toFixed(0)}%
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {skill.description}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-skill-600 bg-skill-50 rounded-lg px-2 py-1.5">
                            <Sparkles className="w-3 h-3" />
                            {skill.matchReason}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1",
                            selectedSkill === skill.id
                              ? "border-skill-500 bg-skill-500"
                              : "border-muted-foreground/30"
                          )}
                        >
                          {selectedSkill === skill.id && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Options */}
              {msg.options && msg.role === "ai" && (
                <div className="space-y-2 mt-2">
                  {msg.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInputValue(option);
                        handleSendMessage();
                      }}
                      className="w-full text-left px-4 py-3 rounded-xl border text-sm hover:border-skill-400 hover:bg-skill-50/50 transition-all bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {String.fromCharCode(65 + idx)}
                          </span>
                        </div>
                        {option}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <span className="text-[10px] text-muted-foreground px-1">
                {msg.timestamp}
              </span>
            </div>
          </div>
        ))}

        {/* AI Thinking */}
        {isAiThinking && (
          <div className="flex gap-4 max-w-4xl mx-auto">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-skill-500 to-cyan-500 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-card border rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-skill-500" />
                {currentPhase === "analyzing"
                  ? "正在分析你的需求..."
                  : "思考中..."}
              </div>
            </div>
          </div>
        )}

        {/* Start Workflow Button */}
        {currentPhase === "confirming" && selectedSkill && (
          <div className="flex justify-center pt-4">
            <button
              onClick={handleStartWorkflow}
              className="px-6 py-3 bg-skill-600 text-white rounded-xl font-medium hover:bg-skill-700 transition-colors flex items-center gap-2 shadow-lg shadow-skill-500/20 animate-slide-up"
            >
              <ArrowRight className="w-4 h-4" />
              启动工作流
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t bg-card/50 p-4 shrink-0">
        <div className="max-w-4xl mx-auto">
          {/* Attached Files Preview */}
          {attachedFiles.length > 0 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 bg-skill-50 border border-skill-200 rounded-lg text-xs"
                >
                  <FileText className="w-3.5 h-3.5 text-skill-600" />
                  <span className="text-skill-700 font-medium">{file.name}</span>
                  <button
                    onClick={() => removeFile(idx)}
                    className="ml-1 hover:text-skill-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* File Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-xl border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
              title="上传文件"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept=".md,.docx,.pdf,.csv,.xlsx,.json,.yaml,.yml,.txt"
            />

            {/* Text Input */}
            <div className="flex-1 relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述你的需求，或点击左侧上传文件..."
                rows={1}
                className="w-full px-4 py-3 bg-background border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-skill-500/30 focus:border-skill-500 transition-all min-h-[44px] max-h-[120px]"
              />
            </div>

            {/* Send Button */}
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() && attachedFiles.length === 0}
              className="p-3 bg-skill-600 text-white rounded-xl hover:bg-skill-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Hints */}
          <div className="flex items-center gap-2 mt-3">
            <Lightbulb className="w-3 h-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">
              提示：描述越详细，匹配的 Skill 越精准。支持 Markdown、Word、PDF、Excel 等格式。
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
