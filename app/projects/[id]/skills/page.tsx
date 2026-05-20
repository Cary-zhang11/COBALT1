"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  FileText,
  Zap,
  Wand2,
  ListChecks,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillRecommendation {
  id: string;
  name: string;
  description: string;
  matchScore: number;
  matchReason: string;
  estimatedTokens: string;
  inputFormats: string[];
  icon: React.ReactNode;
}

const mockSkills: SkillRecommendation[] = [
  {
    id: "test-cases",
    name: "测试用例生成",
    description: "根据需求文档自动生成结构化的测试用例，包含场景、步骤和预期结果",
    matchScore: 0.94,
    matchReason: "检测到 PRD 文档格式，包含用户故事和验收标准",
    estimatedTokens: "15K-50K",
    inputFormats: [".md", ".docx", ".pdf"],
    icon: <ListChecks className="w-6 h-6" />,
  },
  {
    id: "test-code",
    name: "测试代码生成",
    description: "基于 API 规格和需求生成可执行的自动化测试代码",
    matchScore: 0.78,
    matchReason: "文档中包含 API 接口定义，适合生成接口测试",
    estimatedTokens: "20K-80K",
    inputFormats: [".md", ".yaml", ".json"],
    icon: <Zap className="w-6 h-6" />,
  },
  {
    id: "test-plan",
    name: "测试计划生成",
    description: "生成完整的测试计划文档，包含测试策略、范围和资源安排",
    matchScore: 0.65,
    matchReason: "内容涵盖多个功能模块，适合生成整体测试计划",
    estimatedTokens: "10K-30K",
    inputFormats: [".md", ".docx"],
    icon: <FileText className="w-6 h-6" />,
  },
  {
    id: "qa-checklist",
    name: "QA 检查清单",
    description: "生成通用的 QA 检查清单，覆盖功能、性能和安全性检查",
    matchScore: 0.52,
    matchReason: "通用需求，可生成标准检查清单",
    estimatedTokens: "5K-15K",
    inputFormats: [".md", ".docx", ".pdf", ".csv"],
    icon: <CheckCircle2 className="w-6 h-6" />,
  },
];

export default function SkillRecommendPage() {
  const params = useParams();
  const router = useRouter();
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const handleStartWorkflow = () => {
    if (!selectedSkill) return;
    setIsStarting(true);
    setTimeout(() => {
      router.push(`/projects/${params.id}/workflow`);
    }, 800);
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
          <Link href="/projects/new" className="hover:text-foreground transition-colors">
            新建项目
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">选择 Skill</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-skill-600" />
              推荐 Skills
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              基于您的需求文档，AI 为您匹配了以下 Skills
            </p>
          </div>
          <Link
            href="/skills"
            className="text-sm text-skill-600 hover:text-skill-700 font-medium flex items-center gap-1"
          >
            <Wand2 className="w-4 h-4" />
            浏览全部 Skills
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-5">
          {mockSkills.map((skill, index) => (
            <div
              key={skill.id}
              onClick={() => setSelectedSkill(skill.id)}
              className={cn(
                "relative border rounded-xl p-6 cursor-pointer transition-all duration-200",
                selectedSkill === skill.id
                  ? "border-skill-500 bg-skill-50/30 shadow-lg shadow-skill-500/10"
                  : "hover:border-skill-200 hover:shadow-md"
              )}
            >
              {/* Rank badge */}
              {index < 3 && (
                <div
                  className={cn(
                    "absolute -top-3 left-6 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white",
                    index === 0
                      ? "bg-gradient-to-r from-amber-400 to-amber-500"
                      : index === 1
                      ? "bg-gradient-to-r from-slate-400 to-slate-500"
                      : "bg-gradient-to-r from-orange-400 to-orange-500"
                  )}
                >
                  #{index + 1} 推荐
                </div>
              )}

              <div className="flex items-start gap-5">
                {/* Icon */}
                <div
                  className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                    selectedSkill === skill.id
                      ? "bg-skill-100 text-skill-700"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {skill.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-lg">{skill.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {skill.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-skill-600">
                          {(skill.matchScore * 100).toFixed(0)}%
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          匹配度
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                          selectedSkill === skill.id
                            ? "border-skill-500 bg-skill-500"
                            : "border-muted-foreground/30"
                        )}
                      >
                        {selectedSkill === skill.id && (
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Match reason */}
                  <div className="flex items-center gap-1.5 text-xs text-skill-600 bg-skill-50 rounded-lg px-3 py-2 mt-3">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    {skill.matchReason}
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground"
003e
                    <span className="flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      预估 {skill.estimatedTokens} tokens
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      支持 {skill.inputFormats.join(", ")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Action */}
          <div className="flex items-center justify-between pt-4">
            <Link
              href="/projects/new"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回上传
            </Link>
            <button
              onClick={handleStartWorkflow}
              disabled={!selectedSkill || isStarting}
              className="inline-flex items-center gap-2 px-6 py-3 bg-skill-600 text-white rounded-lg font-medium hover:bg-skill-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-skill-500/20"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  启动中...
                </>
              ) : (
                <>
                  启动工作流
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
