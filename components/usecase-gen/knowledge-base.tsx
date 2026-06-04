"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { FilePreviewModal } from "./shared/file-preview";

interface KnowledgeItem {
  id: string;
  title: string;
  tags: string[];
  refCount: number;
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
}

const TABS = ["业务知识", "历史用例"];

export function KnowledgeBase() {
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const queryClient = useQueryClient();

  // Business knowledge query
  const { data: kbData, isLoading: kbLoading } = useQuery<{ items: KnowledgeItem[]; total: number }>({
    queryKey: ["knowledge", search, selectedTag],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedTag) params.set("tag", selectedTag);
      return fetch(`/api/knowledge?${params}`).then((r) => r.json());
    },
    enabled: tab === 0,
  });

  // History query
  const { data: historyData, isLoading: historyLoading } = useQuery<{ items: HistoryItem[]; total: number }>({
    queryKey: ["knowledge-history", search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      return fetch(`/api/knowledge/history?${params}`).then((r) => r.json());
    },
    enabled: tab === 1,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (body: { title: string; content: string; tags: string[] }) =>
      fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      setShowAddModal(false);
      setNewTitle("");
      setNewContent("");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
  });

  const ALL_TAGS = ["认证", "支付", "订单", "商品", "通用", "冒烟", "安全", "性能"];

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Tab bar */}
      <div className="bg-card rounded-xl shadow-sm p-1 flex gap-1 mb-4 w-fit">
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Left sidebar */}
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
          {tab === 0 && (
            <div className="bg-card rounded-xl shadow-sm p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">标签筛选</p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tag"
                    checked={selectedTag === ""}
                    onChange={() => setSelectedTag("")}
                    className="accent-cyan-500 w-3 h-3"
                  />
                  <span className="text-xs">全部</span>
                </label>
                {ALL_TAGS.map((tag) => (
                  <label key={tag} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="tag"
                      checked={selectedTag === tag}
                      onChange={() => setSelectedTag(tag)}
                      className="accent-cyan-500 w-3 h-3"
                    />
                    <span className="text-xs">{tag}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {tab === 0 && (
            <div>
              {kbLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <>
                  <div className="space-y-2">
                    {(kbData?.items || []).map((item) => (
                      <div key={item.id} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.title}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                            </span>
                            {item.tags.map((tag, ti) => (
                              <button
                                key={ti}
                                onClick={() => setSelectedTag(tag)}
                                className="text-xs bg-muted text-muted-foreground px-1.5 rounded hover:text-foreground transition-colors"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="text-center flex-shrink-0">
                          <p className="text-lg font-bold text-cyan-500">{item.refCount}</p>
                          <p className="text-xs text-muted-foreground">引用次数</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/knowledge/${item.id}`);
                                const data = await res.json();
                                setPreviewTitle(data.title);
                                setPreviewContent(data.content);
                                setPreviewTaskId(null);
                              } catch { /* ignore */ }
                            }}
                            className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30"
                          >
                            预览
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(item.id)}
                            className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-4 w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:border-cyan-500 hover:text-cyan-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />添加新条目
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 1 && (
            <div>
              {historyLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {(historyData?.items || []).map((item) => (
                    <div key={item.id} className="bg-card rounded-xl shadow-sm p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.req}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{item.createdAt}</span>
                          <span>{item.userName}</span>
                          <span>{item.totalCases} 用例</span>
                          <span>质量分 {item.qualityScore}</span>
                          <span>{item.modules} 模块</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setPreviewContent(item.mdFileName);
                          setPreviewTitle("");
                          setPreviewTaskId(item.id);
                        }}
                        className="text-xs border border-border px-2.5 py-1 rounded-lg text-muted-foreground hover:border-primary/30"
                      >
                        预览
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6">
            <h3 className="font-semibold text-lg mb-4">添加业务知识</h3>
            <input
              type="text"
              placeholder="标题"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <textarea
              placeholder="Markdown 内容..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={10}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60">取消</button>
              <button
                onClick={() => createMutation.mutate({ title: newTitle, content: newContent, tags: [] })}
                disabled={!newTitle || !newContent || createMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-40"
              >
                {createMutation.isPending ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Knowledge content preview (inline modal) */}
      {previewContent !== null && !previewTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) { setPreviewContent(null); } }}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-sm truncate pr-4">{previewTitle}</h3>
              <button onClick={() => setPreviewContent(null)} className="p-1 rounded-lg hover:bg-muted">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{previewContent}</ReactMarkdown>
              </div>
            </div>
            <div className="flex justify-end px-6 py-3 border-t">
              <button onClick={() => setPreviewContent(null)} className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* History file preview */}
      <FilePreviewModal
        open={previewContent !== null && previewTaskId !== null}
        onClose={() => { setPreviewContent(null); setPreviewTaskId(null); }}
        fileName={previewContent || ""}
        taskId={previewTaskId}
      />
    </div>
  );
}
