"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Copy,
  CheckCircle2,
  FileText,
  Code2,
  RotateCcw,
  Share2,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Output {
  id: string;
  type: string;
  format: string;
  content: string;
  createdAt: string;
}

const mockOutputs: Output[] = [
  {
    id: "out-1",
    type: "测试用例文档",
    format: "markdown",
    content: `## 订单系统测试用例

### TC-001: 用户成功提交订单
**优先级**: P0 | **类型**: 功能测试

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 用户登录系统 | 登录成功，跳转首页 |
| 2 | 选择商品加入购物车 | 购物车显示商品 |
| 3 | 进入购物车点击结算 | 跳转订单确认页 |
| 4 | 选择支付方式并确认 | 订单创建成功，显示订单号 |
| 5 | 查看订单列表 | 新订单状态为"待支付" |

---

### TC-002: 订单支付超时处理
**优先级**: P1 | **类型**: 异常测试

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 创建订单进入支付页面 | 显示倒计时 30 分钟 |
| 2 | 等待 30 分钟不支付 | 订单自动取消 |
| 3 | 查看订单状态 | 状态变为"已取消" |
| 4 | 尝试继续支付 | 提示订单已过期 |

---

### TC-003: 重复提交订单防重
**优先级**: P0 | **类型**: 安全测试

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 快速连续点击提交按钮 3 次 | 仅创建 1 个订单 |
| 2 | 检查订单列表 | 无重复订单 |
| 3 | 检查扣款记录 | 仅扣款 1 次 |`,
    createdAt: "2026-05-20 14:35",
  },
];

export default function ResultsPage() {
  const params = useParams();
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary", "outputs"])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-8 py-6 border-b bg-card/50">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/" className="hover:text-foreground transition-colors">
            项目列表
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">订单系统测试用例生成</span>
          <span>/</span>
          <span className="text-foreground font-medium">结果</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">执行完成</h1>
              <p className="text-sm text-muted-foreground">
                技能: test-cases v1.0 · 耗时 5 分 23 秒 · 消耗 18.5K tokens
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              重新生成
            </button>
            <button className="px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              分享
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Summary */}
          <div className="border rounded-xl bg-card overflow-hidden">
            <button
              onClick={() => toggleSection("summary")}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-skill-600" />
                <span className="font-semibold">执行摘要</span>
              </div>
              {expandedSections.has("summary") ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {expandedSections.has("summary") && (
              <div className="px-6 pb-6 grid grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <div className="text-2xl font-bold text-foreground">24</div>
                  <div className="text-xs text-muted-foreground mt-1">测试用例</div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <div className="text-2xl font-bold text-emerald-600">8</div>
                  <div className="text-xs text-muted-foreground mt-1">P0 优先级</div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <div className="text-2xl font-bold text-skill-600">5</div>
                  <div className="text-xs text-muted-foreground mt-1">澄清交互</div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <div className="text-2xl font-bold text-cyan-600">2</div>
                  <div className="text-xs text-muted-foreground mt-1">审核节点</div>
                </div>
              </div>
            )}
          </div>

          {/* Outputs */}
          <div className="border rounded-xl bg-card overflow-hidden">
            <button
              onClick={() => toggleSection("outputs")}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-skill-600" />
                <span className="font-semibold">产出文件</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-skill-50 text-skill-700">
                  {mockOutputs.length}
                </span>
              </div>
              {expandedSections.has("outputs") ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {expandedSections.has("outputs") && (
              <div className="divide-y">
                {mockOutputs.map((output) => (
                  <div key={output.id} className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-skill-100 flex items-center justify-center">
                          <Code2 className="w-5 h-5 text-skill-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{output.type}</h3>
                          <p className="text-xs text-muted-foreground">
                            {output.format.toUpperCase()} · {output.createdAt}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy(output.content)}
                          className="px-3 py-2 border rounded-lg text-sm hover:bg-muted transition-colors flex items-center gap-1.5"
                        >
                          {copied ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              复制
                            </>
                          )}
                        </button>
                        <button className="px-3 py-2 bg-skill-600 text-white rounded-lg text-sm hover:bg-skill-700 transition-colors flex items-center gap-1.5">
                          <Download className="w-4 h-4" />
                          下载
                        </button>
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="px-4 py-2 border-b bg-muted/50 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          预览
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Markdown
                        </span>
                      </div>
                      <pre className="p-4 text-sm overflow-auto max-h-96 whitespace-pre-wrap font-mono leading-relaxed text-foreground/90">
                        {output.content}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
