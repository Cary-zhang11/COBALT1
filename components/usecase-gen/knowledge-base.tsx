"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Loader2, Download, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { UploadModal } from "./shared/upload-modal";
import { FilePreviewModal } from "./shared/file-preview";

const BUSINESS_TYPES = ["C1C", "C1B", "C2C", "C2B", "数科", "车小妹"] as const;

interface KnowledgeItem {
  id: string;
  title: string;
  businessType: string | null;
  type: string;
  refCount: number;
  createdAt: string;
  updatedAt: string;
  user?: { name: string };
}

interface HistoryItem {
  id: string;
  req: string;
  createdAt: string;
  totalCases: number;
  qualityScore: number;
  modules: number;
  userName: string;
  mdFileName: string;
  businessType: string | null;
}

const MAIN_TABS = ["业务知识", "历史用例"];
const HISTORY_SUB_TABS = ["平台生成", "手动上传"];

export function KnowledgeBase() {
  const [mainTab, setMainTab] = useState(0);
  const [historySubTab, setHistorySubTab] = useState(0);
  const [search, setSearch] = useState("");
  const [businessTypeFilter, setBusinessTypeFilter] = useState("");

  // 预览/编辑模态框（业务知识 & 手动上传历史）
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");

  // 平台生成文件预览（复用 FilePreviewModal）
  const [platformPreviewFile, setPlatformPreviewFile] = useState<string | null>(null);
  const [platformPreviewTaskId, setPlatformPreviewTaskId] = useState<string | null>(null);

  // 上传弹窗
  const [showUpload, setShowUpload] = useState(false);
  const [uploadContext, setUploadContext] = useState<"knowledge" | "history_uploaded">("knowledge");

  const queryClient = useQueryClient();

  // ---- Queries ----

  // 业务知识列表
  const { data: kbData, isLoading: kbLoading } = useQuery<{ items: KnowledgeItem[]; total: number }>({
    queryKey: ["knowledge", { type: "knowledge", businessType: businessTypeFilter, search }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("type", "knowledge");
      if (search) params.set("search", search);
      if (businessTypeFilter) params.set("businessType", businessTypeFilter);
      return fetch(`/api/knowledge?${params}`).then((r) => r.json());
    },
    enabled: mainTab === 0,
  });

  // 手动上传历史列表
  const { data: uploadedData, isLoading: uploadedLoading } = useQuery<{ items: KnowledgeItem[]; total: number }>({
    queryKey: ["knowledge", { type: "history_uploaded", businessType: businessTypeFilter, search }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("type", "history_uploaded");
      if (search) params.set("search", search);
      if (businessTypeFilter) params.set("businessType", businessTypeFilter);
      return fetch(`/api/knowledge?${params}`).then((r) => r.json());
    },
    enabled: mainTab === 1 && historySubTab === 1,
  });

  // 平台生成历史
  const { data: historyData, isLoading: historyLoading } = useQuery<{ items: HistoryItem[]; total: number }>({
    queryKey: ["knowledge-history", { businessType: businessTypeFilter, search }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (businessTypeFilter) params.set("businessType", businessTypeFilter);
      return fetch(`/api/knowledge/history?${params}`).then((r) => r.json());
    },
    enabled: mainTab === 1 && historySubTab === 0,
  });

  // ---- Mutations ----

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  const assignBusinessTypeMutation = useMutation({
    mutationFn: ({ taskId, bt }: { taskId: string; bt: string }) =>
      fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType: bt }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-history"] });
    },
  });

  const saveEditMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      fetch(`/api/knowledge/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setEditMode(false);
      setPreviewContent(editContent);
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  // ---- Preview helpers ----

  async function openKnowledgePreview(id: string) {
    setPreviewId(id);
    setEditMode(false);
    setPreviewContent(null);
    try {
      const metaRes = await fetch(`/api/knowledge/${id}`);
      const meta = await metaRes.json();
      setPreviewTitle(meta.title || "");
      const contentRes = await fetch(`/api/knowledge/${id}/download`);
      const text = await contentRes.text();
      setPreviewContent(text);
    } catch {
      setPreviewContent("加载失败");
    }
  }

  function closePreview() {
    setPreviewId(null);
    setPreviewContent(null);
    setEditMode(false);
    setEditContent("");
  }

  function enterEditMode() {
    if (previewContent !== null) {
      setEditContent(previewContent);
      setEditMode(true);
    }
  }

  // ---- Render helpers ----

  function BusinessTypeBadge({ type }: { type: string | null }) {
    if (!type) return <span className="text-xs text-muted-foreground">未分类</span>;
    return (
      <span className="text-xs bg-muted text-muted-foreground px-1.5 rounded">{type}</span>
    );
  }

  function renderKnowledgeItem(item: KnowledgeItem) {
    return (
      <div key={item.id} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
            </span>
            <BusinessTypeBadge type={item.businessType} />
          </div>
        </div>
        <div className="text-center flex-shrink-0">
          <p className="text-lg font-bold text-cyan-500">{item.refCount}</p>
          <p className="text-xs text-muted-foreground">引用次数</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openKnowledgePreview(item.id)}
            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30"
          >
            预览
          </button>
          <button
            onClick={() => window.open(`/api/knowledge/${item.id}/download?download=1`, "_blank")}
            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30 flex items-center gap-1"
          >
            <Download className="w-3 h-3" />下载
          </button>
          <button
            onClick={() => deleteMutation.mutate(item.id)}
            className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50"
          >
            删除
          </button>
        </div>
      </div>
    );
  }

  function renderPlatformHistoryItem(item: HistoryItem) {
    return (
      <div key={item.id} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.mdFileName}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span>{item.createdAt}</span>
            <span>{item.userName}</span>
            <span>{item.totalCases} 用例</span>
            <span>质量分 {item.qualityScore}</span>
            <span>{item.modules} 模块</span>
            <BusinessTypeBadge type={item.businessType} />
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => {
              setPlatformPreviewFile(item.mdFileName);
              setPlatformPreviewTaskId(item.id);
            }}
            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30"
          >
            预览
          </button>
          <button
            onClick={() => window.open(`/api/tasks/${item.id}/download?file=${encodeURIComponent(item.mdFileName)}`, "_blank")}
            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30 flex items-center gap-1"
          >
            <Download className="w-3 h-3" />下载
          </button>
          {/* 分配业务类型下拉 */}
          <div className="relative group">
            <button className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30 flex items-center gap-1">
              分配类型 <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg p-1 hidden group-hover:block z-10 min-w-[80px]">
              {BUSINESS_TYPES.map((bt) => (
                <button
                  key={bt}
                  onClick={() => assignBusinessTypeMutation.mutate({ taskId: item.id, bt })}
                  className={`block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted whitespace-nowrap ${
                    item.businessType === bt ? "text-primary font-medium" : ""
                  }`}
                >
                  {bt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Filter sidebar ----

  const filterOptionsForKnowledge = ["全部", ...BUSINESS_TYPES];
  const filterOptionsForHistoryPlatform = ["全部", ...BUSINESS_TYPES, "unclassified"];

  function renderFilter(options: string[]) {
    return (
      <div className="bg-card rounded-xl shadow-sm p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">业务类型</p>
        <div className="space-y-1">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="businessType"
                checked={businessTypeFilter === opt || (opt === "全部" && businessTypeFilter === "")}
                onChange={() => setBusinessTypeFilter(opt === "全部" ? "" : opt)}
                className="accent-cyan-500 w-3 h-3"
              />
              <span className="text-xs">{opt === "unclassified" ? "未分类" : opt}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  // ---- Main render ----

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Main Tab bar */}
      <div className="bg-card rounded-xl shadow-sm p-1 flex gap-1 mb-4 w-fit">
        {MAIN_TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => { setMainTab(i); setBusinessTypeFilter(""); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mainTab === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Left sidebar — filters */}
        <div className="w-48 flex-shrink-0 space-y-3">
          <div className="bg-card rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">搜索</p>
            <input
              type="text"
              placeholder="关键词..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {mainTab === 0 && renderFilter(filterOptionsForKnowledge)}
          {mainTab === 1 && historySubTab === 0 && renderFilter(filterOptionsForHistoryPlatform)}
          {mainTab === 1 && historySubTab === 1 && renderFilter(filterOptionsForKnowledge)}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {/* 业务知识 Tab */}
          {mainTab === 0 && (
            <div>
              {kbLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <>
                  <div className="space-y-2">
                    {(kbData?.items || []).map(renderKnowledgeItem)}
                    {kbData?.items.length === 0 && (
                      <p className="text-center text-muted-foreground py-8 text-sm">暂无业务知识</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setUploadContext("knowledge"); setShowUpload(true); }}
                    className="mt-4 w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:border-cyan-500 hover:text-cyan-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />上传 md 文件
                  </button>
                </>
              )}
            </div>
          )}

          {/* 历史用例 Tab */}
          {mainTab === 1 && (
            <div>
              {/* Sub-tabs */}
              <div className="bg-card rounded-xl shadow-sm p-1 flex gap-1 mb-4 w-fit">
                {HISTORY_SUB_TABS.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { setHistorySubTab(i); setBusinessTypeFilter(""); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      historySubTab === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* 平台生成 */}
              {historySubTab === 0 && (
                <div>
                  {historyLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
                  ) : (
                    <div className="space-y-2">
                      {(historyData?.items || []).map(renderPlatformHistoryItem)}
                      {historyData?.items.length === 0 && (
                        <p className="text-center text-muted-foreground py-8 text-sm">暂无平台生成的用例</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 手动上传 */}
              {historySubTab === 1 && (
                <div>
                  {uploadedLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {(uploadedData?.items || []).map(renderKnowledgeItem)}
                        {uploadedData?.items.length === 0 && (
                          <p className="text-center text-muted-foreground py-8 text-sm">暂无手动上传的用例</p>
                        )}
                      </div>
                      <button
                        onClick={() => { setUploadContext("history_uploaded"); setShowUpload(true); }}
                        className="mt-4 w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:border-cyan-500 hover:text-cyan-500 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />上传 md 文件
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview/Edit Modal (knowledge & history_uploaded) */}
      {previewId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closePreview(); }}
        >
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-sm truncate pr-4">{previewTitle}</h3>
              <div className="flex items-center gap-2">
                {!editMode && (
                  <button onClick={enterEditMode} className="text-xs border border-border px-2.5 py-1 rounded-lg hover:bg-muted">
                    编辑
                  </button>
                )}
                <button onClick={closePreview} className="p-1 rounded-lg hover:bg-muted">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {editMode ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full min-h-[300px] border border-border rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              ) : (
                previewContent !== null ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{previewContent}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-3 border-t">
              {editMode ? (
                <>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => saveEditMutation.mutate({ id: previewId, content: editContent })}
                    disabled={saveEditMutation.isPending}
                    className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-40"
                  >
                    {saveEditMutation.isPending ? "保存中..." : "保存"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={closePreview} className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60">
                    关闭
                  </button>
                  <button
                    onClick={() => window.open(`/api/knowledge/${previewId}/download?download=1`, "_blank")}
                    className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:bg-muted flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />下载
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Platform-generated file preview (reuses existing FilePreviewModal) */}
      <FilePreviewModal
        open={platformPreviewFile !== null && platformPreviewTaskId !== null}
        onClose={() => { setPlatformPreviewFile(null); setPlatformPreviewTaskId(null); }}
        fileName={platformPreviewFile || ""}
        taskId={platformPreviewTaskId}
      />

      {/* Upload modal (shared between knowledge & history_uploaded) */}
      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        context={uploadContext}
      />
    </div>
  );
}
