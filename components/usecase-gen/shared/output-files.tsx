"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
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
  return name.endsWith(".md");
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
                <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mr-2" />
                <span className="truncate flex-1 min-w-0">{f.name}</span>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {isPreviewable(f.name) && taskId && (
                    <button
                      onClick={() => setSelectedFile(f)}
                      className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
                    >
                      预览
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (!taskId) return;
                      downloadFile(taskId, f);
                    }}
                    disabled={!taskId}
                    className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground font-medium hover:bg-muted/60 hover:text-foreground disabled:opacity-40 transition-colors"
                    title="下载"
                  >
                    下载
                  </button>
                </div>
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
