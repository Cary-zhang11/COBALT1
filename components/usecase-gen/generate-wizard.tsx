"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useCreateTask, useExecuteTask, useResumeTask, useCancelTask } from "@/hooks/use-tasks";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useOutputScanner, maxXmindVersion, maxMdVersion, type FileInfo } from "@/hooks/use-output-scanner";
import { useTaskEvents } from "@/hooks/use-task-events";
import { ExecutionPanel } from "./shared/execution-panel";
import { OutputFiles } from "./shared/output-files";
import { AITweakPanel } from "./shared/ai-tweak-panel";
import { RatingPanel } from "./shared/rating-panel";
import { ModuleOverviewTable } from "./shared/module-overview-table";
import { WizardSection } from "./shared/wizard-section";

import type { UsecaseModule, TweakEntry } from "./shared/types";
import {
  Upload, Loader2, FileText, CheckCircle2, ArrowLeft, ChevronRight,
  Wand2, AlertTriangle, RefreshCw, BarChart3,
  Clock, Target, FileCheck, Star, Sparkles,
} from "lucide-react";

interface GenerateWizardProps {
  initialTaskId?: string | null;
  onComplete: (tree: UsecaseModule[], summary?: { totalCases: number; qualityScore: number; modules: number }) => void;
  skillId: string | undefined;
  onNavigateToTab?: (tabIndex: number) => void;
}

interface UploadedFile {
  name: string;
  path: string;
}

const STEPS = ["输入物料", "关联用例", "生成并预览"];
const BUSINESS_TYPES = ["C1C", "C1B", "C2C", "C2B", "数科", "车小妹"] as const;
const WIZARD_LIST_PAGE_SIZE = 5;

type WizardListPage = {
  items: unknown[];
  total: number;
};

function wizardListNextPage(
  lastPage: WizardListPage,
  allPages: WizardListPage[],
): number | undefined {
  const loaded = allPages.reduce((n, p) => n + (p.items?.length ?? 0), 0);
  return loaded < (lastPage.total ?? 0) ? allPages.length + 1 : undefined;
}

function WizardStickyFooter({
  children,
  compact = false,
}: {
  children: ReactNode;
  /** Step1/2：底栏紧跟内容，主区整体垂直居中 */
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "mt-6 flex-shrink-0 z-20"
          : "sticky bottom-0 z-20 mt-auto flex-shrink-0 pt-4 bg-gradient-to-t from-background from-85% via-background/80 to-transparent"
      }
    >
      <div className="bg-card rounded-xl shadow-sm border border-border/60 px-5 py-3 flex items-center gap-3">
        {children}
      </div>
    </div>
  );
}

