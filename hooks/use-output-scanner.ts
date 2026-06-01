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
    tweakHistory?: unknown;
    tweakCount?: number;
  }) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
  /** Current xmind version before tweak started.
   *  -1 = no xmind exists yet (initial generation), any xmind triggers completion.
   *   0 = unversioned xmind exists, wait for _v1+.
   *   N = _v{N}.xmind exists, wait for _v{N+1}+. */
  xmindBaselineVersion?: number;
}

/**
 * Extract version number from xmind filename.
 *   "测试用例.xmind"       → 0  (no version suffix = v0)
 *   "测试用例_v3.xmind"    → 3
 * Returns -1 if no xmind files in the list.
 */
function maxXmindVersion(files: FileInfo[]): number {
  const xmindFiles = files.filter((f) => f.name.endsWith(".xmind"));
  if (xmindFiles.length === 0) return -1;

  let maxV = -1;
  for (const f of xmindFiles) {
    const m = f.name.match(/_v(\d+)\.xmind$/);
    if (m) {
      maxV = Math.max(maxV, parseInt(m[1], 10));
    } else {
      // Unversioned file → treat as v0 if no versioned file found yet
      maxV = Math.max(maxV, 0);
    }
  }
  return maxV;
}

export function useOutputScanner({
  taskId,
  interval = 3000,
  onResult,
  onError,
  enabled = true,
  xmindBaselineVersion = -1,
}: UseOutputScannerOptions) {
  const [isScanning, setIsScanning] = useState(false);
  const [foundFiles, setFoundFiles] = useState<FileInfo[]>([]);
  const [, setPollCount] = useState(0);
  const stopRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ onResult, onError });
  callbacksRef.current = { onResult, onError };
  const prevTaskIdRef = useRef(taskId);

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

    const taskChanged = prevTaskIdRef.current !== taskId;
    prevTaskIdRef.current = taskId;

    stopRef.current = false;
    setIsScanning(true);
    if (taskChanged) {
      setFoundFiles([]);
    }

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

        // 3. Map files
        const files = report.outputFiles || [];
        const newFoundFiles: FileInfo[] = files.map(
          (f: { name: string; path: string }) => {
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

        // 4. Completion check — xmind file version as gate
        const currentXmindVersion = maxXmindVersion(newFoundFiles);

        // Wait for a new xmind version to appear (above baseline)
        if (currentXmindVersion <= xmindBaselineVersion) {
          if (!stopRef.current) {
            timerRef.current = setTimeout(poll, interval);
          }
          return;
        }

        // New xmind detected — verify tree is parsed before completing
        if (!report.tree) {
          if (!stopRef.current) {
            timerRef.current = setTimeout(poll, interval);
          }
          return;
        }

        callbacksRef.current.onResult?.(report);
        stop();
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
