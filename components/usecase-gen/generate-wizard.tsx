"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useCreateTask, useExecuteTask, useResumeTask, useCancelTask } from "@/hooks/use-tasks";
import { useOutputScanner } from "@/hooks/use-output-scanner";
import { ExecutionPanel } from "./shared/execution-panel";
import {
  mockRecentReqs, mockFewShotExamples, mockCapabilities,
  mockDimensions, mockQuickActions,
} from "./shared/mock-data";
import type { UsecaseModule, TweakEntry } from "./shared/types";
import {
  Upload, Loader2, Send, FileText, CheckCircle2, ArrowLeft, ChevronRight,
  Wand2, Download, AlertTriangle, RefreshCw, Edit3, BarChart3,
  Clock, Target, FileCheck, ArrowRight,
} from "lucide-react";

interface GenerateWizardProps {
  onComplete: (tree: UsecaseModule[], summary?: { totalCases: number; qualityScore: number; modules: number }) => void;
  tweakHistory: TweakEntry[];
  onTweakHistoryUpdate: (history: TweakEntry[]) => void;
  usecaseTree: UsecaseModule[] | null;
  skillId: string | undefined;
  onNavigateToTab?: (tabIndex: number) => void;
  preloadedResult?: {
    tree: UsecaseModule[];
    stats: { totalCases: number; qualityScore: number; modules: number };
  } | null;
  onClearPreloaded?: () => void;
  resumeTaskId?: string | null;
  onClearResume?: () => void;
}

interface UploadedFile {
  name: string;
  path: string;
}

const STEPS = ["输入物料", "选择平台能力", "生成并预览"];

