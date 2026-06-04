"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Download, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { UploadModal } from "./shared/upload-modal";
import { FilePreviewModal } from "./shared/file-preview";

const BUSINESS_TYPES = ["C1C", "C1B", "C2C", "C2B", "数科", "车小妹"] as const;
const MAIN_TABS = ["业务知识", "历史用例"] as const;
const FILTER_OPTIONS = ["全部", ...BUSINESS_TYPES, "unclassified"] as const;
const KB_LIST_PAGE_SIZE = 20;

const ACTION_BTN =
  "inline-flex items-center justify-center h-7 px-2.5 text-xs font-medium leading-none rounded-md whitespace-nowrap shrink-0 border transition-colors";

/** 历史用例行：预览 | 下载 | 分配类型/删除 三列左对齐（列宽贴按钮，间距与原先 flex gap-1.5 接近） */
const ROW_ACTION_GRID =
  "grid grid-cols-[2.875rem_3.625rem_5rem] items-center gap-x-1.5 flex-shrink-0 justify-items-start";

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
  refCount: number;
}

function ActionButton({
  children,
  onClick,
  variant = "ghost",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "danger" | "soft";
  className?: string;
}) {
  const styles = {
    ghost: "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    danger: "border-red-200 text-red-600 hover:bg-red-50",
    soft: "border-transparent bg-primary/10 text-primary hover:bg-primary/20",
  };
  return (
    <button type="button" onClick={onClick} className={`${ACTION_BTN} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

function SourceBadge({ variant }: { variant: "platform" | "uploaded" }) {
  if (variant === "platform") {
    return (
      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium shrink-0">
        平台生成
      </span>
    );
  }
  return (
    <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-medium shrink-0">
      手动上传
    </span>
  );
}

function BusinessTypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-xs text-muted-foreground shrink-0">未分类</span>;
  return (
    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">{type}</span>
  );
}

function RefCountBadge({ count }: { count: number }) {
  return (
    <span className="text-xs text-cyan-700 bg-cyan-50 border border-cyan-100 px-1.5 py-0.5 rounded tabular-nums shrink-0">
      引用 {count}
    </span>
  );
}

function ListPaginationBar({
  page,
  totalPages,
  total,
  pageItemCount,
  onPrev,
  onNext,
  disabled,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageItemCount: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}) {
  if (totalPages <= 1 && page <= 1) return null;

  return (
    <div className="px-4 py-2.5 border-t border-border/60 bg-muted/10 flex items-center justify-between gap-3 shrink-0 text-xs text-muted-foreground">
      <span className="tabular-nums">
        第 {page} / {totalPages} 页
        {total > 0 && (
          <span className="text-muted-foreground/80">
            {" "}
            · 本页 {pageItemCount} 条 · 共 {total} 条
          </span>
        )}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1 || disabled}
          onClick={onPrev}
          className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-muted/60 disabled:opacity-40 disabled:pointer-events-none"
        >
          上一页
        </button>
        <button
          type="button"
          disabled={page >= totalPages || disabled}
          onClick={onNext}
          className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-muted/60 disabled:opacity-40 disabled:pointer-events-none"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

function KnowledgeListRow({
  title,
  meta,
  refCount,
  badge,
  actions,
}: {
  title: string;
  meta: string;
  refCount: number;
  badge?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 min-h-[52px] hover:bg-muted/30 transition-colors border-b border-border/60 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate max-w-full">{title}</p>
          {badge}
          <RefCountBadge count={refCount} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{meta}</p>
      </div>
      <div className={ROW_ACTION_GRID}>{actions}</div>
    </div>
  );
}

export function KnowledgeBase() {
  const [mainTab, setMainTab] = useState(0);
  const [search, setSearch] = useState("");
  const [businessTypeFilter, setBusinessTypeFilter] = useState("");

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");

  const [platformPreviewFile, setPlatformPreviewFile] = useState<string | null>(null);
  const [platformPreviewTaskId, setPlatformPreviewTaskId] = useState<string | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadContext, setUploadContext] = useState<"knowledge" | "history_uploaded">("knowledge");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const queryClient = useQueryClient();

  useEffect(() => {
    setHistoryPage(1);
  }, [search, businessTypeFilter, mainTab]);

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

  const { data: uploadedData, isLoading: uploadedLoading, isFetching: uploadedFetching } = useQuery<{
    items: KnowledgeItem[];
    total: number;
  }>({
    queryKey: ["knowledge", { type: "history_uploaded", businessType: businessTypeFilter, search, historyPage }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("type", "history_uploaded");
      params.set("page", String(historyPage));
      params.set("pageSize", String(KB_LIST_PAGE_SIZE));
      if (search) params.set("search", search);
      if (businessTypeFilter) params.set("businessType", businessTypeFilter);
      return fetch(`/api/knowledge?${params}`).then((r) => r.json());
    },
    enabled: mainTab === 1,
    placeholderData: (prev) => prev,
  });

  const { data: historyData, isLoading: historyLoading, isFetching: historyFetching } = useQuery<{
    items: HistoryItem[];
    total: number;
  }>({
    queryKey: ["knowledge-history", { businessType: businessTypeFilter, search, historyPage }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(historyPage));
      params.set("pageSize", String(KB_LIST_PAGE_SIZE));
      if (search) params.set("search", search);
      if (businessTypeFilter) params.set("businessType", businessTypeFilter);
      return fetch(`/api/knowledge/history?${params}`).then((r) => r.json());
    },
    enabled: mainTab === 1,
    placeholderData: (prev) => prev,
  });

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

  function openUpload() {
    setUploadContext(mainTab === 0 ? "knowledge" : "history_uploaded");
    setShowUpload(true);
  }

  function filterSummary() {
    if (!businessTypeFilter) return "全部业务类型";
    if (businessTypeFilter === "unclassified") return "未分类";
    return businessTypeFilter;
  }

  // 点击外部关闭分配类型下拉
  useEffect(() => {
    if (!openDropdownId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-dropdown]")) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdownId]);

  const platformItems = historyData?.items ?? [];
  const uploadedItems = uploadedData?.items ?? [];
  const platformTotal = historyData?.total ?? 0;
  const uploadedTotal = uploadedData?.total ?? 0;
  const historyPageItemCount = platformItems.length + uploadedItems.length;
  const historyTotal = platformTotal + uploadedTotal;
  const historyTotalPages = Math.max(
    1,
    Math.ceil(platformTotal / KB_LIST_PAGE_SIZE),
    Math.ceil(uploadedTotal / KB_LIST_PAGE_SIZE),
  );
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

  const knowledgeCount = kbData?.total ?? kbData?.items?.length ?? 0;

  const listTotal = mainTab === 0 ? knowledgeCount : historyTotal;
  const listMeta =
    mainTab === 0
      ? filterSummary()
      : `${filterSummary()} · 平台 ${platformTotal} · 手动 ${uploadedTotal}`;

  const isLoading = mainTab === 0 ? kbLoading : historyLoading || uploadedLoading;
  const isEmpty =
    mainTab === 0
      ? !kbLoading && (kbData?.items?.length ?? 0) === 0
      : !historyLoading &&
        !uploadedLoading &&
        platformTotal === 0 &&
        uploadedTotal === 0;

  const uploadLabel = mainTab === 0 ? "上传知识" : "上传范文";
  const emptyUploadLabel = mainTab === 0 ? "上传业务知识文档" : "上传历史用例范文";

  function renderKnowledgeActions(item: KnowledgeItem) {
    return (
      <>
        <ActionButton onClick={() => openKnowledgePreview(item.id)} variant="soft">
          预览
        </ActionButton>
        <ActionButton
          onClick={() => window.open(`/api/knowledge/${item.id}/download?download=1`, "_blank")}
          className="gap-1"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          下载
        </ActionButton>
        <ActionButton
          onClick={() => deleteMutation.mutate(item.id)}
          variant="danger"
          className="w-full justify-start"
        >
          删除
        </ActionButton>
      </>
    );
  }

  function renderListBody() {
    if (isLoading) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground mb-3">暂无内容</p>
          <button
            type="button"
            onClick={openUpload}
            className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            {emptyUploadLabel}
          </button>
          <p className="text-xs text-muted-foreground mt-3">支持 .md · 单文件 ≤ 5MB</p>
        </div>
      );
    }

    if (mainTab === 0) {
      return (kbData?.items || []).map((item) => (
        <KnowledgeListRow
          key={item.id}
          title={item.title}
          meta={`更新于 ${new Date(item.updatedAt).toLocaleDateString("zh-CN")}`}
          refCount={item.refCount}
          badge={<BusinessTypeBadge type={item.businessType} />}
          actions={renderKnowledgeActions(item)}
        />
      ));
    }

    return (
      <>
        {platformItems.map((item) => (
          <KnowledgeListRow
            key={`platform-${item.id}`}
            title={item.mdFileName}
            meta={[item.createdAt, item.userName, `${item.totalCases} 用例`, `质量 ${item.qualityScore}`, `${item.modules} 模块`]
              .filter(Boolean)
              .join(" · ")}
            refCount={item.refCount || 0}
            badge={
              <>
                <SourceBadge variant="platform" />
                <BusinessTypeBadge type={item.businessType} />
              </>
            }
            actions={
              <>
                <ActionButton
                  variant="soft"
                  onClick={() => {
                    setPlatformPreviewFile(item.mdFileName);
                    setPlatformPreviewTaskId(item.id);
                  }}
                >
                  预览
                </ActionButton>
                <ActionButton
                  onClick={() =>
                    window.open(
                      `/api/tasks/${item.id}/download?file=${encodeURIComponent(item.mdFileName)}`,
                      "_blank"
                    )
                  }
                  className="gap-1"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  下载
                </ActionButton>
                <div className="relative w-full min-w-0" data-dropdown>
                  <ActionButton
                    className="gap-0.5 w-full justify-between px-2"
                    onClick={() => setOpenDropdownId(openDropdownId === item.id ? null : item.id)}
                  >
                    分配类型
                    <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${openDropdownId === item.id ? "rotate-180" : ""}`} />
                  </ActionButton>
                  {openDropdownId === item.id && (
                    <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-20 min-w-[80px]">
                      {BUSINESS_TYPES.map((bt) => (
                        <button
                          key={bt}
                          type="button"
                          onClick={() => {
                            assignBusinessTypeMutation.mutate({ taskId: item.id, bt });
                            setOpenDropdownId(null);
                          }}
                          className={`block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted whitespace-nowrap ${
                            item.businessType === bt ? "text-primary font-medium" : ""
                          }`}
                        >
                          {bt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            }
          />
        ))}
        {uploadedItems.map((item) => (
          <KnowledgeListRow
            key={`uploaded-${item.id}`}
            title={item.title}
            meta={`更新于 ${new Date(item.updatedAt).toLocaleDateString("zh-CN")}`}
            refCount={item.refCount}
            badge={
              <>
                <SourceBadge variant="uploaded" />
                <BusinessTypeBadge type={item.businessType} />
              </>
            }
            actions={renderKnowledgeActions(item)}
          />
        ))}
      </>
    );
  }

  return (
    <div data-testid="knowledge-base">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">知识库管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          业务知识文档与历史用例范文
        </p>
      </div>

      <div className="flex gap-5 items-start">
        <aside className="w-52 flex-shrink-0 sticky top-6 self-start z-10">
          <div className="bg-card rounded-xl border border-border/60 p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">搜索</p>
              <input
                type="text"
                placeholder="标题 / 文件名..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">业务类型</p>
              <div className="space-y-1">
                {FILTER_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input
                      type="radio"
                      name="kb-business-type"
                      checked={businessTypeFilter === opt || (opt === "全部" && businessTypeFilter === "")}
                      onChange={() => setBusinessTypeFilter(opt === "全部" ? "" : opt)}
                      className="accent-cyan-500 w-3.5 h-3.5"
                    />
                    <span className="text-sm">{opt === "unclassified" ? "未分类" : opt}</span>
                  </label>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug pt-1 border-t border-border/50">
              未分类：业务类型为空的条目（两 Tab 均有）
            </p>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="bg-card rounded-xl border border-border/60 shadow-sm">
            <div className="px-4 flex items-center justify-between gap-4 border-b border-border/60 bg-muted/20 min-h-[48px] h-12 box-border">
              <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg">
                {MAIN_TABS.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setMainTab(i);
                      setBusinessTypeFilter("");
                    }}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      mainTab === i
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-xs text-muted-foreground flex items-center gap-2 min-w-0">
                  <span className="whitespace-nowrap tabular-nums">
                    共 <strong className="text-foreground font-semibold">{listTotal}</strong> 条
                  </span>
                  <span className="text-muted-foreground/50">|</span>
                  <span className="truncate max-w-[220px]">{listMeta}</span>
                </div>
                <button
                  type="button"
                  onClick={openUpload}
                  title="打开上传弹窗 · 仅 .md"
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-primary text-primary-foreground shadow-sm shrink-0 whitespace-nowrap hover:bg-primary/90"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden />
                  {uploadLabel}
                </button>
              </div>
            </div>
            {renderListBody()}
            {mainTab === 1 && (
              <ListPaginationBar
                page={safeHistoryPage}
                totalPages={historyTotalPages}
                total={historyTotal}
                pageItemCount={historyPageItemCount}
                disabled={historyLoading || uploadedLoading || historyFetching || uploadedFetching}
                onPrev={() => setHistoryPage((p) => Math.max(1, p - 1))}
                onNext={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
              />
            )}
          </div>
        </div>
      </div>

      {previewId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePreview();
          }}
        >
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-sm truncate pr-4">{previewTitle}</h3>
              <div className="flex items-center gap-2">
                {!editMode && (
                  <button
                    type="button"
                    onClick={enterEditMode}
                    className="text-xs border border-border px-2.5 py-1 rounded-lg hover:bg-muted"
                  >
                    编辑
                  </button>
                )}
                <button type="button" onClick={closePreview} className="p-1 rounded-lg hover:bg-muted">
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {editMode ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full min-h-[300px] border border-border rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              ) : previewContent !== null ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{previewContent}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-3 border-t">
              {editMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEditMutation.mutate({ id: previewId, content: editContent })}
                    disabled={saveEditMutation.isPending}
                    className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-40"
                  >
                    {saveEditMutation.isPending ? "保存中..." : "保存"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={closePreview}
                    className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/60"
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`/api/knowledge/${previewId}/download?download=1`, "_blank")}
                    className="px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:bg-muted flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    下载
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <FilePreviewModal
        open={platformPreviewFile !== null && platformPreviewTaskId !== null}
        onClose={() => {
          setPlatformPreviewFile(null);
          setPlatformPreviewTaskId(null);
        }}
        fileName={platformPreviewFile || ""}
        taskId={platformPreviewTaskId}
      />

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} context={uploadContext} />
    </div>
  );
}
