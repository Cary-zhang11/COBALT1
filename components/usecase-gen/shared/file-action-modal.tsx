"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";

interface FileActionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  files: FileInfo[];
  actionLabel: string;
  onAction: (file: FileInfo) => void;
  emptyText?: string;
}

export function FileActionModal({
  open,
  onClose,
  title,
  files,
  actionLabel,
  onAction,
  emptyText,
}: FileActionModalProps) {
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
      <div className="bg-card rounded-2xl shadow-2xl w-fit min-w-[320px] max-w-2xl max-h-[70vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {emptyText || "暂无文件"}
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 min-h-[40px]"
                >
                  <span className="whitespace-nowrap text-sm font-medium">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAction(file)}
                    className="inline-flex items-center justify-center h-7 px-3 text-xs font-medium leading-none rounded-md whitespace-nowrap shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {actionLabel}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
