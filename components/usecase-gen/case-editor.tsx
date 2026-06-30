"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Undo2, Redo2, Save, Download, ArrowLeft } from "lucide-react";
import { createEditorBridge, markGlobalReady, type EditorBridge } from "./editor-bridge";
import type { MindMapData } from "@/lib/md-mindmap-convert";

interface SaveResult {
  json: MindMapData;
  xmindBase64: string;
}

interface CaseEditorProps {
  onSave: (result: SaveResult) => Promise<void>;
  onBack?: () => void;
  taskId?: string | null;
  filePath?: string | null;
  fileName?: string;
}

export function CaseEditor({ fileName, onSave, onBack, taskId, filePath }: CaseEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<EditorBridge | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  // `loadFailed` toggles the full-canvas error panel (retry + download buttons).
  // It is set during the load phase only — save/export errors stay in the
  // small status bar above the canvas.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadingPhaseRef = useRef(true);

  // Keep latest props in refs so async callbacks always read current values
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;
  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;

  // iframe onLoad
  const handleIframeLoad = useCallback(() => {
    markGlobalReady();
    setIframeLoaded(true);
  }, []);

  // Detect already-loaded iframe (direct refresh)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc && doc.readyState === "complete" && doc.URL !== "about:blank") {
        markGlobalReady();
        setIframeLoaded(true);
      }
    } catch {
      // cross-origin, fall back to onLoad
    }
  }, []);

  // 1) Bridge creation
  const readyRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    const bridge = createEditorBridge(iframeRef.current);
    bridgeRef.current = bridge;

    bridge.onDirty((d: boolean) => setDirty(d));
    bridge.onSaveRequested(() => handleSave());
    bridge.onError((msg: string) => {
      setErrorMsg(msg);
      // iframe-side errors during the load phase (e.g. parseXmindFile failure)
      // must route to the error panel — the empty mindmap behind it is misleading.
      if (loadingPhaseRef.current) {
        setHasData(false);
        setLoadFailed(true);
        setLoading(false);
      }
    });

    return () => {
      bridge.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper: download file as base64 (for XMind binary).
  // Status code is attached so callers can produce friendlier copy for 404 etc.
  async function downloadAsBase64(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }


  // 2) Data loading: wait iframe ready → download XMind → import
  useEffect(() => {
    if (!iframeLoaded || !bridgeRef.current) return;
    const bridge = bridgeRef.current;

    let cancelled = false;
    loadingPhaseRef.current = true;
    setLoadFailed(false);
    setErrorMsg(null);

    (async () => {
      try {
        // Wait for iframe boot's "ready" — no need to init(null) since boot
        // already creates an empty mindMap and posts ready.
        await bridge.waitReady(30000);
        if (cancelled) return;

        const fp = filePathRef.current;
        const tid = taskIdRef.current;

        if (!fp || !tid) {
          loadingPhaseRef.current = false;
          setLoading(false);
          return;
        }

        try {
          // Load exactly the file the user clicked — no redirect to .edited.
          // Source entry shows the original; .edited entry shows the edits.
          const url = `/api/tasks/${tid}/download?file=${encodeURIComponent(fp)}`;
          const base64 = await downloadAsBase64(url);
          if (cancelled) return;
          bridge.importXmindFile(base64);
          setHasData(true);
          await bridge.waitReady(15000);
          if (cancelled) return;
          loadingPhaseRef.current = false;
          setLoading(false);
        } catch (err: unknown) {
          if (cancelled) return;
          const e = err as { status?: number; message?: string };
          console.error("[Editor] load error:", e.message);
          const msg =
            e.status === 404
              ? "文件不存在或已被删除"
              : e.status && e.status >= 500
              ? `服务异常（HTTP ${e.status}）`
              : `加载失败：${e.message || "未知错误"}`;
          loadingPhaseRef.current = false;
          setErrorMsg(msg);
          setHasData(false);
          setLoadFailed(true);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err as { message?: string };
        console.error("[Editor] outer catch:", e?.message);
        loadingPhaseRef.current = false;
        setErrorMsg("脑图加载失败");
        setLoadFailed(true);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      loadingPhaseRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeLoaded, filePath, taskId]);

  const handleSave = useCallback(async () => {
    if (!bridgeRef.current || !hasData) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const json = await bridgeRef.current.getData();
      const xmindBase64 = await bridgeRef.current.exportXmind();
      await onSave({ json, xmindBase64 });
      setDirty(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  }, [hasData, onSave]);

  const handleDownloadXmind = useCallback(async () => {
    if (!bridgeRef.current) return;
    try {
      const base64 = await bridgeRef.current.exportXmind();
      const byteChars = atob(base64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        bytes[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([bytes.buffer], { type: "application/x-zip-compressed" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileNameRef.current || "usecase") + ".xmind";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg("导出失败");
    }
  }, []);

  // Retry loading
  const handleRetry = useCallback(() => {
    setErrorMsg(null);
    setLoadFailed(false);
    setLoading(true);
    window.location.reload();
  }, []);

  // Download the raw .xmind file directly from the backend — escape hatch when
  // the editor cannot render it (parse error / unsupported format).
  const handleDownloadOriginal = useCallback(() => {
    const fp = filePathRef.current;
    const tid = taskIdRef.current;
    if (!fp || !tid) return;
    window.open(
      `/api/tasks/${tid}/download?file=${encodeURIComponent(fp)}`,
      "_blank"
    );
  }, []);

  // beforeunload guard
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const canSave = hasData && !saving;
  const displayName = fileNameRef.current || filePathRef.current?.split("/").pop() || "";

  return (
    <div className="flex flex-col flex-1">
      {/* Toolbar */}
      <div className="bg-card rounded-xl shadow-sm px-4 py-2 mb-2 flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {onBack && (
            <>
              <button
                onClick={onBack}
                className="p-2 rounded-lg hover:bg-muted text-sm"
                title="返回详情"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="w-px h-5 bg-border mx-1" />
            </>
          )}
          <button
            onClick={() => bridgeRef.current?.undo()}
            className="p-2 rounded-lg hover:bg-muted text-sm"
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => bridgeRef.current?.redo()}
            className="p-2 rounded-lg hover:bg-muted text-sm"
            title="重做 (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-border mx-1" />
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${
              canSave
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "text-muted-foreground cursor-not-allowed"
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "保存中..." : "保存"}{dirty ? "*" : ""}
          </button>
          <button
            onClick={handleDownloadXmind}
            disabled={!hasData}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${
              hasData
                ? "hover:bg-muted"
                : "text-muted-foreground cursor-not-allowed"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            下载 XMind
          </button>
        </div>
        {displayName && (
          <span className="text-xs text-muted-foreground">{displayName}{dirty ? " *" : ""}</span>
        )}
      </div>

      {/* Status bar */}
      {errorMsg && (
        <div className="text-xs text-red-500 mb-2 flex-shrink-0">
          {errorMsg}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">加载脑图画布...</p>
            </div>
          </div>
        )}

        {loadFailed && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center max-w-md px-4">
              <p className="text-base font-medium mb-2">无法打开脑图</p>
              <p className="text-sm text-muted-foreground mb-4">
                {errorMsg || "加载失败"}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
                >
                  重试
                </button>
                {filePathRef.current && taskIdRef.current && (
                  <button
                    onClick={handleDownloadOriginal}
                    className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted"
                  >
                    下载原始文件
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!hasData && !loading && !loadFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center max-w-sm">
              <p className="text-base font-medium mb-2">请从任务结果页进入编辑</p>
              <p className="text-sm text-muted-foreground">
                在任务详情页点击输出文件的「编辑」按钮进入编辑器
              </p>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src="/editor/mind-map.html"
          className="w-full h-full border-0"
          title="用例脑图编辑器"
          sandbox="allow-scripts allow-same-origin allow-storage-access-by-user-activation allow-modals"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}
