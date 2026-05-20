"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Send,
  Bot,
  User,
  CheckCircle2,
  Clock,
  PauseCircle,
  Loader2,
  FileText,
  ArrowRight,
  RotateCcw,
  XCircle,
  MessageSquare,
  CircleDot,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "system" | "user" | "ai";
  type?: "clarify" | "review" | "status" | "output";
  content: string;
  options?: string[];
  timestamp: string;
  metadata?: {
    stepName?: string;
    confidence?: number;
  };
}

interface WorkflowStep {
  id: string;
  name: string;
  status: "completed" | "running" | "pending" | "paused";
  icon: React.ReactNode;
}

const workflowSteps: WorkflowStep[] = [
  { id: "parse", name: "解析输入", status: "completed", icon: <FileText className="w-4 h-4" /> },
  { id: "analyze", name: "AI 分析", status: "completed", icon: <Sparkles className="w-4 h-4" /> },
  { id: "match", name: "匹配 Skill", status: "completed", icon: <CheckCircle2 className="w-4 h-4" /> },
  { id: "generate", name: "生成内容", status: "running", icon: <Loader2 className="w-4 h-4" /> },
  { id: "review", name: "人工审核", status: "pending", icon: <MessageSquare className="w-4 h-4" /> },
  { id: "output", name: "输出结果", status: "pending", icon: <CheckCircle2 className="w-4 h-4" /> },
];

const initialMessages: Message[] = [
  {
    id: "msg-1",
    role: "system",
    type: "status",
    content: "工作流已启动，使用 Skill: **test-cases**",
    timestamp: "14:30:05",
  },
  {
    id: "msg-2",
    role: "ai",
    type: "status",
    content: "✅ 解析完成，提取到 3 个功能模块、12 条用户故事",
    timestamp: "14:30:08",
    metadata: { stepName: "parse" },
  },
  {
    id: "msg-3",
    role: "ai",
    type: "clarify",
    content:
      "在分析您的需求时，我发现**订单退款流程**部分描述比较简略。请问您希望测试用例覆盖以下哪种场景？",
    options: [
      "仅覆盖标准退款流程（用户申请 → 审核 → 退款）",
      "包含异常场景（重复申请、超时未处理、部分退款）",
      "需要覆盖全部场景，包括边界情况",
    ],
    timestamp: "14:30:15",
    metadata: { stepName: "analyze", confidence: 0.65 },
  },
];

