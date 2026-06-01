"use client";

import { useMemo } from "react";
import { CheckCircle2, Download, MessageSquare, Star, Edit3, RefreshCw } from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";

const WORKFLOW_NODES: { name: string; key: string }[] = [
  { name: "文档解析", key: "source" },
  { name: "需求分析", key: "rag" },
  { name: "用例生成", key: "llm" },
  { name: "质量校验", key: "quality" },
  { name: "导出格式", key: "export" },
];

interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  wizStep: number;
  hasResult: boolean;
  isTweak?: boolean;
  configSummary: {
    source: string;
    fewShot: string;
  };
  foundFiles: FileInfo[];
  /** Completed stages parsed from [WF:done:xxx] log markers */
  logStages?: Set<string>;
  onDownloadFile: (file: FileInfo) => void;
  onScrollToAITweak: () => void;
  onScrollToRating: () => void;
  onNavigateToEditor: () => void;
  onReconfigure: () => void;
}

function deriveNodeStates(
  foundFiles: FileInfo[],
  generating: boolean,
  logStages?: Set<string>
): { name: string; state: "wait" | "running" | "done" }[] {
  const hasSourceMd = foundFiles.some((f) => f.name.includes("_source"));
  const hasTestcaseMd = foundFiles.some(
    (f) => f.name.includes("测试用例") && f.name.endsWith(".md")
  );
  const hasXmind = foundFiles.some((f) => f.name.endsWith(".xmind"));

  return WORKFLOW_NODES.map((node, i) => {
    let state: "wait" | "running" | "done";
    switch (i) {
      case 0:
        state = logStages?.has(node.name) || hasSourceMd ? "done" : generating ? "running" : "wait";
        break;
      case 1:
        state = logStages?.has(node.name) || hasTestcaseMd ? "done" : hasSourceMd ? "running" : "wait";
        break;
      case 2:
        state = logStages?.has(node.name) || hasTestcaseMd ? "done" : hasSourceMd ? "running" : "wait";
        break;
      case 3:
        state = logStages?.has(node.name) || hasTestcaseMd ? "done" : "wait";
        break;
      case 4:
        state = logStages?.has(node.name) || hasXmind ? "done" : hasTestcaseMd ? "running" : "wait";
        break;
      default:
        state = "wait";
    }
    return { name: node.name, state };
  });
}

export function ExecutionPanel({
  taskId,
  generating,
  wizStep,
  hasResult,
  isTweak,
  configSummary,
  foundFiles,
  logStages,
  onDownloadFile,
  onScrollToAITweak,
  onScrollToRating,
  onNavigateToEditor,
  onReconfigure,
}: ExecutionPanelProps) {
  const nodes = useMemo(
    () => deriveNodeStates(foundFiles, generating, logStages),
    [foundFiles, generating, logStages]
  );

  const mdFile = foundFiles.find(
    (f) => f.name.includes("测试用例") && f.name.endsWith(".md")
  );
  const xmindFile = foundFiles.find((f) => f.name.endsWith(".xmind"));

  // Mode 1: Config Preview (wizStep < 2)
  if (wizStep < 2) {
    return (
      <div className="w-48 flex-shrink-0">
        <div className="bg-card rounded-xl shadow-sm p-4 sticky top-20">
          <h4 className="font-semibold text-sm text-foreground mb-3">
            当前配置预览
          </h4>
          <div className="bg-muted rounded-lg p-3 space-y-2">
            {[
              ["物料来源", configSummary.source],
              ["few-shot", configSummary.fewShot],
              ["输出格式", "XMind + Markdown"],
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium max-w-[100px] truncate">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Mode 2: Progress Dots (wizStep === 2 && generating && not tweak)
  if (wizStep === 2 && generating && !isTweak) {
    return (
      <div className="w-48 flex-shrink-0">
        <div className="bg-card rounded-xl shadow-sm p-4 sticky top-20">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
            <span className="text-xs font-semibold text-foreground">生成中</span>
          </div>
          <div className="flex flex-col">
            {nodes.map((node, i) => (
              <div key={i} className="flex items-stretch">
                {/* Dot + vertical line column */}
                <div className="flex flex-col items-center mr-2.5">
                  {node.state === "done" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : node.state === "running" ? (
                    <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0 shadow-[0_0_0_3px_rgba(99,102,241,0.3)]" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-border flex-shrink-0" />
                  )}
                  {i < nodes.length - 1 && (
                    <div
                      className={`w-px flex-1 my-1 ${
                        node.state === "done" ? "bg-green-200" : "bg-border"
                      }`}
                    />
                  )}
                </div>
                {/* Label */}
                <div
                  className={`pb-2 text-xs font-medium transition-opacity ${
                    node.state === "done"
                      ? "text-green-700"
                      : node.state === "running"
                      ? "text-primary"
                      : "text-muted-foreground opacity-40"
                  }`}
                >
                  {node.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Mode 3: Quick Actions (wizStep === 2 && !generating)
  if (wizStep === 2 && !generating && (foundFiles.length > 0 || hasResult)) {
    return (
      <div className="w-48 flex-shrink-0">
        <div className="bg-card rounded-xl shadow-sm p-4 sticky top-20">
          <h4 className="font-semibold text-sm text-foreground mb-3">
            快捷操作
          </h4>
          <div className="space-y-2">
            {mdFile && (
              <button
                onClick={() => onDownloadFile(mdFile)}
                className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-primary" />
                下载 Markdown
              </button>
            )}
            {xmindFile && (
              <button
                onClick={() => onDownloadFile(xmindFile)}
                className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-primary" />
                下载 XMind
              </button>
            )}
            <button
              onClick={onScrollToAITweak}
              className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              AI 微调
            </button>
            <button
              onClick={onScrollToRating}
              className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
            >
              <Star className="w-3.5 h-3.5 text-primary" />
              评价
            </button>
            <button
              onClick={onNavigateToEditor}
              className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-primary" />
              去编辑用例
            </button>
            <button
              onClick={onReconfigure}
              className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              重新配置
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: nothing to show yet
  return <div className="w-48 flex-shrink-0" />;
}
