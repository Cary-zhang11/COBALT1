"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Wand2,
  Search,
  FileText,
  Zap,
  ListChecks,
  CheckCircle2,
  ChevronRight,
  Star,
  Cpu,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  status: "active" | "beta" | "deprecated";
  inputFormats: string[];
  estimatedTokens: string;
  usageCount: number;
  rating: number;
  icon: React.ReactNode;
  changelog?: string;
}

const builtInSkills: SkillInfo[] = [
  {
    id: "test-cases",
    name: "测试用例生成",
    description: "根据需求文档自动生成结构化的测试用例，包含场景、步骤和预期结果",
    version: "1.2.0",
    status: "active",
    inputFormats: [".md", ".docx", ".pdf"],
    estimatedTokens: "15K-50K",
    usageCount: 1284,
    rating: 4.8,
    icon: <ListChecks className="w-5 h-5" />,
    changelog: "新增边界条件自动识别",
  },
  {
    id: "test-code",
    name: "测试代码生成",
    description: "基于 API 规格和需求生成可执行的自动化测试代码",
    version: "1.1.0",
    status: "active",
    inputFormats: [".md", ".yaml", ".json"],
    estimatedTokens: "20K-80K",
    usageCount: 856,
    rating: 4.6,
    icon: <Zap className="w-5 h-5" />,
  },
  {
    id: "test-plan",
    name: "测试计划生成",
    description: "生成完整的测试计划文档，包含测试策略、范围和资源安排",
    version: "1.0.0",
    status: "active",
    inputFormats: [".md", ".docx"],
    estimatedTokens: "10K-30K",
    usageCount: 623,
    rating: 4.5,
    icon: <FileText className="w-5 h-5" />,
  },
  {
    id: "qa-checklist",
    name: "QA 检查清单",
    description: "生成通用的 QA 检查清单，覆盖功能、性能和安全性检查",
    version: "1.0.0",
    status: "active",
    inputFormats: [".md", ".docx", ".pdf", ".csv"],
    estimatedTokens: "5K-15K",
    usageCount: 445,
    rating: 4.7,
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
];

const statusConfig = {
  active: { label: "已激活", className: "bg-emerald-50 text-emerald-700" },
  beta: { label: "测试中", className: "bg-amber-50 text-amber-700" },
  deprecated: { label: "已弃用", className: "bg-red-50 text-red-700" },
};

export default function SkillsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const filtered = builtInSkills.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-8 py-6 border-b bg-card/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Wand2 className="w-6 h-6 text-skill-600" />
              技能管理
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理和浏览所有可用的技能
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索技能..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-skill-500/30 focus:border-skill-500 transition-all w-64"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* 内置技能 */}
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              内置技能 ({filtered.length})
            </span>
          </div>

          {filtered.map((skill) => {
            const status = statusConfig[skill.status];
            const isExpanded = expandedSkill === skill.id;

            return (
              <div
                key={skill.id}
                className="border rounded-xl bg-card overflow-hidden hover:shadow-md transition-shadow"
              >
                <button
                  onClick={() =>
                    setExpandedSkill(isExpanded ? null : skill.id)
                  }
                  className="w-full px-6 py-5 flex items-start gap-4 hover:bg-muted/30 transition-colors"
                >
                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl bg-skill-100 text-skill-700 flex items-center justify-center shrink-0">
                    {skill.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-lg">{skill.name}</h3>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-medium",
                          status.className
                        )}
                      >
                        {status.label}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                        v{skill.version}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {skill.description}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        {skill.rating}
                      </span>
                      <span>{skill.usageCount.toLocaleString()} 次使用</span>
                      <span>预估 {skill.estimatedTokens} tokens</span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        {skill.inputFormats.join(", ")}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight
                    className={cn(
                      "w-5 h-5 text-muted-foreground shrink-0 mt-2 transition-transform",
                      isExpanded && "rotate-90"
                    )}
                  />
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t bg-muted/20">
                    <div className="pt-4 grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">输入规范</h4>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>
                            <span className="text-foreground">支持格式:</span>{" "}
                            {skill.inputFormats.join(", ")}
                          </p>
                          <p>
                            <span className="text-foreground">Token 预算:</span>{" "}
                            {skill.estimatedTokens}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">版本信息</h4>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>
                            <span className="text-foreground">当前版本:</span>{" "}
                            v{skill.version}
                          </p>
                          {skill.changelog && (
                            <p>
                              <span className="text-foreground">最新变更:</span>{" "}
                              {skill.changelog}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <Link
                        href="/projects/new"
                        className="px-4 py-2 bg-skill-600 text-white rounded-lg text-sm font-medium hover:bg-skill-700 transition-colors flex items-center gap-1.5"
                      >
                        使用此技能
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Wand2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>未找到匹配的技能</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
