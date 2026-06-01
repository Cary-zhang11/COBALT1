"use client";

import { useState } from "react";
import { FileText, Download, Loader2, Eye } from "lucide-react";
import type { FileInfo } from "@/hooks/use-output-scanner";
import { FilePreviewModal } from "./file-preview";

interface OutputFilesProps {
  taskId: string | null;
  files: FileInfo[];
}

function isDisplayable(name: string): boolean {
  if (name.includes("_source")) return false;
  if (name.includes("archive/")) return false;
  return name.endsWith(".md") || name.endsWith(".xmind");
}

function isPreviewable(name: string): boolean {
  return name.endsWith(".md") || name.endsWith(".xmind");
}

function downloadFile(taskId: string, file: FileInfo) {
  const url = `/api/tasks/${taskId}/download?file=${encodeURIComponent(file.relativePath)}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function OutputFiles({ taskId, files }: OutputFilesProps) {
  const displayable = files.filter((f) => isDisplayable(f.name));
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);

  return (
    <>
      <div className="bg-card rounded-xl shadow-sm p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          输出文件
        </h3>
        {displayable.length === 0 ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            生成中...
          </p>
        ) : (
          <div className="space-y-1.5">
            {displayable.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 text-sm"
              >
                <button
                  onClick={() => {
                    if (isPreviewable(f.name) && taskId) {
                      setSelectedFile(f);
                    }
                  }}
                  disabled={!isPreviewable(f.name) || !taskId}
                  className="flex items-center gap-2 min-w-0 text-left hover:text-primary transition-colors disabled:cursor-default"
                  title={isPreviewable(f.name) ? "点击预览" : undefined}
                >
                  <Eye className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
                <button
                  onClick={() => {
                    if (!taskId) return;
                    downloadFile(taskId, f);
                  }}
                  disabled={!taskId}
                  className="text-primary hover:text-primary/70 disabled:opacity-40 flex-shrink-0 ml-2"
                  title="下载"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <FilePreviewModal
        open={selectedFile !== null}
        onClose={() => setSelectedFile(null)}
        fileName={selectedFile?.relativePath || ""}
        taskId={taskId}
      />
    </>
  );
}
