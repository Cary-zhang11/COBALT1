"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Download, MessageSquare, Edit3 } from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";
import { FileActionModal } from "./file-action-modal";
import { RatingPanel } from "./rating-panel";
import { isDisplayable } from "./output-files";

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
    knowledge: string;
    history: string;
  };
  foundFiles: FileInfo[];
  logStages?: Set<string>;
  onDownloadFile: (file: FileInfo) => void;
  onScrollToAITweak: () => void;
  onNavigateToEditor: (filePath?: string) => void;
}

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <aside className="w-60 flex-shrink-0 sticky top-6 self-start z-10">
      {children}
    </aside>
  );
}

function SidebarCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border/60 p-4 text-sm max-h-[calc(100vh-8rem)] overflow-y-auto [text-rendering:optimizeLegibility]">
      {children}
    </div>
  );
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

  const nodes = WORKFLOW_NODES.map((node, i) => {
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

  let rightmostActive = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].state === "done" || nodes[i].state === "running") {
      rightmostActive = i;
      break;
    }
  }
  if (rightmostActive >= 0) {
    for (let i = 0; i < rightmostActive; i++) {
      nodes[i].state = "done";
    }
  }

  return nodes;
}

function WorkflowTimeline({
  nodes,
  title,
  pulsing,
}: {
  nodes: { name: string; state: "wait" | "running" | "done" }[];
  title: string;
  pulsing?: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-sm text-foreground">{title}</h4>
        {pulsing && (
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
        )}
      </div>
      <div className="flex flex-col space-y-0">
        {nodes.map((node, i) => (
          <div key={i} className="flex items-stretch">
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
                  className={`w-px flex-1 my-1 min-h-[12px] ${
                    node.state === "done" ? "bg-green-200" : "bg-border"
                  }`}
                />
              )}
            </div>
            <div
              className={`pb-2 text-sm leading-snug font-medium ${
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
    </>
  );
}

function ConfigPreviewInline({
  configSummary,
}: {
  configSummary: ExecutionPanelProps["configSummary"];
}) {
  return (
    <div className="mt-4 pt-3 border-t border-border">
      <p className="text-xs font-semibold mb-2 px-1">当前配置预览</p>
      <div className="bg-muted/60 rounded-lg px-3 py-2.5 space-y-1.5 text-xs leading-snug">
        {[
          ["物料来源", configSummary.source],
          ["参考知识", configSummary.knowledge],
          ["历史范文", configSummary.history],
          ["输出格式", "XMind + Markdown"],
        ].map(([label, value]) => (
          <div
            key={label as string}
            className="grid grid-cols-[4.5rem_1fr] gap-2 items-center min-h-[18px]"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium truncate text-right tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DoneBanner() {
  return (
    <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2 text-xs leading-snug text-emerald-700">
      ✓ 执行完成 · 文件已就绪
    </div>
  );
}

function QuickActions({
  onOpenDownloadModal,
  onOpenEditModal,
  onScrollToAITweak,
}: {
  onOpenDownloadModal: () => void;
  onOpenEditModal: () => void;
  onScrollToAITweak: () => void;
}) {
  return (
    <div className="mt-4 pt-3 border-t border-border">
      <p className="text-xs font-semibold mb-2">快捷操作</p>
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={onOpenDownloadModal}
          className="w-full flex items-center justify-between gap-2 text-sm leading-none px-3 py-2.5 rounded-lg border border-border hover:bg-muted/40 text-left"
        >
          <span className="flex items-center gap-2">
            <Download className="w-4 h-4 text-primary shrink-0" />
            下载文件
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenEditModal}
          className="w-full flex items-center justify-between gap-2 text-sm leading-none px-3 py-2.5 rounded-lg border border-border hover:bg-muted/40 text-left"
        >
          <span className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-primary shrink-0" />
            编辑脑图
          </span>
        </button>
        <button
          type="button"
          onClick={onScrollToAITweak}
          className="w-full flex items-center justify-between gap-2 text-sm leading-none px-3 py-2.5 rounded-lg border border-border hover:bg-muted/40 text-left"
        >
          <span className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary shrink-0" />
            AI 微调
          </span>
          <span className="text-xs text-muted-foreground shrink-0">↓主区</span>
        </button>
      </div>
    </div>
  );
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
  onNavigateToEditor,
}: ExecutionPanelProps) {
  const nodes = useMemo(
    () => deriveNodeStates(foundFiles, generating, logStages),
    [foundFiles, generating, logStages]
  );

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const downloadFiles = useMemo(() => {
    const displayable = foundFiles.filter((f) => isDisplayable(f.name));
    const pickLatest = (ext: string) => {
      const files = displayable
        .filter((f) => f.name.endsWith(ext))
        .sort((a, b) => {
          const va = parseInt(a.name.match(/_v(\d+)\./)?.[1] || "0", 10);
          const vb = parseInt(b.name.match(/_v(\d+)\./)?.[1] || "0", 10);
          return vb - va;
        });
      return files[0] || null;
    };
    return [pickLatest(".md"), pickLatest(".xmind"), pickLatest(".xlsx")].filter(
      Boolean
    ) as FileInfo[];
  }, [foundFiles]);

  const xmindFiles = useMemo(
    () => foundFiles.filter((f) => isDisplayable(f.name) && f.name.endsWith(".xmind")),
    [foundFiles]
  );

  if (wizStep < 2) {
    return (
      <PanelShell>
        <SidebarCard>
          <WorkflowTimeline nodes={nodes} title="执行轨迹" />
          <ConfigPreviewInline configSummary={configSummary} />
        </SidebarCard>
      </PanelShell>
    );
  }

  if (wizStep === 2 && generating && !isTweak) {
    return (
      <PanelShell>
        <SidebarCard>
          <WorkflowTimeline nodes={nodes} title="生成中" pulsing />
        </SidebarCard>
      </PanelShell>
    );
  }

  if (wizStep === 2 && !generating && (foundFiles.length > 0 || hasResult)) {
    return (
      <PanelShell>
        <SidebarCard>
          <WorkflowTimeline nodes={nodes} title="执行轨迹" />
          <DoneBanner />
          <QuickActions
            onOpenDownloadModal={() => setDownloadModalOpen(true)}
            onOpenEditModal={() => setEditModalOpen(true)}
            onScrollToAITweak={onScrollToAITweak}
          />
          {taskId && (
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs font-semibold mb-2">本次生成评价</p>
              <RatingPanel sectioned taskId={taskId} />
            </div>
          )}
        </SidebarCard>

        <FileActionModal
          open={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
          title="下载文件"
          files={downloadFiles}
          actionLabel="下载"
          onAction={(file) => onDownloadFile(file)}
          emptyText="暂无可下载文件"
        />

        <FileActionModal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title="编辑脑图"
          files={xmindFiles}
          actionLabel="编辑"
          onAction={(file) => onNavigateToEditor(file.relativePath)}
          emptyText="暂无可编辑的脑图文件"
        />
      </PanelShell>
    );
  }

  if (wizStep === 2 && generating && isTweak) {
    return (
      <PanelShell>
        <SidebarCard>
          <WorkflowTimeline nodes={nodes} title="微调中" pulsing />
        </SidebarCard>
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <SidebarCard>
        <WorkflowTimeline nodes={nodes} title="执行轨迹" />
      </SidebarCard>
    </PanelShell>
  );
}