export default function WorkflowPage() {
  const params = useParams();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(3);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim() && selectedOption === null) return;

    const content = selectedOption !== null
      ? messages[messages.length - 1].options?.[selectedOption] || inputValue
      : inputValue;

    const userMsg: Message = {
      id: `msg-user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setSelectedOption(null);
    setIsProcessing(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMsg: Message = {
        id: `msg-ai-${Date.now()}`,
        role: "ai",
        type: "status",
        content: "收到您的确认，继续生成测试用例...",
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsProcessing(false);

      // Simulate review step after a delay
      setTimeout(() => {
        const reviewMsg: Message = {
          id: `msg-review-${Date.now()}`,
          role: "ai",
          type: "review",
          content:
            "测试用例初稿已生成！\n\n**订单系统 - 测试用例概览**\n- 总计：24 条测试用例\n- P0 优先级：8 条\n- P1 优先级：12 条\n- P2 优先级：4 条\n\n**覆盖范围：**\n✅ 用户注册/登录\n✅ 商品浏览与搜索\n✅ 购物车管理\n✅ 订单提交与支付\n✅ 订单退款流程（含异常场景）\n\n请审核以下关键用例是否需要调整？",
          timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          metadata: { stepName: "review" },
        };
        setMessages((prev) => [...prev, reviewMsg]);
        setCurrentStepIndex(4);
      }, 2000);
    }, 1500);
  };

  const lastMessage = messages[messages.length - 1];
  const isAwaitingInput = lastMessage?.role === "ai" && (lastMessage?.type === "clarify" || lastMessage?.type === "review");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-card/50 shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/" className="hover:text-foreground transition-colors">项目列表</Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">订单系统测试用例生成</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">工作流执行</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-50 text-cyan-700 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              执行中
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title="重新执行">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title="取消">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Step Progress */}
        <div className="w-64 border-r bg-card/30 shrink-0 overflow-y-auto">
          <div className="p-4">
            <button
              onClick={() => setStepsExpanded(!stepsExpanded)}
              className="flex items-center justify-between w-full text-sm font-medium mb-3 hover:text-foreground transition-colors"
            >
              <span>执行步骤</span>
              {stepsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>

            {stepsExpanded && (
              <div className="space-y-1">
                {workflowSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                      index === currentStepIndex
                        ? "bg-skill-50 text-skill-700 border border-skill-200"
                        : index < currentStepIndex
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                        index < currentStepIndex
                          ? "bg-emerald-100 text-emerald-600"
                          : index === currentStepIndex
                          ? "bg-skill-100 text-skill-600"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {index < currentStepIndex ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <span className="text-xs font-bold">{index + 1}</span>
                      )}
                    </div>
                    <span className="font-medium">{step.name}</span>
                    {index === currentStepIndex && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Token Usage */}
          <div className="px-4 pb-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted-foreground">Token 使用</span>
                <span className="font-medium">18.5K / 100K</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-skill-500 to-cyan-500 h-1.5 rounded-full"
                  style={{ width: "18.5%" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-4",
                  msg.role === "user" ? "flex-row-reverse" : ""
                )}
003e
                {/* Avatar */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    msg.role === "ai"
                      ? "bg-gradient-to-br from-skill-500 to-cyan-500"
                      : msg.role === "system"
                      ? "bg-muted"
                      : "bg-slate-200"
                  )}
                >
                  {msg.role === "ai" ? (
                    <Bot className="w-4 h-4 text-white" />
                  ) : msg.role === "system" ? (
                    <CircleDot className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <User className="w-4 h-4 text-slate-600" />
                  )}
                </div>

                {/* Message Content */}
                <div
                  className={cn(
                    "max-w-[80%] space-y-2",
                    msg.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-skill-600 text-white"
                        : msg.type === "status"
                        ? "bg-muted/50 text-muted-foreground border border-dashed"
                        : "bg-card border shadow-sm"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>

                  {/* Options for clarify/review */}
                  {msg.role === "ai" && msg.options && msg.id === lastMessage?.id && (
                    <div className="space-y-2 mt-3">
                      {msg.options.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedOption(idx)}
                          className={cn(
                            "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all duration-200",
                            selectedOption === idx
                              ? "border-skill-500 bg-skill-50 shadow-sm"
                              : "hover:border-skill-300 hover:bg-skill-50/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                selectedOption === idx
                                  ? "border-skill-500 bg-skill-500"
                                  : "border-muted-foreground/30"
                              )}
                            >
                              {selectedOption === idx && (
                                <Check className="w-3 h-3 text-white" />
                              )}
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

            {/* AI Typing Indicator */}
            {isProcessing && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-skill-500 to-cyan-500 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-card border rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-skill-400 typing-dot" />
                    <div className="w-2 h-2 rounded-full bg-skill-400 typing-dot" />
                    <div className="w-2 h-2 rounded-full bg-skill-400 typing-dot" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t bg-card/50 p-4 shrink-0">
            <div className="max-w-3xl mx-auto">
              {isAwaitingInput ? (
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={
                        lastMessage?.type === "review"
                          ? "输入审核意见，或直接点击通过..."
                          : "输入您的回答..."
                      }
                      rows={1}
                      className="w-full px-4 py-3 bg-background border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-skill-500/30 focus:border-skill-500 transition-all min-h-[44px] max-h-[120px]"
                      style={{ height: "auto" }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {lastMessage?.type === "review" && (
                      <button
                        onClick={handleSendMessage}
                        className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        通过
                      </button>
                    )}
                    <button
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim() && selectedOption === null}
                      className="p-2.5 bg-skill-600 text-white rounded-xl hover:bg-skill-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI 正在处理中，请稍候...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