export function GenerateWizard({
  initialTaskId, onComplete, skillId, onNavigateToTab,
}: GenerateWizardProps) {
  const createTask = useCreateTask();
  const executeTask = useExecuteTask();
  const resumeTask = useResumeTask();
  const cancelTask = useCancelTask();
  // Wizard
  const [wizStep, setWizStepState] = useState(0);
  const setWizStep = useCallback((step: number) => {
    setWizStepState(step);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [requirementText, setRequirementText] = useState("");
  const [validationMsg, setValidationMsg] = useState("");

  // ---- Step 2: 知识库关联 ----
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<Set<string>>(new Set());
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());

  // 左侧 — 业务知识筛选
  const [kbSearch, setKbSearch] = useState("");
  const [kbBusinessType, setKbBusinessType] = useState("");
  // 右侧 — 历史用例筛选
  const [historySearch, setHistorySearch] = useState("");
  const [historyBusinessType, setHistoryBusinessType] = useState("");

  // ---- 业务类型选择 ----
  const [selectedBusinessType, setSelectedBusinessType] = useState<string>("");
  const [businessTypeManuallySet, setBusinessTypeManuallySet] = useState(false);

  interface HistoryOption {
    id: string;
    displayName: string;
    sourcePath?: string;
    sourceTaskId?: string;
    mdFileName?: string;
  }

  const kbListQuery = useInfiniteQuery({
    queryKey: ["knowledge", "wizard", "knowledge", kbSearch, kbBusinessType],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("type", "knowledge");
      params.set("pageSize", String(WIZARD_LIST_PAGE_SIZE));
      params.set("page", String(pageParam));
      if (kbSearch) params.set("search", kbSearch);
      if (kbBusinessType) params.set("businessType", kbBusinessType);
      const res = await fetch(`/api/knowledge?${params}`);
      if (!res.ok) throw new Error("Failed to load knowledge");
      return res.json() as Promise<WizardListPage & { items: { id: string; title: string; businessType: string | null; updatedAt: string }[] }>;
    },
    initialPageParam: 1,
    getNextPageParam: wizardListNextPage,
  });

  const uploadedHistoryQuery = useInfiniteQuery({
    queryKey: ["knowledge", "wizard", "history_uploaded", historySearch, historyBusinessType],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("type", "history_uploaded");
      params.set("pageSize", String(WIZARD_LIST_PAGE_SIZE));
      params.set("page", String(pageParam));
      if (historySearch) params.set("search", historySearch);
      if (historyBusinessType) params.set("businessType", historyBusinessType);
      const res = await fetch(`/api/knowledge?${params}`);
      if (!res.ok) throw new Error("Failed to load uploaded history");
      return res.json() as Promise<WizardListPage & { items: { id: string; title: string; content: string }[] }>;
    },
    initialPageParam: 1,
    getNextPageParam: wizardListNextPage,
  });

  const platformHistoryQuery = useInfiniteQuery({
    queryKey: ["knowledge-history", "wizard", historySearch, historyBusinessType],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("pageSize", String(WIZARD_LIST_PAGE_SIZE));
      params.set("page", String(pageParam));
      if (historySearch) params.set("search", historySearch);
      if (historyBusinessType) params.set("businessType", historyBusinessType);
      const res = await fetch(`/api/knowledge/history?${params}`);
      if (!res.ok) throw new Error("Failed to load platform history");
      return res.json() as Promise<WizardListPage & { items: { id: string; mdFileName: string }[] }>;
    },
    initialPageParam: 1,
    getNextPageParam: wizardListNextPage,
  });

  type KbItem = { id: string; title: string; businessType: string | null; updatedAt: string };
  const kbItems = useMemo(
    () => kbListQuery.data?.pages.flatMap((p) => (p.items as KbItem[]) ?? []) ?? [],
    [kbListQuery.data],
  );
  const kbTotal = kbListQuery.data?.pages[0]?.total ?? 0;

  const historyOptions: HistoryOption[] = useMemo(() => {
    const result: HistoryOption[] = [];
    const seen = new Set<string>();
    const uploadedItems =
      uploadedHistoryQuery.data?.pages.flatMap(
        (p) => (p.items as { id: string; title: string; content: string }[]) ?? [],
      ) ?? [];
    for (const item of uploadedItems) {
      const id = `knowledge:${item.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        displayName: (item.title || "untitled") + ".md",
        sourcePath: item.content,
      });
    }
    const platformItems =
      platformHistoryQuery.data?.pages.flatMap(
        (p) => (p.items as { id: string; mdFileName: string }[]) ?? [],
      ) ?? [];
    for (const item of platformItems) {
      if (!item.mdFileName) continue;
      const id = `task:${item.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        displayName: item.mdFileName,
        sourceTaskId: item.id,
        mdFileName: item.mdFileName,
      });
    }
    return result;
  }, [uploadedHistoryQuery.data, platformHistoryQuery.data]);

  const historyTotal =
    (uploadedHistoryQuery.data?.pages[0]?.total ?? 0) +
    (platformHistoryQuery.data?.pages[0]?.total ?? 0);

  // 从已选知识条目推算 businessType
  const inferredBusinessType = useMemo(() => {
    const items = kbItems;
    for (const id of selectedKnowledgeIds) {
      const item = items.find((i) => i.id === id);
      if (item?.businessType) return item.businessType;
    }
    return null;
  }, [selectedKnowledgeIds, kbItems]);

  // 自动同步推算值到 selectedBusinessType（仅当未手选时）
  useEffect(() => {
    if (!businessTypeManuallySet) {
      setSelectedBusinessType(inferredBusinessType || "");
    }
  }, [inferredBusinessType, businessTypeManuallySet]);

  function toggleKnowledge(id: string) {
    setSelectedKnowledgeIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleHistory(id: string) {
    setSelectedHistoryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Generation
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [genStats, setGenStats] = useState<{ totalCases: number; qualityScore: number; modules: number; duration: number } | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<FileInfo[]>([]);
  const [xmindBaseline, setXmindBaseline] = useState(-1);
  const [mdBaseline, setMdBaseline] = useState<number | undefined>(undefined);

  // Internal state (previously from parent props)
  const [usecaseTree, setUsecaseTree] = useState<UsecaseModule[] | null>(null);
  const [tweakHistory, setTweakHistory] = useState<TweakEntry[]>([]);

  const preTweakTreeRef = useRef<UsecaseModule[] | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const reconciledRef = useRef(false);

  // Persist tweak entry update to DB
  const persistTweakEntry = useCallback((tid: string, round: number, updates: Partial<TweakEntry>) => {
    fetch(`/api/tasks/${tid}/tweak`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round, updates }),
    }).catch((err) => console.error("Tweak PATCH failed:", err));
  }, []);

  // Output scanner
  const scanner = useOutputScanner({
    taskId: taskId || "",
    enabled: generating && !!taskId,
    xmindBaselineVersion: xmindBaseline,
    mdBaselineVersion: mdBaseline,
    onResult: (data) => {
      const tree = data.tree as UsecaseModule[];
      const summary = data.summary;
      setUsecaseTree(tree);
      onCompleteRef.current(tree, summary);
      setGenStats({
        totalCases: summary?.totalCases || 0,
        qualityScore: summary?.qualityScore || 0,
        modules: summary?.modules || 0,
        duration: data.duration || 0,
      });
      setGenerating(false);

      // Sync tweakHistory from report (DB is source of truth)
      if (data.tweakHistory && taskId) {
        setTweakHistory(data.tweakHistory as TweakEntry[]);
      }

      // Compute tweak delta
      if (preTweakTreeRef.current && taskId) {
        const oldCases = preTweakTreeRef.current.flatMap((m) => m.cases.map((c) => c.id));
        const newCases = tree.flatMap((m) => m.cases.map((c) => c.id));
        const oldSet = new Set(oldCases);
        const newSet = new Set(newCases);
        const added = newCases.filter((id) => !oldSet.has(id)).length;
        const removed = oldCases.filter((id) => !newSet.has(id)).length;
        const modified = oldCases.filter((id) => newSet.has(id)).length;
        const summaryText = `+${added} · 修改 ${modified} · -${removed}`;

        const serverHistory = (data.tweakHistory as TweakEntry[]) || [];
        // Find round: prefer running entry, fallback to max round
        const runningEntry = serverHistory
          .filter((e: TweakEntry) => e.status === "running")
          .sort((a: TweakEntry, b: TweakEntry) => b.round - a.round)[0];
        const round = runningEntry?.round
          ?? (serverHistory.length > 0 ? Math.max(...serverHistory.map((e: TweakEntry) => e.round)) : serverHistory.length);

        setTweakHistory((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((e) => e.round === round);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], status: "done" as const, summary: summaryText };
          }
          return updated;
        });
        // PATCH summary only — no expectedStatus (server may already have marked done)
        persistTweakEntry(taskId, round, { summary: summaryText });
        preTweakTreeRef.current = null;
      }

      // Resolve any running entries still in the report (race: scanner detected
      // files before P0's markTweakEntryDone reached DB). Update local state only
      // — P0 handles the server-side update.
      const serverHistory = (data.tweakHistory as TweakEntry[]) || [];
      const unresolved = serverHistory
        .filter((e: TweakEntry) => e.status === "running")
        .sort((a: TweakEntry, b: TweakEntry) => b.round - a.round)[0];
      if (unresolved && taskId) {
        setTweakHistory((prev) =>
          prev.map((e) =>
            e.round === unresolved.round ? { ...e, status: "done" as const } : e
          )
        );
      }
    },
    onError: (msg) => {
      setGenStatus(msg);
      setGenerating(false);
      if (taskId) {
        // Only update local UI — server (P0) already wrote failed to tweakHistory
        setTweakHistory((prev) => {
          const history = [...prev];
          const runningEntry = history
            .filter((e) => e.status === "running")
            .sort((a, b) => b.round - a.round)[0];
          if (runningEntry) {
            const idx = history.findIndex((e) => e.round === runningEntry.round);
            if (idx >= 0) {
              history[idx] = { ...history[idx], status: "failed" as const };
            }
          }
          return history;
        });
      }
    },
  });

  // Parse [WF:done:xxx] from SSE logs for real-time stage progress
  const { logs: taskLogs } = useTaskEvents({
    taskId: taskId || "",
    enabled: generating && !!taskId,
  });

  const logStages = useMemo(() => {
    const s = new Set<string>();
    for (const log of taskLogs) {
      const m = log.output?.match(/\[WF:done:([^\]]+)\]/);
      if (m) s.add(m[1]);
    }
    return s;
  }, [taskLogs]);

  // Load task from initialTaskId (history selection)
  useEffect(() => {
    if (!initialTaskId) return;

    let cancelled = false;
    reconciledRef.current = false;
    (async () => {
      try {
        const reportRes = await fetch(`/api/tasks/${initialTaskId}/report`);
        if (!reportRes.ok || cancelled) return;
        const report = await reportRes.json();

        if (cancelled) return;

        if (report.tweakHistory) {
          setTweakHistory(report.tweakHistory as TweakEntry[]);
        }

        if (report.tree && report.outputFiles?.length > 0) {
          const tree = report.tree as UsecaseModule[];
          const summary = report.summary;
          const fileInfos: FileInfo[] = report.outputFiles.map(
            (f: { name: string; path: string }) => {
              let relativePath = f.name;
              try {
                const url = new URL(f.path, "http://x");
                const fileParam = url.searchParams.get("file");
                if (fileParam) relativePath = decodeURIComponent(fileParam);
              } catch { /* fallback */ }
              return { name: f.name, relativePath };
            }
          );
          if (cancelled) return;
          setUsecaseTree(tree);
          setTaskId(initialTaskId);
          setWizStep(2);
          setGenStats({
            totalCases: summary?.totalCases || 0,
            qualityScore: summary?.qualityScore || 0,
            modules: summary?.modules || 0,
            duration: (report as Record<string, unknown>).duration as number || 0,
          });
          setGenerating(false);
          setGenStatus("");
          setLoadedFiles(fileInfos);
          onCompleteRef.current(tree, summary);
        } else {
          // No tree/output yet — check task status
          const taskStatus = (report as Record<string, unknown>).status as string | undefined;
          if (taskStatus === "cancelled" || taskStatus === "failed") {
            // Task ended without output — show result page with empty state
            setTaskId(initialTaskId);
            setGenerating(false);
            setGenStatus("");
            setWizStep(2);
          } else {
            // Files not ready — start scanner polling
            if (cancelled) return;
            setTaskId(initialTaskId);
            setGenerating(true);
            setGenStatus("正在加载...");
            setWizStep(2);
          }
        }

        // P1b: If tweakHistory has a running entry, fire one reconcile fetch
        const reportTweakHistory = (report.tweakHistory as TweakEntry[]) || [];
        const hasRunning = reportTweakHistory.some((e: TweakEntry) => e.status === "running");
        if (hasRunning && !cancelled && !reconciledRef.current) {
          reconciledRef.current = true;
          try {
            const reconRes = await fetch(`/api/tasks/${initialTaskId}/report`);
            if (!reconRes.ok || cancelled) return;
            const reconReport = await reconRes.json();
            if (cancelled) return;

            // Update state from reconcile report
            const reconTree = reconReport.tree as UsecaseModule[] | null;
            const reconSummary = reconReport.summary;
            const reconFiles: FileInfo[] = (reconReport.outputFiles || []).map(
              (f: { name: string; path: string }) => {
                let relativePath = f.name;
                try {
                  const url = new URL(f.path, "http://x");
                  const fileParam = url.searchParams.get("file");
                  if (fileParam) relativePath = decodeURIComponent(fileParam);
                } catch { /* fallback */ }
                return { name: f.name, relativePath };
              }
            );
            const reconTweakHistory = (reconReport.tweakHistory as TweakEntry[]) || [];

            if (reconTree) {
              setUsecaseTree(reconTree);
              setGenStats({
                totalCases: reconSummary?.totalCases || 0,
                qualityScore: reconSummary?.qualityScore || 0,
                modules: reconSummary?.modules || 0,
                duration: (reconReport as Record<string, unknown>).duration as number || 0,
              });
              setLoadedFiles(reconFiles);
              onCompleteRef.current(reconTree, reconSummary);
            }
            if (reconTweakHistory.length > 0) {
              setTweakHistory(reconTweakHistory);
            }

            // Fallback: if still running but MD file exists, mark done locally + PATCH.
            // Only auto-resolve when task is NOT actively running — "running" means
            // the tweak is still in progress and P0 will handle it when it completes.
            const stillRunning = reconTweakHistory
              .filter((e: TweakEntry) => e.status === "running")
              .sort((a: TweakEntry, b: TweakEntry) => b.round - a.round)[0];
            const taskStatus = (reconReport as Record<string, unknown>).status as string | undefined;
            if (stillRunning && reconTree && taskStatus !== "running") {
              const currentMdVersion = maxMdVersion(reconFiles);
              if (currentMdVersion >= stillRunning.round || currentMdVersion >= 0) {
                // Local update
                setTweakHistory((prev) =>
                  prev.map((e) =>
                    e.round === stillRunning.round ? { ...e, status: "done" as const } : e
                  )
                );
                // PATCH with optimistic lock
                fetch(`/api/tasks/${initialTaskId}/tweak`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    round: stillRunning.round,
                    updates: { status: "done" },
                    expectedStatus: "running",
                  }),
                }).catch((err) => console.error("Reconcile PATCH failed:", err));
              }
            } else if (stillRunning && taskStatus === "running") {
              // Tweak in progress. Poll report until P0 marks it done.
              // Trust the DB — no scanner/file-detection needed.
              setGenerating(true);
              setGenStatus("正在微调用例...");

              const pollUntilDone = async () => {
                if (cancelled) return;
                try {
                  const res = await fetch(`/api/tasks/${initialTaskId}/report`);
                  if (!res.ok || cancelled) return;
                  const r = await res.json();
                  if (cancelled) return;

                  const rTree = r.tree as UsecaseModule[] | null;
                  if (rTree) {
                    setUsecaseTree(rTree);
                    const rFiles: FileInfo[] = (r.outputFiles || []).map(
                      (f: { name: string; path: string }) => {
                        let relativePath = f.name;
                        try {
                          const url = new URL(f.path, "http://x");
                          const fileParam = url.searchParams.get("file");
                          if (fileParam) relativePath = decodeURIComponent(fileParam);
                        } catch { /* fallback */ }
                        return { name: f.name, relativePath };
                      }
                    );
                    setLoadedFiles(rFiles);
                    const rSummary = r.summary;
                    setGenStats({
                      totalCases: rSummary?.totalCases || 0,
                      qualityScore: rSummary?.qualityScore || 0,
                      modules: rSummary?.modules || 0,
                      duration: (r as Record<string, unknown>).duration as number || 0,
                    });
                    onCompleteRef.current(rTree, rSummary);
                  }

                  const rTweakHistory = (r.tweakHistory as TweakEntry[]) || [];
                  if (rTweakHistory.length > 0) {
                    setTweakHistory(rTweakHistory);
                  }

                  const stillRunningNow = rTweakHistory.some(
                    (e: TweakEntry) => e.status === "running"
                  );
                  const taskStatusNow = (r as Record<string, unknown>).status as string;

                  if (!stillRunningNow || taskStatusNow !== "running") {
                    setGenerating(false);
                    setGenStatus("");
                    return;
                  }
                } catch { /* retry next poll */ }

                if (!cancelled) {
                  setTimeout(pollUntilDone, 3000);
                }
              };

              pollUntilDone();
            }
          } catch { /* reconcile failed silently */ }
        }
      } catch { /* fall through */ }
    })();

    return () => { cancelled = true; };
  }, [initialTaskId]);

  // Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          setUploadedFiles((prev) => [...prev, { name: file.name, path: data.filePath }]);
        }
      } catch {}
    }
  };

  const removeFile = (name: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== name));
  };

  // Start Generate
  const startGenerate = async () => {
    if (!skillId) return;
    let input = requirementText.trim();
    if (uploadedFiles.length > 0) {
      const names = uploadedFiles.map((f) => f.name).join(", ");
      input = input ? `${input}\n\n[附件: ${names}]` : `上传文件: ${names}`;
    }

    // 拼接参考文件目录说明
    const hasKnowledge = selectedKnowledgeIds.size > 0;
    const hasHistory = selectedHistoryIds.size > 0;
    if (hasKnowledge || hasHistory) {
      input += "\n\n---\n## 工作目录参考文件说明\n\n";
      input += "工作目录中除需求文档外，还包含以下参考文件，**你必须使用 Read 工具逐一读取这些文件**：\n\n";
      if (hasKnowledge) {
        input += "- **knowledge/** — 业务参考知识文档，包含业务规范、规则、流程说明。**请必须逐一读取其中的所有文件**，将其中的业务规则、术语定义、流程约束作为生成测试用例的依据。\n";
      }
      if (hasHistory) {
        input += "- **history/** — 历史优秀用例范文，作为本次生成的风格和结构参考。**请必须逐一读取其中的所有文件**，参考其用例结构、步骤粒度、优先级划分方式。\n";
      }
      input += "\n先读取所有参考文件，再基于需求文档生成测试用例。\n";
    }
    setWizStep(2);
    setGenerating(true);
    setGenStatus("正在解析需求文档...");
    setLoadedFiles([]);
    setTweakHistory([]);
    setXmindBaseline(-1);
    setMdBaseline(undefined);
    preTweakTreeRef.current = null;
    try {
      const { taskId: newTaskId } = await createTask.mutateAsync({
        skillId,
        input,
        uploadedFiles: uploadedFiles.map((f) => f.path),
        businessType: selectedBusinessType || undefined,
      });
      setTaskId(newTaskId);

      // 收集 referenceFiles
      const knowledgeItems = kbItems;
      const referenceFiles: {
        sourcePath?: string;
        sourceTaskId?: string;
        mdFileName?: string;
        subdir: string;
        destName: string;
      }[] = [];

      for (const id of Array.from(selectedKnowledgeIds)) {
        const k = knowledgeItems.find((item) => item.id === id);
        if (k?.content) {
          referenceFiles.push({
            sourcePath: k.content,
            subdir: "knowledge",
            destName: (k.title || "untitled") + ".md",
          });
        }
      }

      for (const id of Array.from(selectedHistoryIds)) {
        const h = historyOptions.find((opt) => opt.id === id);
        if (h) {
          referenceFiles.push({
            sourcePath: h.sourcePath,
            sourceTaskId: h.sourceTaskId,
            mdFileName: h.mdFileName,
            subdir: "history",
            destName: h.displayName,
          });
        }
      }

      console.log(`[wizard] sending referenceFiles:`, JSON.stringify(referenceFiles.map(r => ({ subdir: r.subdir, destName: r.destName, hasSourcePath: !!r.sourcePath, hasSourceTaskId: !!r.sourceTaskId }))));
      await executeTask.mutateAsync({ taskId: newTaskId, referenceFiles });
    } catch {
      setGenStatus("生成失败");
      setGenerating(false);
    }
  };

  const mergedOutputFiles = useMemo(() => {
    const seen = new Set<string>();
    return [...scanner.foundFiles, ...loadedFiles].filter((f) => {
      if (seen.has(f.relativePath)) return false;
      seen.add(f.relativePath);
      return true;
    });
  }, [scanner.foundFiles, loadedFiles]);

  if (!skillId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Wand2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-2">测试用例生成工具未配置</h3>
          <p className="text-sm text-muted-foreground">
            请联系管理员在工具库创建一个「测试用例生成」专用 Skill，
            并在环境变量中配置 <code className="bg-muted px-1 rounded">NEXT_PUBLIC_USECASE_SKILL_ID</code>。
          </p>
        </div>
      </div>
    );
  }

  const step3OutputCount = useMemo(
    () =>
      mergedOutputFiles.filter(
        (f) =>
          !f.name.includes("_source") &&
          !f.name.includes("archive/") &&
          (f.name.endsWith(".md") || f.name.endsWith(".xmind"))
      ).length,
    [mergedOutputFiles]
  );

  return (
    <div
      className={
        wizStep === 2
          ? "flex gap-5 items-start"
          : "flex gap-5 items-stretch min-h-[min(520px,calc(100vh-12rem))]"
      }
      data-testid="generate-wizard-root"
    >
      <div
        className={
          wizStep === 2
            ? "flex flex-1 flex-col min-w-0"
            : "flex flex-1 flex-col min-w-0 min-h-full"
        }
      >
        <div className="flex items-center gap-0 mb-6 bg-card rounded-xl shadow-sm border border-border/60 p-4 flex-shrink-0">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-0 flex-1">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all duration-300 ${
                    wizStep > i ? "bg-primary/80 text-primary-foreground" : wizStep === i ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {wizStep > i ? <CheckCircle2 className="w-4 h-4" /> : <span>{i + 1}</span>}
                </div>
                <span className={`text-sm ${wizStep >= i ? "text-primary font-medium" : "text-muted-foreground"}`}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-8 mx-2 flex-shrink-0 transition-colors duration-300 ${wizStep > i ? "bg-primary/60" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {wizStep < 2 ? (
        <div className="flex flex-1 flex-col min-h-0 w-full overflow-y-auto">
        <div className="my-auto w-full py-2">
        {wizStep === 0 && (
          <div className="space-y-4 w-full">
            <div className="bg-card rounded-xl shadow-sm border border-border/60 p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                输入需求
              </h3>
              <div
                className="border-2 border-dashed rounded-xl py-8 px-4 text-center cursor-pointer transition-all border-border hover:border-primary/30 hover:bg-primary/5"
                onClick={() => document.getElementById("wizard-file-input")?.click()}
              >
                <p className="text-xs text-muted-foreground">
                  <span className="text-primary font-medium">点击上传</span> 或拖拽文件到此处 · 支持 .docx .md .txt
                </p>
                <input id="wizard-file-input" type="file" className="hidden" multiple onChange={handleFileUpload} />
              </div>
              {uploadedFiles.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </div>
                      <button onClick={(ev) => { ev.stopPropagation(); removeFile(f.name); }} className="text-muted-foreground hover:text-red-500 flex-shrink-0 ml-2">
                        <span className="text-sm">✕</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <h4 className="text-sm font-medium mb-2 mt-4">粘贴需求文本</h4>
              <textarea
                value={requirementText}
                onChange={(e) => setRequirementText(e.target.value)}
                rows={5}
                placeholder="将需求描述、用户故事或功能说明粘贴到此处..."
                className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
              <div className="flex items-center gap-2 mt-2">
                <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${requirementText.length > 2000 ? "bg-red-100" : "bg-muted"}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${requirementText.length > 2000 ? "bg-red-500" : requirementText.length > 1000 ? "bg-amber-400" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, requirementText.length / 2000 * 100)}%` }}
                  />
                </div>
                <span className={`text-xs flex-shrink-0 ${requirementText.length > 2000 ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                  {requirementText.length} / 2000
                </span>
              </div>
            </div>

            {/* Validation message */}
            {validationMsg && (
              <p className="text-sm text-red-500 font-medium flex items-center gap-1.5 animate-in fade-in">
                <span>⚠️</span> {validationMsg}
              </p>
            )}
          </div>
        )}

        {wizStep === 1 && (
          <div className="space-y-4 w-full">
            {/* 业务类型选择 */}
            <div className="bg-card rounded-xl shadow-sm border border-border/60 p-4 flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium whitespace-nowrap">业务类型</label>
              <select
                value={businessTypeManuallySet ? selectedBusinessType : (inferredBusinessType || "auto")}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "auto") {
                    setBusinessTypeManuallySet(false);
                    setSelectedBusinessType(inferredBusinessType || "");
                  } else {
                    setBusinessTypeManuallySet(true);
                    setSelectedBusinessType(val);
                  }
                }}
                className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="auto">自动推算{inferredBusinessType ? `（${inferredBusinessType}）` : ""}</option>
                {BUSINESS_TYPES.map((bt) => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>
              {!businessTypeManuallySet && !inferredBusinessType && (
                <span className="text-xs text-muted-foreground">关联知识条目后自动推算</span>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 左侧：业务知识 */}
              <div className="bg-card rounded-xl shadow-sm border border-border/60 p-5">
                <h3 className="font-semibold mb-1 text-sm">业务知识</h3>
                <p className="text-xs text-muted-foreground mb-3">勾选本次生成需要参考的业务规范文档</p>

                {/* 搜索 + 业务类型筛选 */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="搜索..."
                    value={kbSearch}
                    onChange={(e) => setKbSearch(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <select
                    value={kbBusinessType}
                    onChange={(e) => setKbBusinessType(e.target.value)}
                    className="border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                  >
                    <option value="">全部</option>
                    {BUSINESS_TYPES.map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {kbListQuery.isLoading && kbItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">加载中...</p>
                  ) : kbItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">暂无业务知识，可前往知识库上传</p>
                  ) : (
                    kbItems.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 transition-colors ${
                          selectedKnowledgeIds.has(item.id)
                            ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedKnowledgeIds.has(item.id)}
                          onChange={() => toggleKnowledge(item.id)}
                          className="accent-cyan-500 w-3.5 h-3.5 flex-shrink-0"
                        />
                        <span className="text-sm truncate flex-1 min-w-0">{item.title}</span>
                      </label>
                    ))
                  )}
                </div>

                {kbListQuery.hasNextPage && (
                  <button
                    type="button"
                    disabled={kbListQuery.isFetchingNextPage}
                    onClick={() => kbListQuery.fetchNextPage()}
                    className="mt-2 w-full text-xs text-muted-foreground hover:text-primary py-1 transition-colors disabled:opacity-50"
                  >
                    {kbListQuery.isFetchingNextPage
                      ? "加载中..."
                      : `共 ${kbTotal} 条，加载更多 →`}
                  </button>
                )}
              </div>

              {/* 右侧：历史用例范文 */}
              <div className="bg-card rounded-xl shadow-sm border border-border/60 p-5">
                <h3 className="font-semibold mb-1 text-sm">历史用例范文</h3>
                <p className="text-xs text-muted-foreground mb-3">勾选优秀历史用例作为 few-shot 参考</p>

                {/* 搜索 + 业务类型筛选 */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="搜索..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <select
                    value={historyBusinessType}
                    onChange={(e) => setHistoryBusinessType(e.target.value)}
                    className="border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                  >
                    <option value="">全部</option>
                    {BUSINESS_TYPES.map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {(uploadedHistoryQuery.isLoading || platformHistoryQuery.isLoading) &&
                  historyOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">加载中...</p>
                  ) : historyOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">暂无历史用例</p>
                  ) : (
                    historyOptions.map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 transition-colors ${
                          selectedHistoryIds.has(opt.id)
                            ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedHistoryIds.has(opt.id)}
                          onChange={() => toggleHistory(opt.id)}
                          className="accent-cyan-500 w-3.5 h-3.5 flex-shrink-0"
                        />
                        <span className="text-sm truncate">{opt.displayName}</span>
                      </label>
                    ))
                  )}
                </div>

                {(uploadedHistoryQuery.hasNextPage || platformHistoryQuery.hasNextPage) && (
                  <button
                    type="button"
                    disabled={
                      uploadedHistoryQuery.isFetchingNextPage ||
                      platformHistoryQuery.isFetchingNextPage
                    }
                    onClick={() => {
                      if (uploadedHistoryQuery.hasNextPage) {
                        void uploadedHistoryQuery.fetchNextPage();
                      }
                      if (platformHistoryQuery.hasNextPage) {
                        void platformHistoryQuery.fetchNextPage();
                      }
                    }}
                    className="mt-2 w-full text-xs text-muted-foreground hover:text-primary py-1 transition-colors disabled:opacity-50"
                  >
                    {uploadedHistoryQuery.isFetchingNextPage ||
                    platformHistoryQuery.isFetchingNextPage
                      ? "加载中..."
                      : `共 ${historyTotal} 条，加载更多 →`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {wizStep === 0 && (
          <WizardStickyFooter compact>
            <div className="flex justify-end w-full">
              <button
                type="button"
                onClick={() => {
                  if (!uploadedFiles.length && !requirementText.trim()) {
                    setValidationMsg("请至少上传一个需求文档，或粘贴需求文本");
                    return;
                  }
                  setValidationMsg("");
                  setKbSearch("");
                  setKbBusinessType("");
                  setHistorySearch("");
                  setHistoryBusinessType("");
                  setWizStep(1);
                }}
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2"
              >
                下一步：关联用例
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </WizardStickyFooter>
        )}

        {wizStep === 1 && (
          <WizardStickyFooter compact>
            <div className="flex w-full items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setWizStep(0)}
              className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              上一步
            </button>
            <button
              type="button"
              onClick={startGenerate}
              disabled={generating}
              className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  开始生成
                </>
              )}
            </button>
            </div>
          </WizardStickyFooter>
        )}
        </div>
        </div>
        ) : (
        <div className="flex flex-1 flex-col min-h-0">
        {wizStep === 2 && (
          <div className="flex-1 space-y-5">
            {/* Generating state — first generation, no tree yet */}
            {generating && !usecaseTree && (
              <div className="bg-card rounded-xl shadow-sm p-10 text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <h3 className="font-semibold text-lg mb-2">AI 正在生成测试用例</h3>
                <p className="text-sm text-muted-foreground">{genStatus || "正在解析需求文档..."}</p>
                <p className="text-xs text-muted-foreground mt-3">正在扫描输出文件，请稍候...</p>
                <button
                  onClick={async () => {
                    try {
                      await cancelTask.mutateAsync(taskId!);
                    } catch { /* fall through */ }
                    scanner.stop();
                    setGenerating(false);
                    setGenStatus("");
                  }}
                  disabled={cancelTask.isPending}
                  className="mt-4 border border-red-200 text-red-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  {cancelTask.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />取消中...</>
                  ) : (
                    "取消生成"
                  )}
                </button>
              </div>
            )}

            {/* Error state */}
            {!generating && genStatus === "生成失败" && (
              <div className="bg-card rounded-xl shadow-sm p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="font-semibold text-lg mb-2">生成失败</h3>
                <p className="text-sm text-muted-foreground mb-6">任务执行出错，请检查需求内容后重试</p>
                <div className="flex justify-center gap-3">
                  <button onClick={() => { setWizStep(0); setGenerating(false); setGenStatus(""); }}
                    className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />重新配置
                  </button>
                  <button onClick={startGenerate}
                    className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm">
                    <RefreshCw className="w-4 h-4" />重试
                  </button>
                </div>
              </div>
            )}

            {/* Result display */}
            {usecaseTree && usecaseTree.length > 0 && genStatus !== "生成失败" && (
              <>
                <WizardSection
                  title="数据概览"
                  icon={<BarChart3 className="w-4 h-4 text-primary flex-shrink-0" />}
                >
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                      {
                        label: "生成模块",
                        value: genStats?.modules || usecaseTree.length,
                        sub: "功能模块",
                        valCls: "text-primary",
                        icon: <BarChart3 className="w-4 h-4 text-primary" />,
                        iconBg: "bg-primary/10",
                      },
                      {
                        label: "用例总数",
                        value: genStats?.totalCases || usecaseTree.reduce((s, m) => s + m.cases.length, 0),
                        sub: "条测试用例",
                        valCls: "text-foreground",
                        icon: <FileCheck className="w-4 h-4 text-emerald-600" />,
                        iconBg: "bg-emerald-100",
                      },
                      {
                        label: "质量评分",
                        value: genStats?.qualityScore ?? "-",
                        sub: "AI 综合评估",
                        valCls:
                          (genStats?.qualityScore || 0) >= 80
                            ? "text-emerald-600"
                            : (genStats?.qualityScore || 0) >= 60
                            ? "text-amber-500"
                            : "text-red-500",
                        icon: <Target className="w-4 h-4 text-amber-600" />,
                        iconBg: "bg-amber-100",
                      },
                      {
                        label: "生成耗时（首次）",
                        value: genStats?.duration != null ? (genStats.duration / 60000).toFixed(1) : "-",
                        sub: "分钟",
                        valCls: "text-foreground",
                        icon: <Clock className="w-4 h-4 text-violet-600" />,
                        iconBg: "bg-violet-100",
                      },
                    ].map((kpi) => (
                      <div
                        key={kpi.label}
                        className="border border-border/60 rounded-xl p-4 flex items-stretch justify-between gap-3 min-h-[96px]"
                      >
                        <div className="flex flex-col min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground font-medium leading-4 h-4 truncate">
                            {kpi.label}
                          </p>
                          <p className={`text-2xl font-bold tabular-nums leading-none mt-2 ${kpi.valCls}`}>
                            {kpi.value}
                          </p>
                          <p className="text-xs text-muted-foreground mt-auto pt-2 leading-4">{kpi.sub}</p>
                        </div>
                        <div
                          className={`w-9 h-9 rounded-xl ${kpi.iconBg} flex items-center justify-center flex-shrink-0 self-start`}
                        >
                          {kpi.icon}
                        </div>
                      </div>
                    ))}
                  </div>
                </WizardSection>

                <WizardSection
                  title="输出文件"
                  icon={<FileText className="w-4 h-4 text-primary flex-shrink-0" />}
                  meta={step3OutputCount > 0 ? `${step3OutputCount} 个` : undefined}
                >
                  <OutputFiles
                    sectioned
                    taskId={taskId}
                    files={mergedOutputFiles}
                    onEditMarkdown={() => onNavigateToTab?.(2)}
                    isGenerating={generating}
                  />
                </WizardSection>

                <WizardSection
                  id="step3-ai-tweak"
                  title="AI 微调"
                  icon={<Sparkles className="w-4 h-4 text-primary flex-shrink-0" />}
                >
                  <AITweakPanel
                    sectioned
                    taskId={taskId}
                    generating={generating && !!usecaseTree && usecaseTree.length > 0}
                    modules={usecaseTree.map((m) => m.name)}
                    tweakHistory={tweakHistory}
                    onTweakStarted={() => {
                      const currentFiles = [...scanner.foundFiles, ...loadedFiles];
                      setXmindBaseline(maxXmindVersion(currentFiles));
                      setMdBaseline(maxMdVersion(currentFiles));
                      preTweakTreeRef.current = usecaseTree;
                      // P1c: no longer clear loadedFiles — keep previous files visible during tweak
                      setGenerating(true);
                      setGenStatus("正在微调用例...");
                    }}
                    onCancelTweak={async () => {
                      try {
                        await cancelTask.mutateAsync(taskId!);
                      } catch { /* fall through */ }
                      scanner.stop();
                      setGenerating(false);
                      setGenStatus("");
                    }}
                    onRecordTweak={(entry) => {
                      setTweakHistory((prev) => [...prev, entry]);
                    }}
                    onTweakHistoryUpdate={(history) => {
                      setTweakHistory(history);
                    }}
                  />
                </WizardSection>

                {taskId && (
                  <WizardSection
                    id="step3-rating"
                    title="本次生成评价"
                    icon={<Star className="w-4 h-4 text-primary flex-shrink-0" />}
                  >
                    <RatingPanel sectioned taskId={taskId} />
                  </WizardSection>
                )}

                <ModuleOverviewTable
                  modules={usecaseTree}
                  totalCases={usecaseTree.reduce((s, m) => s + m.cases.length, 0)}
                />
              </>
            )}

            {/* Empty result */}
            {!generating && genStatus !== "生成失败" && (!usecaseTree || usecaseTree.length === 0) && (
              <div className="bg-card rounded-xl shadow-sm p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-muted flex items-center justify-center">
                  <FileText className="w-8 h-8 text-muted-foreground opacity-40" />
                </div>
                <h3 className="font-semibold text-lg mb-2">暂无生成结果</h3>
                <p className="text-sm text-muted-foreground mb-6">AI 未能解析出有效用例，请检查需求内容</p>
                <button onClick={() => { setWizStep(0); setGenerating(false); setGenStatus(""); }}
                  className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 mx-auto shadow-sm">
                  <ArrowLeft className="w-4 h-4" />返回重新配置
                </button>
              </div>
            )}
          </div>
        )}
        </div>
        )}
      </div>

      <ExecutionPanel
        taskId={taskId}
        generating={generating}
        wizStep={wizStep}
        hasResult={!generating && !!usecaseTree && usecaseTree.length > 0}
        isTweak={generating && !!usecaseTree && usecaseTree.length > 0}
        configSummary={{
          source: uploadedFiles.length > 0
            ? uploadedFiles.map((f) => f.name).join(", ")
            : requirementText
            ? "文本输入"
            : "未选择",
          knowledge: `${selectedKnowledgeIds.size} 份`,
          history: `${selectedHistoryIds.size} 份`,
        }}
        foundFiles={mergedOutputFiles}
        logStages={logStages}
        onDownloadFile={(file) => {
          if (!taskId) return;
          const url = `/api/tasks/${taskId}/download?file=${encodeURIComponent(file.relativePath)}`;
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }}
        onScrollToAITweak={() => {
          document.getElementById("step3-ai-tweak")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onScrollToRating={() => {
          document.getElementById("step3-rating")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onNavigateToEditor={() => onNavigateToTab?.(2)}
      />
    </div>
  );
}
