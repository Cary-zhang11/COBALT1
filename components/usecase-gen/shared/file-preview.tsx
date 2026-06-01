"use client";

import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { X, Loader2, AlertCircle, ChevronRight, ChevronDown } from "lucide-react";

interface XMindTopic {
  title: string;
  children: XMindTopic[];
}

interface XMindSheet {
  title: string;
  rootTopic: XMindTopic;
}

interface FilePreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  taskId: string | null;
}

function XMindTreeNode({ topic, depth = 0 }: { topic: XMindTopic; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (topic.children.length === 0) {
    return (
      <div
        className="flex items-center py-0.5 text-sm text-muted-foreground"
        style={{ paddingLeft: `${depth * 20 + 24}px` }}
      >
        {topic.title}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 py-0.5 text-sm font-medium hover:text-foreground transition-colors w-full text-left"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        )}
        <span className="truncate">{topic.title}</span>
      </button>
      {expanded && (
        <div>
          {topic.children.map((child, i) => (
            <XMindTreeNode key={i} topic={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FilePreviewModal({ open, onClose, fileName, taskId }: FilePreviewModalProps) {
  const [mdContent, setMdContent] = useState<string | null>(null);
  const [xmindData, setXmindData] = useState<XMindSheet[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMd = fileName.endsWith(".md");
  const isXmind = fileName.endsWith(".xmind");

  const fetchContent = useCallback(async () => {
    if (!taskId || !open) return;

    setLoading(true);
    setError(null);
    setMdContent(null);
    setXmindData(null);

    try {
      if (isXmind) {
        const res = await fetch(
          `/api/tasks/${taskId}/xmind-preview?file=${encodeURIComponent(fileName)}`
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error || "解析失败");
        }
        const data = await res.json();
        setXmindData(data.sheets as XMindSheet[]);
      } else {
        const res = await fetch(
          `/api/tasks/${taskId}/download?file=${encodeURIComponent(fileName)}`
        );
        if (!res.ok) throw new Error("文件加载失败");
        const text = await res.text();
        setMdContent(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [taskId, open, fileName, isXmind]);

  useEffect(() => {
    if (open) fetchContent();
  }, [open, fetchContent]);

  // Esc key close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-sm truncate pr-4">{fileName}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center gap-2 py-16 text-red-500">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {!loading && !error && isMd && mdContent !== null && (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{mdContent}</ReactMarkdown>
            </div>
          )}

          {!loading && !error && isXmind && xmindData && (
            <div className="space-y-4">
              {xmindData.map((sheet, i) => (
                <div key={i}>
                  <h4 className="font-semibold text-sm mb-2 text-muted-foreground">
                    {sheet.title}
                  </h4>
                  <div className="border rounded-xl p-3">
                    <XMindTreeNode topic={sheet.rootTopic} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/60 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
