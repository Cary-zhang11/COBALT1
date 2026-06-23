"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Undo2, Redo2, Save, Download, Upload, BookOpen } from "lucide-react";
import { createEditorBridge, type EditorBridge } from "./editor-bridge";
import type { MindMapData } from "@/lib/md-mindmap-convert";
import { parseTestcaseMarkdown } from "@/lib/parse-testcase-md";
import { modulesToMindMap } from "@/lib/md-mindmap-convert";

interface SaveResult {
  json: MindMapData;
  xmindBase64: string;
}

interface CaseEditorProps {
  data: MindMapData | null;
  fileName?: string;
  onSave: (result: SaveResult) => Promise<void>;
  onExportToKnowledge: (data: MindMapData) => Promise<void>;
}

export function CaseEditor({ data, fileName, onSave, onExportToKnowledge }: CaseEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<EditorBridge | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasData, setHasData] = useState(data !== null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize bridge and iframe
  useEffect(() => {
    if (!iframeRef.current) return;
    const bridge = createEditorBridge(iframeRef.current);
    bridgeRef.current = bridge;

    bridge.onDirty((d: boolean) => setDirty(d));
    bridge.onSaveRequested(() => handleSave());
    bridge.onError((msg: string) => setErrorMsg(msg));

    bridge.waitReady(10000).then(() => {
      if (data) {
        bridge.init(data, fileName ?? "未命名");
        setHasData(true);
      } else {
        bridge.init(null, "");
      }
      setLoading(false);
    }).catch(() => {
      setErrorMsg("脑图加载失败，点击重试");
      setLoading(false);
    });

    return () => {
      bridge.destroy();
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      a.download = (fileName ?? "usecase") + ".xmind";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg("导出失败");
    }
  }, [fileName]);

  const handleExportKnowledge = useCallback(async () => {
    if (!bridgeRef.current) return;
    try {
      const json = await bridgeRef.current.getData();
      await onExportToKnowledge(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "反哺失败";
      setErrorMsg(msg);
    }
  }, [onExportToKnowledge]);

  // File import
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const doImport = useCallback(async (file: File, mode: "replace" | "merge") => {
    if (!bridgeRef.current) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      if (ext === "xmind") {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        if (mode === "replace") {
          bridgeRef.current.init(null, "");
          await bridgeRef.current.waitReady(5000);
        }
        bridgeRef.current.importXmindFile(base64);
      } else {
        const text = await file.text();
        const parsed = parseTestcaseMarkdown(text);
        if (!parsed.tree) {
          setErrorMsg("文件解析失败");
          return;
        }
        const mindMapData = modulesToMindMap(parsed.tree, "测试用例");
        if (mode === "merge" && hasData) {
          const current = await bridgeRef.current.getData();
          current.children.push(...mindMapData.children);
          bridgeRef.current.init(current, file.name);
        } else {
          bridgeRef.current.init(mindMapData, file.name);
        }
      }
      setHasData(true);
      setDirty(true);
    } catch {
      setErrorMsg("文件导入失败");
    }
  }, [hasData]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bridgeRef.current) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xmind" && ext !== "md") {
      setErrorMsg("仅支持 .xmind 和 .md 文件");
      e.target.value = "";
      return;
    }

    if (!hasData) {
      await doImport(file, "replace");
    } else {
      const choice = window.confirm(
        "当前已有数据。\n\n「确定」= 替换\n「取消」= 合并到根节点下"
      );
      if (choice) {
        await doImport(file, "replace");
      } else if (choice === false) {
        await doImport(file, "merge");
      }
    }

    e.target.value = "";
  }, [hasData, doImport]);

  // Paste Markdown
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !bridgeRef.current) return;
    const parsed = parseTestcaseMarkdown(text);
    if (!parsed.tree || parsed.tree.length === 0) return;

    e.preventDefault();
    const mindMapData = modulesToMindMap(parsed.tree, "测试用例");
    if (!hasData) {
      bridgeRef.current.init(mindMapData, "剪贴板.md");
      setHasData(true);
    } else {
      bridgeRef.current.getData().then((current) => {
        current.children.push(...mindMapData.children);
        bridgeRef.current!.init(current, fileName ?? "未命名");
        setDirty(true);
      });
    }
  }, [hasData, fileName]);

  // Retry loading
  const handleRetry = useCallback(() => {
    setErrorMsg(null);
    setLoading(true);
    if (bridgeRef.current && iframeRef.current && iframeRef.current.contentWindow) {
      bridgeRef.current.init(data, fileName ?? "未命名");
      setTimeout(() => setLoading(false), 2000);
    } else {
      window.location.reload();
    }
  }, [data, fileName]);

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

  return (
    <div className="flex flex-col flex-1" onPaste={handlePaste} tabIndex={-1}>
      {/* Toolbar */}
      <div className="bg-card rounded-xl shadow-sm px-4 py-2 mb-2 flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-1">
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
          <button
            onClick={handleImportClick}
            className="px-3 py-1.5 rounded-lg text-sm hover:bg-muted flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            导入
          </button>
          <button
            onClick={handleExportKnowledge}
            disabled={!hasData}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${
              hasData
                ? "hover:bg-muted"
                : "text-muted-foreground cursor-not-allowed"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            反哺知识库
          </button>
        </div>
        {fileName && (
          <span className="text-xs text-muted-foreground">{fileName}{dirty ? " *" : ""}</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xmind,.md"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Status bar */}
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-4 flex-shrink-0">
        <span>{dirty ? "⏳ 未保存" : "✅ 已保存"}</span>
        {errorMsg && (
          <span className="text-red-500">{errorMsg}</span>
        )}
      </div>

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

        {errorMsg && errorMsg.includes("重试") && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">{errorMsg}</p>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
              >
                点击重试
              </button>
            </div>
          </div>
        )}

        {!data && !loading && !errorMsg && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center max-w-sm">
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="text-base font-medium mb-2">导入用例开始编辑</p>
              <p className="text-sm text-muted-foreground mb-4">
                拖拽 .xmind / .md 文件到此处<br />或点击选择文件
              </p>
              <button
                onClick={handleImportClick}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm mb-2"
              >
                选择文件
              </button>
              <p className="text-xs text-muted-foreground">也支持从剪贴板粘贴 Markdown</p>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src="/editor/mind-map.html"
          className="w-full h-full border-0"
          title="用例脑图编辑器"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
