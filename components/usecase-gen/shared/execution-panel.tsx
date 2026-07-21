"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Download,
  MessageSquare,
  Edit3,
  FileText,
  BookOpen,
  History,
  X,
  Ticket,
} from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";
import { FileActionModal } from "./file-action-modal";
import { RatingPanel } from "./rating-panel";
import { EfficiencyComparison, type UsabilityData } from "./efficiency-comparison";
import { isDisplayable } from "./output-files";

const WORKFLOW_NODES: { name: string; key: string }[] = [
  { name: "文档解析", key: "source" },
  { name: "需求分析", key: "rag" },
  { name: "用例生成", key: "llm" },
  { name: "质量校验", key: "quality" },
  { name: "导出格式", key: "export" },
];

export interface ExecutionMaterials {
  /** 已上传的需求文件（basename） */
  requirementFiles: string[];
  /** 用户原始需求文案（已去掉自动拼接的附件/参考说明） */
  requirementText: string;
  /** 关联的业务知识条目（文件名或标题） */
  knowledgeItems: string[];
  /** 关联的历史用例范文（文件名或标题） */
  historyItems: string[];
  /** 工单地址（完整 URL） */
  ticketUrl: string;
  /** 需求地址（知识库文档链接） */
  requirementUrl: string;
}

interface ExecutionPanelProps {
  taskId: string | null;
  generating: boolean;
  wizStep: number;
  hasResult: boolean;
  isTweak?: boolean;
  /** Step<2 阶段的配置摘要，兼容旧用法 */
  configSummary?: {
    source: string;
    knowledge: string;
    history: string;
  };
  /** Step2 结果页的输入物料明细 */
  materials?: ExecutionMaterials;
  /** 用例复核初始数据（来自 report 接口，避免额外 fetch） */
  usabilityData?: UsabilityData | null;
  foundFiles: FileInfo[];
  logStages?: Set<string>;
  onDownloadFile: (file: FileInfo) => void;
  onScrollToAITweak: () => void;
  onNavigateToEditor: (filePath?: string) => void;
  /** 下载需求文件（从 workspace 目录取），传 taskId 时才可用 */
  onDownloadRequirementFile?: (fileName: string) => void;
  /** 工单地址编辑回调 */
  onTicketUrlChange?: (url: string) => void;
}

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <aside className="w-72 flex-shrink-0 sticky top-6 self-start z-10">
      {children}
    </aside>
  );
}

