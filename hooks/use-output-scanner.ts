"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface FileInfo {
  name: string;
  relativePath: string;
}

interface UseOutputScannerOptions {
  taskId: string;
  interval?: number;
  onResult?: (data: {
    tree: unknown;
    summary?: { totalCases: number; qualityScore: number; modules: number };
    outputFiles?: { name: string; path: string }[];
  }) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

interface FileSizeMap {
  [filename: string]: { size: number; stableCount: number };
}

export function useOutputScanner({
  taskId,
  interval = 3000,
  onResult,
  onError,
  enabled = true,
}: UseOutputScannerOptions) {
  const [isScanning, setIsScanning] = useState(false);
  const [foundFiles, setFoundFiles] = useState<FileInfo[]>([]);
  const [, setPollCount] = useState(0);
  const fileSizesRef = useRef<FileSizeMap>({});
  const stopRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ onResult, onError });
  callbacksRef.current = { onResult, onError };

  const stop = useCallback(() => {
    stopRef.current = true;
    setIsScanning(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!taskId || !enabled) return;

    stopRef.current = false;
    setIsScanning(true);
    fileSizesRef.current = {};
    setFoundFiles([]);

    const poll = async () => {
      if (stopRef.current) return;

      try {
        // 1. Check task status first
        const taskRes = await fetch(`/api/tasks/${taskId}`);
        if (!taskRes.ok) {
          callbacksRef.current.onError?.("无法获取任务状态");
          stop();
          return;
        }
        const taskData = await taskRes.json();
        const status = taskData.task?.status;

        if (status === "failed") {
          callbacksRef.current.onError?.("任务执行失败");
          stop();
          return;
        }
        if (status === "cancelled") {
          stop();
          return;
        }

        // 2. Call report endpoint to check for output files
        const reportRes = await fetch(`/api/tasks/${taskId}/report`);
        if (!reportRes.ok) {
          if (!stopRef.current) {
            timerRef.current = setTimeout(poll, interval);
          }
          return;
        }
        const report = await reportRes.json();

        // 3. Check if output files exist
        const files = report.outputFiles || [];
        const newFoundFiles: FileInfo[] = files.map(
          (f: { name: string; path: string }) => {
            // Extract relativePath from the download URL in `path`
            let relativePath = f.name;
            try {
              const url = new URL(f.path, "http://x");
              const fileParam = url.searchParams.get("file");
              if (fileParam) relativePath = decodeURIComponent(fileParam);
            } catch {
              // fallback to basename
            }
            return { name: f.name, relativePath };
          }
        );
        if (newFoundFiles.length > 0) {
          setFoundFiles(newFoundFiles);
        }

        // 4. Stability check — use totalCases as stability proxy
        if (report.tree && newFoundFiles.length > 0) {
          const currentCases = report.summary?.totalCases || 0;

          const mdFiles = newFoundFiles.filter((f: FileInfo) =>
            f.name.includes("测试用例")
          );

          if (mdFiles.length > 0 && currentCases > 0) {
            const prevEntry = fileSizesRef.current["_md"];
            const newStableCount =
              prevEntry && prevEntry.size === currentCases
                ? prevEntry.stableCount + 1
                : 1;

            fileSizesRef.current["_md"] = {
              size: currentCases,
              stableCount: newStableCount,
            };

            // Stable for 2 consecutive polls → complete
            if (newStableCount >= 2) {
              callbacksRef.current.onResult?.(report);
              stop();
              return;
            }
          }
        }
      } catch {
        // Network error — retry next poll
      }

      if (!stopRef.current) {
        setPollCount((c) => c + 1);
        timerRef.current = setTimeout(poll, interval);
      }
    };

    poll();

    return () => {
      stopRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [taskId, enabled, interval, stop]);

  return { isScanning, foundFiles, stop };
}
