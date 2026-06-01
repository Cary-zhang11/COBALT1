"use client";

import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { X, Loader2, AlertCircle } from "lucide-react";

interface FilePreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  taskId: string | null;
}

export function FilePreviewModal({ open, onClose, fileName, taskId }: FilePreviewModalProps) {
  const [mdContent, setMdContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    if (!taskId || !open) return;

    setLoading(true);
    setError(null);
    setMdContent(null);

    try {
      const res = await fetch(
        `/api/tasks/${taskId}/download?file=${encodeURIComponent(fileName)}`
      );
      if (!res.ok) throw new Error("文件加载失败");
      const text = await res.text();
      setMdContent(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [taskId, open, fileName]);

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

          {!loading && !error && mdContent !== null && (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{mdContent}</ReactMarkdown>
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