export function GenerateWizard({
  onComplete, tweakHistory, onTweakHistoryUpdate, usecaseTree, skillId,
  onNavigateToTab, preloadedResult, onClearPreloaded, resumeTaskId, onClearResume,
}: GenerateWizardProps) {
  const createTask = useCreateTask();
  const executeTask = useExecuteTask();
  const resumeTask = useResumeTask();
  // Wizard
  const [wizStep, setWizStep] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [requirementText, setRequirementText] = useState("");
  const [selectedReq, setSelectedReq] = useState<number | null>(null);
  const [validationMsg, setValidationMsg] = useState("");

  // Mutable refs for mutable mock arrays
  const fewShotRef = useRef(mockFewShotExamples.map((f) => ({ ...f })));
  const capabilitiesRef = useRef(mockCapabilities.map((c) => ({ ...c })));
  const dimensionsRef = useRef(mockDimensions.map((d) => ({ ...d })));
  const [fewShot, setFewShot] = useState(fewShotRef.current);
  const [capabilities, setCapabilities] = useState(capabilitiesRef.current);
  const [dimensions, setDimensions] = useState(dimensionsRef.current);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [genStats, setGenStats] = useState<{ totalCases: number; qualityScore: number; modules: number; duration: number } | null>(null);
  const [injectInput, setInjectInput] = useState("");
  const [injectSent, setInjectSent] = useState(false);
  const [tweakInput, setTweakInput] = useState("");
  const [iterationCount, setIterationCount] = useState(1);

  const cancelTask = useCancelTask();

  // Output scanner — replaces SSE onComplete callback
  const scanner = useOutputScanner({
    taskId: taskId || "",
    enabled: generating && !!taskId,
    onResult: (data) => {
      const tree = data.tree as UsecaseModule[];
      const summary = data.summary;
      onComplete(tree, summary);
      setGenStats({
        totalCases: summary?.totalCases || 0,
        qualityScore: summary?.qualityScore || 0,
        modules: summary?.modules || 0,
        duration: 0,
      });
      setGenerating(false);
    },
    onError: (msg) => {
      setGenStatus(msg);
      setGenerating(false);
    },
  });

  // Handle preloaded result from history
  useEffect(() => {
    if (preloadedResult) {
      setWizStep(2);
      setGenStats({
        totalCases: preloadedResult.stats.totalCases,
        qualityScore: preloadedResult.stats.qualityScore,
        modules: preloadedResult.stats.modules,
        duration: 0,
      });
      setGenerating(false);
      setGenStatus("");
      onComplete(preloadedResult.tree, preloadedResult.stats);
      onClearPreloaded?.();
    }
  }, [preloadedResult, onComplete, onClearPreloaded]);

  // Handle resume task from history
  useEffect(() => {
    if (resumeTaskId) {
      setTaskId(resumeTaskId);
      setGenerating(true);
      setGenStatus("正在恢复执行进度...");
      setWizStep(2);
      onClearResume?.();
    }
  }, [resumeTaskId, onClearResume]);

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
    try {
      const { taskId: newTaskId } = await createTask.mutateAsync({
        skillId,
        input,
        uploadedFiles: uploadedFiles.map((f) => f.path),
      });
      setTaskId(newTaskId);
      await executeTask.mutateAsync(newTaskId);
    } catch {
      setGenStatus("生成失败");
      setGenerating(false);
    }
  };

  // (onExecutionComplete removed — replaced by useOutputScanner)

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

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card rounded-xl shadow-sm p-5">
                <h3 className="font-semibold mb-3 text-sm">最近需求</h3>
                <div className="space-y-2">
                  {mockRecentReqs.map((req) => (
                    <div key={req.id} onClick={() => setSelectedReq(selectedReq === req.id ? null : req.id)}
                      className={`border rounded-lg px-3 py-2 cursor-pointer ${selectedReq === req.id ? "border-cyan-500 bg-cyan-50" : "border-border hover:border-muted-foreground/30"}`}>
                      <span className="text-sm font-medium">{req.name}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{req.date} · {req.count}个用例</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-card rounded-xl shadow-sm p-5">
                <h3 className="font-semibold mb-3 text-sm">复用历史用例作 few-shot</h3>
                <div className="space-y-2">
                  {fewShot.map((ex, i) => (
                    <label key={i} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ex.selected} onChange={() => { const n = [...fewShot]; n[i] = { ...n[i], selected: !ex.selected }; setFewShot(n); }} className="accent-cyan-500 w-3.5 h-3.5" />
                      <span className="text-sm">{ex.name}</span>
                      <span className="text-xs text-muted-foreground">({ex.count}条)</span>
                    </label>
                  ))}
                </div>
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
                下一步：选择平台能力<ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {wizStep === 1 && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-4">知识库与规范增强</h3>
              <div className="grid grid-cols-2 gap-3">
                {capabilities.map((cap, i) => (
                  <label key={i} className={`flex items-start gap-3 border rounded-xl p-4 cursor-pointer ${cap.selected ? "border-cyan-500 bg-cyan-50" : "border-border hover:border-muted-foreground/30"}`}>
                    <input type="checkbox" checked={cap.selected} onChange={() => { const n = [...capabilities]; n[i] = { ...n[i], selected: !cap.selected }; setCapabilities(n); }} className="accent-cyan-500 mt-0.5" />
                    <div><p className="text-sm font-medium">{cap.name}</p><p className="text-xs text-muted-foreground mt-0.5">{cap.desc}</p></div>
                  </label>
                ))}
              </div>
            </div>
            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-4">覆盖维度配置</h3>
              <div className="flex flex-wrap gap-2">
                {dimensions.map((dim, i) => (
                  <button key={i} onClick={() => { const n = [...dimensions]; n[i] = { ...n[i], active: !dim.active }; setDimensions(n); }}
                    className={`px-3 py-2.5 min-h-[44px] rounded-lg text-sm border font-medium transition-all duration-200 active:scale-95 ${dim.active ? "bg-primary text-primary-foreground border-primary shadow-sm" : "text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"}`}>{dim.name}</button>
                ))}
              </div>
            </div>
            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-4">生成参数</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-xs text-muted-foreground block mb-1">输出格式</span><div className="border-l-2 border-primary pl-3 py-1.5 text-foreground font-medium">XMind + Excel</div></div>
                <div><span className="text-xs text-muted-foreground block mb-1">用例粒度</span><div className="border-l-2 border-primary pl-3 py-1.5 text-foreground font-medium">标准（推荐）</div></div>
                <div><span className="text-xs text-muted-foreground block mb-1">优先级策略</span><div className="border-l-2 border-primary pl-3 py-1.5 text-foreground font-medium">P0/P1/P2 三级</div></div>
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

        {/* Step 3：生成结果 */}
        {wizStep === 2 && (
          <div className="space-y-5">
            {/* Generating state */}
            {generating && (
              <div className="bg-card rounded-xl shadow-sm p-10 text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <h3 className="font-semibold text-lg mb-2">AI 正在生成测试用例</h3>
                <p className="text-sm text-muted-foreground">{genStatus || "正在解析需求文档..."}</p>
                <p className="text-xs text-muted-foreground mt-3">正在扫描输出文件，请稍候...</p>
                <button
                  onClick={() => {
                    cancelTask.mutate(taskId!);
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

            {/* Completed: Result display */}
            {!generating && genStatus !== "生成失败" && usecaseTree && usecaseTree.length > 0 && (
              <>
                {/* KPI Cards */}
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
                      <p className="text-3xl font-bold mt-1 text-foreground">{genStats?.duration || "-"}</p>
                      <p className="text-xs text-muted-foreground mt-1">秒</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><Clock className="w-5 h-5 text-violet-600" /></div>
                  </div>
                </div>

                {/* Module Overview Table */}
                <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b flex items-center justify-between">
                    <h3 className="font-semibold text-sm">模块用例概览</h3>
                    <span className="text-xs text-muted-foreground">
                      共 {usecaseTree.reduce((s, m) => s + m.cases.length, 0)} 条用例
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">模块</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">用例数</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">P0 / P1 / P2</th>
                        <th className="text-right px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">覆盖率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usecaseTree.map((mod, mi) => {
                        const p0 = mod.cases.filter((c) => c.priority === "P0").length;
                        const p1 = mod.cases.filter((c) => c.priority === "P1").length;
                        const p2 = mod.cases.filter((c) => c.priority === "P2").length;
                        const cov = Math.min(100, Math.round(mod.cases.length / Math.max(1, (genStats?.totalCases || usecaseTree.reduce((s, m) => s + m.cases.length, 0)) / usecaseTree.length) * 40 + 60));
                        return (
                          <tr key={mi} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3 font-medium">{mod.name}</td>
                            <td className="text-center px-4 py-3">{mod.cases.length}</td>
                            <td className="text-center px-4 py-3">
                              <span className="inline-flex gap-1">
                                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{p0}</span>
                                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">{p1}</span>
                                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">{p2}</span>
                              </span>
                            </td>
                            <td className="text-right px-5 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full rounded-full ${cov >= 80 ? "bg-emerald-500" : cov >= 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${cov}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{cov}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Action buttons */}
                <div className="flex justify-between">
                  <button onClick={() => { setWizStep(0); setGenerating(false); setGenStatus(""); }}
                    className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 flex items-center gap-2 transition-colors">
                    <ArrowLeft className="w-4 h-4" />重新配置
                  </button>
                  <button onClick={() => onNavigateToTab?.(2)}
                    className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm flex items-center gap-2 transition-all hover:bg-primary/90">
                    <Edit3 className="w-4 h-4" />去编辑用例<ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* Completed but empty result */}
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
      <div className="w-80 flex-shrink-0">
        <ExecutionPanel
          taskId={taskId}
          generating={generating}
          configSummary={{
            source: uploadedFiles.length > 0 ? uploadedFiles.map((f) => f.name).join(", ") : (selectedReq ? "最近需求" : (requirementText ? "文本输入" : "未选择")),
            capabilities: `${capabilities.filter((c) => c.selected).length} / ${capabilities.length}`,
            dimensions: `${dimensions.filter((d) => d.active).length} 个`,
            fewShot: `${fewShot.filter((f) => f.selected).length} 份`,
          }}
        />
      </div>
    </div>
  );
}
