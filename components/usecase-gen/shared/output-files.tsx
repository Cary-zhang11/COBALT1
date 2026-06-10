"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";
import { FilePreviewModal } from "./file-preview";

interface OutputFilesProps {
  taskId: string | null;
  files: FileInfo[];
  onEditMarkdown?: (file: FileInfo) => void;
  /** 由外层 WizardSection 提供标题与边框 */
  sectioned?: boolean;
  /** 是否正在生成中。有文件时不转圈，无文件且有此标记时展示"生成中..." */
  isGenerating?: boolean;
}

function isDisplayable(name: string): boolean {
  if (name.includes("_source")) return false;
  if (name.includes("archive/")) return false;
  return name.endsWith(".md") || name.endsWith(".xmind");
}

function isPreviewable(name: string): boolean {
  return name.endsWith(".md");
}

/** 12px + 固定行高，避免 10px 在 Windows 缩放下发糊 */
const fileActionBtn =
  "inline-flex items-center justify-center h-7 px-2.5 text-xs font-medium leading-none rounded-md whitespace-nowrap shrink-0";

function downloadFile(taskId: string, file: FileInfo) {
  const url = `/api/tasks/${taskId}/download?file=${encodeURIComponent(file.relativePath)}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function OutputFiles({ taskId, files, onEditMarkdown, sectioned, isGenerating }: OutputFilesProps) {
  const displayable = files.filter((f) => isDisplayable(f.name));
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);

  const listBody =
    displayable.length === 0 ? (
      isGenerating ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          生成中...
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">暂无输出文件</p>
      )
    ) : (
      <div className="space-y-1.5">
        {displayable.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 min-h-[44px] text-sm"
          >
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate flex-1 min-w-0 text-sm font-medium leading-5">{f.name}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isPreviewable(f.name) && taskId && (
                <button
                  type="button"
                  onClick={() => setSelectedFile(f)}
                  className={`${fileActionBtn} bg-primary/10 text-primary hover:bg-primary/20 transition-colors`}
                >
                  预览
                </button>
              )}
              {isPreviewable(f.name) && taskId && onEditMarkdown && (
                <button
                  type="button"
                  onClick={() => onEditMarkdown(f)}
                  className={`${fileActionBtn} bg-primary text-primary-foreground hover:bg-primary/90 transition-colors`}
                >
                  编辑
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!taskId) return;
                  downloadFile(taskId, f);
                }}
                disabled={!taskId}
                className={`${fileActionBtn} bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground disabled:opacity-40 transition-colors`}
                title="下载"
              >
                下载
              </button>
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <>
      {sectioned ? (
        listBody
      ) : (
        <div className="bg-card rounded-xl shadow-sm p-5">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            输出文件
          </h3>
          {listBody}
        </div>
      )}

      <FilePreviewModal
        open={selectedFile !== null}
        onClose={() => setSelectedFile(null)}
        fileName={selectedFile?.relativePath || ""}
        taskId={taskId}
      />
    </>
  );
}
