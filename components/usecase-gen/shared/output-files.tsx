"use client";

import { FileText, Download, Loader2 } from "lucide-react";

interface OutputFilesProps {
  taskId: string | null;
  files: string[];
}

function isDisplayable(name: string): boolean {
  if (name.includes("_source")) return false;
  return name.includes("测试用例") && (name.endsWith(".md") || name.endsWith(".xmind"));
}

export function OutputFiles({ taskId, files }: OutputFilesProps) {
  const displayable = files.filter(isDisplayable);

  return (
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
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{f}</span>
              </div>
              <button
                onClick={() => {
                  if (!taskId) return;
                  window.open(
                    `/api/tasks/${taskId}/download?file=${encodeURIComponent(f)}`
                  );
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
  );
}
