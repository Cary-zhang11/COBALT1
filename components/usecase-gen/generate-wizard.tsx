"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCreateTask, useExecuteTask, useResumeTask, useCancelTask } from "@/hooks/use-tasks";
import { useQuery } from "@tanstack/react-query";
import { useOutputScanner, maxXmindVersion, type FileInfo } from "@/hooks/use-output-scanner";
import { useTaskEvents } from "@/hooks/use-task-events";
import { ExecutionPanel } from "./shared/execution-panel";
import { OutputFiles } from "./shared/output-files";
import { AITweakPanel } from "./shared/ai-tweak-panel";

import { ModuleOverviewTable } from "./shared/module-overview-table";

import type { UsecaseModule, TweakEntry } from "./shared/types";
import {
  Upload, Loader2, FileText, CheckCircle2, ArrowLeft, ChevronRight,
  Wand2, AlertTriangle, RefreshCw, Edit3, BarChart3,
  Clock, Target, FileCheck, ArrowRight,
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

export function GenerateWizard({
  initialTaskId, onComplete, skillId, onNavigateToTab,
}: GenerateWizardProps) {
  const createTask = useCreateTask();
  const executeTask = useExecuteTask();
  const resumeTask = useResumeTask();
  const cancelTask = useCancelTask();
  // Wizard
  const [wizStep, setWizStep] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [requirementText, setRequirementText] = useState("");
  const [validationMsg, setValidationMsg] = useState("");

  // ---- Step 2: 知识库关联 ----
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<Set<string>>(new Set());
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());

  interface HistoryOption {
    id: string;
    displayName: string;
    sourcePath?: string;
    sourceTaskId?: string;
    mdFileName?: string;
  }

  const { data: knowledgeData } = useQuery({
    queryKey: ["knowledge", { type: "knowledge" }],
    queryFn: () => fetch("/api/knowledge?type=knowledge").then((r) => r.json()),
  });

  const { data: uploadedHistoryData } = useQuery({
    queryKey: ["knowledge", { type: "history_uploaded" }],
    queryFn: () => fetch("/api/knowledge?type=history_uploaded").then((r) => r.json()),
  });

  const { data: platformHistoryData } = useQuery({
    queryKey: ["knowledge-history"],
    queryFn: () => fetch("/api/knowledge/history").then((r) => r.json()),
  });

  const historyOptions: HistoryOption[] = useMemo(() => {
    const result: HistoryOption[] = [];
    const uploaded = (uploadedHistoryData as { items?: { id: string; title: string; content: string }[] }) || {};
    for (const item of uploaded.items || []) {
      result.push({
        id: `knowledge:${item.id}`,
        displayName: (item.title || "untitled") + ".md",
        sourcePath: item.content,
      });
    }
    const platform = (platformHistoryData as {
      items?: { id: string; mdFileName: string }[];
    }) || {};
    for (const item of platform.items || []) {
      if (!item.mdFileName) continue;
      result.push({
        id: `task:${item.id}`,
        displayName: item.mdFileName,
        sourceTaskId: item.id,
        mdFileName: item.mdFileName,
      });
    }
    return result;
  }, [uploadedHistoryData, platformHistoryData]);

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

  // Internal state (previously from parent props)
  const [usecaseTree, setUsecaseTree] = useState<UsecaseModule[] | null>(null);
  const [tweakHistory, setTweakHistory] = useState<TweakEntry[]>([]);

  const preTweakTreeRef = useRef<UsecaseModule[] | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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
        const serverHistory = (data.tweakHistory as TweakEntry[]) || tweakHistory;
        const round = serverHistory.length;
        setTweakHistory((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((e) => e.round === round);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], status: "done" as const, summary: summaryText };
          }
          return updated;
        });
        persistTweakEntry(taskId, round, { status: "done", summary: summaryText });
        preTweakTreeRef.current = null;
      }
    },
    onError: (msg) => {
      setGenStatus(msg);
      setGenerating(false);
      if (taskId) {
        setTweakHistory((prev) => {
          const history = [...prev];
          const round = history.length;
          const idx = history.findIndex((e) => e.round === round);
          if (idx >= 0) {
            history[idx] = { ...history[idx], status: "failed" as const };
          }
          return history;
        });
        persistTweakEntry(taskId, tweakHistory.length, { status: "failed" });
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
          // Files not ready — start scanner polling
          if (cancelled) return;
          setTaskId(initialTaskId);
          setGenerating(true);
          setGenStatus("正在加载...");
          setWizStep(2);
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
    setWizStep(2);
    setGenerating(true);
    setGenStatus("正在解析需求文档...");
    setLoadedFiles([]);
    setTweakHistory([]);
    setXmindBaseline(-1);
    preTweakTreeRef.current = null;
    try {
      const { taskId: newTaskId } = await createTask.mutateAsync({
        skillId,
        input,
        uploadedFiles: uploadedFiles.map((f) => f.path),
      });
      setTaskId(newTaskId);

      // 收集 referenceFiles
      const knowledgeItems = (knowledgeData as { items?: { id: string; title: string; content: string }[] } | undefined)?.items || [];
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

      await executeTask.mutateAsync({ taskId: newTaskId, referenceFiles });
    } catch {
      setGenStatus("生成失败");
      setGenerating(false);
    }
  };

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

  return (
    <div className="flex gap-6 overflow-auto min-h-0">
      {/* Left: Wizard */}
      <div className="flex-1 min-w-0 overflow-auto">
        {/* Step Bar */}
        <div className="flex items-center gap-0 mb-6 bg-card rounded-xl shadow-sm p-4">
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

        {/* Step 1 */}
        {wizStep === 0 && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Upload className="w-4 h-4 text-primary" />上传需求文档</h3>
              <div
                className="border-2 border-dashed rounded-lg py-3 px-4 text-center cursor-pointer transition-all border-border hover:border-primary/30 hover:bg-primary/5"
                onClick={() => document.getElementById("wizard-file-input")?.click()}
              >
                <p className="text-xs text-muted-foreground">
                  <span className="text-primary font-medium">点击上传</span> 或拖拽文件到此处 · 支持 .docx .pdf .md .txt
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
            </div>

            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Wand2 className="w-4 h-4 text-primary" />或直接粘贴需求文本/链接</h3>
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
            <div className="flex justify-end">
              <button onClick={() => {
                if (!uploadedFiles.length && !requirementText.trim()) {
                  setValidationMsg("请至少上传一个需求文档，或粘贴需求文本");
                  return;
                }
                setValidationMsg("");
                setWizStep(1);
              }}
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2">
                下一步：关联用例<ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: 关联用例 */}
        {wizStep === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* 左侧：业务知识 */}
              <div className="bg-card rounded-xl shadow-sm p-5">
                <h3 className="font-semibold mb-1 text-sm">业务知识</h3>
                <p className="text-xs text-muted-foreground mb-3">勾选本次生成需要参考的业务规范文档</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {!knowledgeData ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">加载中...</p>
                  ) : ((knowledgeData as { items?: { id: string; title: string; businessType: string | null; updatedAt: string }[] }).items?.length || 0) === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">暂无业务知识，可前往知识库上传</p>
                  ) : (
                    (knowledgeData as { items: { id: string; title: string; businessType: string | null; updatedAt: string }[] }).items.map((item) => (
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
                        <div className="min-w-0 flex-1">
                          <span className="text-sm truncate block">{item.title}.md</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                            {item.businessType ? ` · ${item.businessType}` : ""}
                          </span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* 右侧：历史用例范文 */}
              <div className="bg-card rounded-xl shadow-sm p-5">
                <h3 className="font-semibold mb-1 text-sm">历史用例范文</h3>
                <p className="text-xs text-muted-foreground mb-3">勾选优秀历史用例作为 few-shot 参考</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {(!uploadedHistoryData && !platformHistoryData) ? (
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
              </div>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setWizStep(0)}
                className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />上一步
              </button>
              <button onClick={startGenerate} disabled={generating}
                className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2">
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" />生成中...</> : <><Wand2 className="w-4 h-4" />开始生成</>}
              </button>
            </div>
          </div>
        )}

        {/* Step 2：生成结果 */}
        {wizStep === 2 && (
          <div className="space-y-5">
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
                {/* KPI Cards */}
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  数据概览
                </h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-card rounded-xl shadow-sm p-5 flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">生成模块</p>
                      <p className="text-3xl font-bold mt-1 text-primary">{genStats?.modules || usecaseTree.length}</p>
                      <p className="text-xs text-muted-foreground mt-1">功能模块</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-primary" /></div>
                  </div>
                  <div className="bg-card rounded-xl shadow-sm p-5 flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">用例总数</p>
                      <p className="text-3xl font-bold mt-1 text-foreground">{genStats?.totalCases || usecaseTree.reduce((s, m) => s + m.cases.length, 0)}</p>
                      <p className="text-xs text-muted-foreground mt-1">条测试用例</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><FileCheck className="w-5 h-5 text-emerald-600" /></div>
                  </div>
                  <div className="bg-card rounded-xl shadow-sm p-5 flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">质量评分</p>
                      <p className={`text-3xl font-bold mt-1 ${(genStats?.qualityScore || 0) >= 80 ? "text-emerald-600" : (genStats?.qualityScore || 0) >= 60 ? "text-amber-500" : "text-red-500"}`}>{genStats?.qualityScore || "-"}</p>
                      <p className="text-xs text-muted-foreground mt-1">AI 综合评估</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Target className="w-5 h-5 text-amber-600" /></div>
                  </div>
                  <div className="bg-card rounded-xl shadow-sm p-5 flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">生成耗时</p>
                      <p className="text-3xl font-bold mt-1 text-foreground">{genStats?.duration != null ? (genStats.duration / 60000).toFixed(1) : "-"}</p>
                      <p className="text-xs text-muted-foreground mt-1">分钟</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><Clock className="w-5 h-5 text-violet-600" /></div>
                  </div>
                </div>

                {/* Output files */}
                <OutputFiles
                  taskId={taskId}
                  files={(() => {
                    const seen = new Set<string>();
                    return [...scanner.foundFiles, ...loadedFiles].filter((f) => {
                      if (seen.has(f.relativePath)) return false;
                      seen.add(f.relativePath);
                      return true;
                    });
                  })()}
                />

                {/* Go to editor button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => onNavigateToTab?.(2)}
                    className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm flex items-center gap-2 transition-all hover:bg-primary/90"
                  >
                    <Edit3 className="w-4 h-4" />
                    去编辑用例
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* AI Tweak */}
                <AITweakPanel
                  taskId={taskId}
                  generating={generating && !!usecaseTree && usecaseTree.length > 0}
                  modules={usecaseTree.map((m) => m.name)}
                  tweakHistory={tweakHistory}
                  onTweakStarted={() => {
                    const baseline = maxXmindVersion([...scanner.foundFiles, ...loadedFiles]);
                    setXmindBaseline(baseline);
                    preTweakTreeRef.current = usecaseTree;
                    setLoadedFiles([]);
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

                {/* Module table */}
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

      {/* Right: Execution Panel */}
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
        foundFiles={(() => {
          const seen = new Set<string>();
          return [...scanner.foundFiles, ...loadedFiles].filter((f) => {
            if (seen.has(f.relativePath)) return false;
            seen.add(f.relativePath);
            return true;
          });
        })()}
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
          document.querySelector("[data-ai-tweak]")?.scrollIntoView({ behavior: "smooth" });
        }}
        onNavigateToEditor={() => onNavigateToTab?.(2)}
      />
    </div>
  );
}
