"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const BUSINESS_TYPES = ["C1C", "C1B", "C2C", "C2B", "数科", "车小妹"] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  context: "knowledge" | "history_uploaded";
}

export function UploadModal({ open, onClose, context }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const businessTypeRequired = context === "history_uploaded";

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || file.name.replace(/\.md$/i, ""));
      formData.append("type", context === "history_uploaded" ? "history_uploaded" : "knowledge");
      if (businessType) formData.append("businessType", businessType);
      const res = await fetch("/api/knowledge", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      reset();
      onClose();
    },
  });

  function reset() {
    setFile(null);
    setTitle("");
    setBusinessType("");
    setDragOver(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".md")) return;
    if (f.size > MAX_FILE_SIZE) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.md$/i, ""));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".md")) return;
    if (f.size > MAX_FILE_SIZE) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.md$/i, ""));
  }

  function canSubmit() {
    if (!file) return false;
    if (businessTypeRequired && !businessType) return false;
    return true;
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          reset();
          onClose();
        }
      }}
    >
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">上传 md 文件</h3>
          <button
            onClick={() => { reset(); onClose(); }}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* File drop zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center mb-4 transition-colors cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".md"
            className="hidden"
            onChange={handleFileChange}
          />
          {file ? (
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="text-xs text-red-500 mt-1 hover:underline"
              >
                移除
              </button>
            </div>
          ) : (
            <div>
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">拖拽或点击选择 .md 文件</p>
              <p className="text-xs text-muted-foreground mt-1">仅支持 .md，最大 5MB</p>
            </div>
          )}
        </div>

        {/* Title */}
        <label className="block text-sm font-medium mb-1">标题</label>
        <input
          type="text"
          placeholder="自动填充文件名"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />

        {/* Business type */}
        <label className="block text-sm font-medium mb-1">
          业务类型
          {businessTypeRequired && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <select
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">请选择</option>
          {BUSINESS_TYPES.map((bt) => (
            <option key={bt} value={bt}>{bt}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mb-4">
          {businessTypeRequired
            ? "手动上传历史必须选择业务类型"
            : "业务知识 — 可选"}
        </p>

        {/* Footer */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => { reset(); onClose(); }}
            className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60"
          >
            取消
          </button>
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!canSubmit() || uploadMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-40 flex items-center gap-2"
          >
            {uploadMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            上传
          </button>
        </div>

        {uploadMutation.error && (
          <p className="text-red-500 text-xs mt-2">
            {uploadMutation.error instanceof Error ? uploadMutation.error.message : "上传失败"}
          </p>
        )}
      </div>
    </div>
  );
}