function SidebarCard({
  children,
  compact = false,
}: {
  children: ReactNode;
  /** 结果页开启一屏无滚动布局 */
  compact?: boolean;
}) {
  const base =
    "bg-card rounded-xl border border-border/60 text-sm [text-rendering:optimizeLegibility]";
  return (
    <div
      className={
        compact
          ? `${base} p-4 flex flex-col gap-3 max-h-[calc(100vh-6rem)] overflow-hidden`
          : `${base} p-4 max-h-[calc(100vh-8rem)] overflow-y-auto`
      }
    >
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
  configSummary: NonNullable<ExecutionPanelProps["configSummary"]>;
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

/**
 * 物料列表小节：每项独占一行，可选下载按钮
 */
function MaterialsList({
  icon,
  label,
  items,
  emptyText = "未关联",
  onItemDownload,
}: {
  icon: ReactNode;
  label: string;
  items: string[];
  emptyText?: string;
  onItemDownload?: (item: string) => void;
}) {
  const count = items.length;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-medium text-foreground/85">
          {label}
          {count > 0 && (
            <span className="ml-1 text-muted-foreground font-normal">({count})</span>
          )}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground/70 pl-5">{emptyText}</p>
      ) : (
        <ul className="pl-5 space-y-0.5 max-h-24 overflow-y-auto pr-1">
          {items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="flex items-center justify-between gap-1 text-xs leading-snug group"
            >
              <span
                className="text-foreground/80 truncate flex-1 min-w-0"
                title={item}
              >
                {item}
              </span>
              {onItemDownload && (
                <button
                  type="button"
                  onClick={() => onItemDownload(item)}
                  className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors opacity-60 hover:opacity-100"
                  title={`下载 ${item}`}
                  aria-label={`下载 ${item}`}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 需求文案：一行截断 + 查看全文按钮 + 弹窗
 */
function RequirementTextRow({ text }: { text: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const hasText = text.trim().length > 0;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <MessageSquare className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground/85">需求文案</span>
      </div>
      {hasText ? (
        <div className="pl-5 flex items-center gap-1.5">
          <p
            className="text-xs text-foreground/80 leading-snug truncate flex-1 min-w-0"
            title={text}
          >
            {text}
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex-shrink-0 text-[11px] text-primary hover:underline whitespace-nowrap"
          >
            查看全文
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/70 pl-5">未填写</p>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setModalOpen(false)}
          role="presentation"
        >
          <div
            className="bg-card rounded-xl shadow-xl border border-border w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">需求文案全文</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                {text}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TicketUrlRow({
  url,
  onChange,
}: {
  url: string;
  onChange?: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== url) onChange?.(trimmed);
  };

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Ticket className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground/85">工单地址</span>
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(url); setEditing(false); } }}
          className="pl-5 w-full text-xs border border-primary/40 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/40"
          placeholder="https://xz.corpautohome.com/requirement/detail/123456"
        />
      ) : url ? (
        <div className="pl-5 flex items-center gap-1 group">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline truncate flex-1 min-w-0"
            title={url}
          >
            {url}
          </a>
          {onChange && (
            <button type="button" onClick={() => { setDraft(url); setEditing(true); }} className="flex-shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity">
              <Edit3 className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(""); setEditing(true); }}
          className="pl-5 text-xs text-muted-foreground/60 hover:text-primary transition-colors"
        >
          点击填写工单地址…
        </button>
      )}
    </div>
  );
}

function MaterialsSection({
  materials,
  onDownloadRequirementFile,
  onTicketUrlChange,
}: {
  materials: ExecutionMaterials;
  onDownloadRequirementFile?: (fileName: string) => void;
  onTicketUrlChange?: (url: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-sm text-foreground">输入物料</h4>
      </div>
      <div className="space-y-2.5">
        <MaterialsList
          icon={<FileText className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />}
          label="需求文件"
          items={materials.requirementFiles}
          emptyText="无上传文件"
          onItemDownload={onDownloadRequirementFile}
        />
        <RequirementTextRow text={materials.requirementText} />
        <MaterialsList
          icon={<BookOpen className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />}
          label="关联知识库"
          items={materials.knowledgeItems}
        />
        <MaterialsList
          icon={<History className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />}
          label="历史范文"
          items={materials.historyItems}
        />
        <TicketUrlRow url={materials.ticketUrl} onChange={onTicketUrlChange} />
        {materials.requirementUrl && (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
              <span className="text-xs font-medium text-foreground/85">需求地址</span>
            </div>
            <a
              href={materials.requirementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pl-5 block text-xs text-primary hover:underline truncate"
              title={materials.requirementUrl}
            >
              {materials.requirementUrl}
            </a>
          </div>
        )}
      </div>
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
    <div>
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

const EMPTY_MATERIALS: ExecutionMaterials = {
  requirementFiles: [],
  requirementText: "",
  knowledgeItems: [],
  historyItems: [],
  ticketUrl: "",
  requirementUrl: "",
};

export function ExecutionPanel({
  taskId,
  generating,
  wizStep,
  hasResult,
  isTweak,
  configSummary,
  materials,
  usabilityData,
  foundFiles,
  logStages,
  onDownloadFile,
  onScrollToAITweak,
  onNavigateToEditor,
  onDownloadRequirementFile,
  onTicketUrlChange,
}: ExecutionPanelProps) {
  const nodes = useMemo(
    () => deriveNodeStates(foundFiles, generating, logStages),
    [foundFiles, generating, logStages]
  );

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const downloadFiles = useMemo(
    () => foundFiles.filter((f) => isDisplayable(f.name)),
    [foundFiles]
  );

  const xmindFiles = useMemo(
    () => foundFiles.filter((f) => isDisplayable(f.name) && f.name.endsWith(".xmind")),
    [foundFiles]
  );

  if (wizStep < 2) {
    return (
      <PanelShell>
        <SidebarCard>
          <WorkflowTimeline nodes={nodes} title="执行轨迹" />
          {configSummary && <ConfigPreviewInline configSummary={configSummary} />}
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
    const mat = materials ?? EMPTY_MATERIALS;
    return (
      <PanelShell>
        <SidebarCard compact>
          <div className="flex-1 min-h-0 overflow-y-auto -mr-1 pr-1 space-y-3">
            <MaterialsSection
              materials={mat}
              onDownloadRequirementFile={onDownloadRequirementFile}
              onTicketUrlChange={onTicketUrlChange}
            />
            <div className="border-t border-border" />
            <QuickActions
              onOpenDownloadModal={() => setDownloadModalOpen(true)}
              onOpenEditModal={() => setEditModalOpen(true)}
              onScrollToAITweak={onScrollToAITweak}
            />
            <div className="border-t border-border" />
            <EfficiencyComparison taskId={taskId} initialData={usabilityData} />
            {/* TODO: 本次生成评价模块暂时隐藏，后续可能恢复 */}
            {false && taskId && (
              <>
                <div className="border-t border-border" />
                <div>
                  <p className="text-xs font-semibold mb-1.5">本次生成评价</p>
                  <RatingPanel sectioned taskId={taskId} />
                </div>
              </>
            )}
          </div>
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
