"use client";

import { useEffect, useState } from "react";
import { useTaskEvents } from "@/hooks/use-task-events";
import { Loader2, CheckCircle2 } from "lucide-react";

interface WorkflowNode {
  name: string;
  desc: string;
  state: "wait" | "running" | "done";
  progress: number;
}

const WORKFLOW_TEMPLATE: WorkflowNode[] = [
  { name: "文档解析", desc: "OCR + 结构提取", state: "wait", progress: 0 },
  { name: "知识检索", desc: "RAG 召回相关规范", state: "wait", progress: 0 },
  { name: "LLM 生成", desc: "工作流大模型节点", state: "wait", progress: 0 },
  { name: "质量校验", desc: "格式 + 覆盖度检查", state: "wait", progress: 0 },
  { name: "导出格式化", desc: "生成 XMind + Excel", state: "wait", progress: 0 },
];

interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  configSummary: {
    source: string;
    capabilities: string;
    dimensions: string;
    fewShot: string;
  };
  onComplete?: (status: string) => void;
}

export function ExecutionPanel({ taskId, generating, configSummary, onComplete }: ExecutionPanelProps) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(WORKFLOW_TEMPLATE);

  const { status } = useTaskEvents({
    taskId: taskId || "",
    enabled: !!taskId && generating,
    onComplete,
  });

  // Mark all done when task completes
  useEffect(() => {
    if (status === "completed") {
      setNodes((prev) => prev.map((n) => ({ ...n, state: "done" as const, progress: 100 })));
    }
  }, [status]);

  return (
    <div className="bg-card rounded-xl shadow-sm p-4 sticky top-20">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-foreground text-sm">执行轨迹</h4>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-cyan-100 text-cyan-700">工作流</span>
      </div>

      {!generating && (
        <div className="bg-muted rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">当前配置预览</p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">物料来源</span>
            <span className="font-medium">{configSummary.source}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">已选能力</span>
            <span className="font-medium">{configSummary.capabilities}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">覆盖维度</span>
            <span className="font-medium">{configSummary.dimensions}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">few-shot</span>
            <span className="font-medium">{configSummary.fewShot}</span>
          </div>
        </div>
      )}

      {generating && (
        <div className="space-y-2">
          {nodes.map((node, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 transition-all duration-500 ${
                node.state === "wait" ? "opacity-30" : "opacity-100"
              }`}
            >
              <div
                className={`flex-shrink-0 border rounded-lg px-2 py-1 text-xs font-medium w-20 text-center transition-all ${
                  node.state === "done"
                    ? "bg-green-50 border-green-200 text-green-700"
                    : node.state === "running"
                    ? "bg-cyan-50 border-cyan-200 text-cyan-700 animate-pulse"
                    : "bg-muted border-border text-muted-foreground"
                }`}
              >
                {node.name}
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{node.desc}</p>
              </div>
              {node.state === "done" && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
              {node.state === "running" && <Loader2 className="w-4 h-4 text-cyan-500 animate-spin flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {status === "completed" && (
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">工作流执行完成，用例文件已就绪</p>
        </div>
      )}
    </div>
  );
}
