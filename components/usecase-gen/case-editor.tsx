"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Undo2, Redo2, Save, Download, ArrowLeft } from "lucide-react";
import { createEditorBridge, resetGlobalReadyState, type EditorBridge } from "./editor-bridge";
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
  const [loadingStatus, setLoadingStatus] = useState("加载脑图画布...");
  // bridgeReady: bridge 已创建，可以开始等 iframe 的 postMessage("ready")
  // 不依赖 iframe.onLoad（它要等 6.6MB JS 全部下载完才触发，慢网络会超时）
  const [bridgeReady, setBridgeReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadingPhaseRef = useRef(true);
  const mountTimeRef = useRef(performance.now());

  // Keep latest props in refs so async callbacks always read current values
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;
  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;

  // iframe onLoad — 仅记录日志，不再作为加载流程的触发条件
  // onLoad 要等 iframe 内所有 <script> 下载执行完才触发（6.6MB），
  // 慢网络下可能需要数分钟。postMessage 不受此限制。
  const handleIframeLoad = useCallback(() => {
    const ms = Math.round(performance.now() - mountTimeRef.current);
    console.log(`[Editor] iframe onLoad fired (+${ms}ms) — informational only`);
  }, []);

  // 1) Bridge creation
  const readyRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    console.log("[Editor] Creating bridge, resetting globalReadyState");
    resetGlobalReadyState();
    const bridge = createEditorBridge(iframeRef.current);
    bridgeRef.current = bridge;

    bridge.onDirty((d: boolean) => setDirty(d));
    bridge.onSaveRequested(() => handleSave());
    bridge.onLoading((phase: string) => {
      if (phase === "start") setLoadingStatus("正在初始化编辑器...");
      else if (phase === "downloading") setLoadingStatus("正在下载脑图引擎...");
      else setLoadingStatus("正在加载...");
    });
    bridge.onError((msg: string) => {
      console.error("[Editor] iframe error:", msg);
      setErrorMsg(msg);
      if (loadingPhaseRef.current) {
        setHasData(false);
        setLoadFailed(true);
        setLoading(false);
      }
    });

    // Bridge 已就绪，触发数据加载流程
    setBridgeReady(true);

    return () => {
      bridge.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Data loading: bridge 创建后立即开始，不依赖 iframe onLoad
  //    waitReady() 会阻塞到 mind-map.js 发送 postMessage("ready")
  //    postMessage 在 onLoad 之前就能工作，不受 6.6MB 下载阻塞
  useEffect(() => {
    console.log("[Editor] data-loading effect: bridgeReady=", bridgeReady, "bridge=", !!bridgeRef.current);
    if (!bridgeReady || !bridgeRef.current) return;
    const bridge = bridgeRef.current;
    console.log("[Editor] props: taskId=", taskIdRef.current, "filePath=", filePathRef.current);

    let cancelled = false;
    loadingPhaseRef.current = true;
    setLoadFailed(false);
    setErrorMsg(null);

    // 总超时保护：慢网络下 6.6MB 下载可能需要几分钟
    const totalTimeout = setTimeout(() => {
      if (cancelled || !loadingPhaseRef.current) return;
      console.error("[Editor] 总加载超时(180s)");
      loadingPhaseRef.current = false;
      setErrorMsg("加载超时，请检查网络连接后重试");
      setHasData(false);
      setLoadFailed(true);
      setLoading(false);
    }, 180000);

    (async () => {
      try {
        const t0 = performance.now();
        // 等 mind-map.js 创建完 mindMap 实例后发送的 "ready"
        // 慢网络给 120 秒（6.6MB JS 下载+解析）
        console.log("[Editor] Waiting for iframe ready (120s timeout)...");
        await bridge.waitReady(120000);
        if (cancelled) return;
        console.log(`[Editor] iframe ready received (+${Math.round(performance.now() - t0)}ms)`);

        const fp = filePathRef.current;
        const tid = taskIdRef.current;

        if (!fp || !tid) {
          console.warn("[Editor] missing taskId or filePath, skip loading");
          loadingPhaseRef.current = false;
          setLoading(false);
          return;
        }

        // iframe 直接 fetch 服务端文件，不走 base64 中转
        const url = `/api/tasks/${tid}/download?file=${encodeURIComponent(fp)}`;
        console.log(`[Editor] Telling iframe to fetch: ${url} (+${Math.round(performance.now() - t0)}ms)`);
        setHasData(true);
        bridge.importXmindUrl(url);
        await bridge.waitReady(60000);
        if (cancelled) return;
        const totalMs = Math.round(performance.now() - t0);
        console.log(`[Editor] Import complete (+${totalMs}ms)`);
        loadingPhaseRef.current = false;
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err as { message?: string };
        console.error("[Editor] load error:", e?.message, e);
        loadingPhaseRef.current = false;
        setErrorMsg(e?.message?.includes("超时") ? "脑图加载超时，请刷新重试" : "脑图加载失败");
        setLoadFailed(true);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      loadingPhaseRef.current = false;
      clearTimeout(totalTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeReady, filePath, taskId]);

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
              <p className="text-sm text-muted-foreground">{loadingStatus}</p>
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
          src="/api/editor-assets/html"
          className="w-full h-full border-0"
          title="用例脑图编辑器"
          sandbox="allow-scripts allow-same-origin allow-storage-access-by-user-activation allow-modals"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}
