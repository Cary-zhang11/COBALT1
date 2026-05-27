"use client";

import { useState, useRef, useCallback } from "react";
import { useCreateTask, useExecuteTask, useResumeTask } from "@/hooks/use-tasks";
import { ExecutionPanel } from "./shared/execution-panel";
import { parseUsecaseOutput } from "./shared/parse-usecase-output";
import {
  mockRecentReqs, mockFewShotExamples, mockCapabilities,
  mockDimensions, mockQuickActions,
} from "./shared/mock-data";
import type { UsecaseModule, TweakEntry } from "./shared/types";
import {
  Upload, Loader2, Send, FileText, CheckCircle2, ArrowLeft, ChevronRight,
  Wand2, Download,
} from "lucide-react";

interface GenerateWizardProps {
  onComplete: (tree: UsecaseModule[], summary?: { totalCases: number; qualityScore: number; modules: number }) => void;
  tweakHistory: TweakEntry[];
  onTweakHistoryUpdate: (history: TweakEntry[]) => void;
  usecaseTree: UsecaseModule[] | null;
  skillId: string | undefined;
}

const STEPS = ["输入物料", "选择平台能力", "生成并预览"];

export function GenerateWizard({
  onComplete, tweakHistory, onTweakHistoryUpdate, usecaseTree, skillId,
}: GenerateWizardProps) {
  const createTask = useCreateTask();
  const executeTask = useExecuteTask();
  const resumeTask = useResumeTask();

  // Wizard
  const [wizStep, setWizStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [requirementText, setRequirementText] = useState("");
  const [selectedReq, setSelectedReq] = useState<number | null>(null);

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

  // Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) setUploadedFile(file.name);
    } catch {}
  };

  // Start Generate
  const startGenerate = async () => {
    if (!skillId) return;
    let input = requirementText.trim();
    if (uploadedFile) input = input ? `${input}\n\n[附件: ${uploadedFile}]` : `上传文件: ${uploadedFile}`;
    setWizStep(2);
    setGenerating(true);
    setGenStatus("正在解析需求文档...");
    try {
      const { taskId: newTaskId } = await createTask.mutateAsync({ skillId, input });
      setTaskId(newTaskId);
      await executeTask.mutateAsync(newTaskId);
    } catch {
      setGenStatus("生成失败");
      setGenerating(false);
    }
  };

  // Called by ExecutionPanel when SSE reports completion
  const onExecutionComplete = useCallback(async (status: string) => {
    if (status !== "completed" || !taskId) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      const output = data.task?.output || "";
      const parsed = parseUsecaseOutput(output);
      if (parsed.tree) {
        onComplete(parsed.tree, parsed.summary);
        if (parsed.summary) {
          setGenStats({
            totalCases: parsed.summary.totalCases,
            qualityScore: parsed.summary.qualityScore,
            modules: parsed.summary.modules,
            duration: data.task?.duration ? Math.round(data.task.duration / 1000 * 10) / 10 : 0,
          });
        }
      } else onComplete([]);
    } catch {}
    setGenerating(false);
  }, [taskId, onComplete]);

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
    <div className="flex gap-6">
      {/* Left: Wizard */}
      <div className="flex-1 min-w-0">
        {/* Step Bar */}
        <div className="flex items-center gap-0 mb-6 bg-card rounded-xl shadow-sm p-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-0 flex-1">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all ${
                    wizStep > i ? "bg-cyan-500 text-white" : wizStep === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {wizStep > i ? <CheckCircle2 className="w-4 h-4" /> : <span>{i + 1}</span>}
                </div>
                <span className={`text-sm ${wizStep >= i ? "text-primary font-medium" : "text-muted-foreground"}`}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-8 mx-2 flex-shrink-0 ${wizStep > i ? "bg-cyan-500" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {wizStep === 0 && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Upload className="w-4 h-4 text-cyan-500" />上传需求文档</h3>
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer border-border hover:border-cyan-300 hover:bg-cyan-50/30 transition-all"
                onClick={() => document.getElementById("wizard-file-input")?.click()}
              >
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">拖拽上传 PRD / Word / PDF，或 <span className="text-cyan-500 font-medium">点击选择</span></p>
                <p className="text-xs text-muted-foreground mt-1">支持 .docx .pdf .md .txt</p>
                <input id="wizard-file-input" type="file" className="hidden" onChange={handleFileUpload} />
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Wand2 className="w-4 h-4 text-cyan-500" />或直接粘贴需求文本</h3>
              <textarea
                value={requirementText}
                onChange={(e) => setRequirementText(e.target.value)}
                rows={5}
                placeholder="将需求描述、用户故事或功能说明粘贴到此处..."
                className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className={`text-right text-xs mt-1 ${requirementText.length > 2000 ? "text-red-500" : "text-muted-foreground"}`}>
                {requirementText.length} / 2000 字
              </p>
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

            <div className="flex justify-end">
              <button onClick={() => setWizStep(1)}
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
                    className={`px-3 py-1.5 rounded-lg text-sm border font-medium ${dim.active ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:border-muted-foreground/40"}`}>{dim.name}</button>
                ))}
              </div>
            </div>
            <div className="bg-card rounded-xl shadow-sm p-5">
              <h3 className="font-semibold mb-4">生成参数</h3>
              <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                <div><span className="text-xs block mb-1">输出格式</span><div className="border border-border rounded-lg px-3 py-2 bg-muted/30">XMind + Excel</div></div>
                <div><span className="text-xs block mb-1">用例粒度</span><div className="border border-border rounded-lg px-3 py-2 bg-muted/30">标准（推荐）</div></div>
                <div><span className="text-xs block mb-1">优先级策略</span><div className="border border-border rounded-lg px-3 py-2 bg-muted/30">P0/P1/P2 三级</div></div>
              </div>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setWizStep(0)}
                className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />上一步
              </button>
              <button onClick={startGenerate}
                className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2">
                <Wand2 className="w-4 h-4" />开始生成
              </button>
            </div>
          </div>
        )}

        {/* Step 3 skeleton - will be refined in subsequent iterations */}
        {wizStep === 2 && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl shadow-sm p-6 text-center">
              <p className="text-muted-foreground">{generating ? "生成中..." : "生成结果"}</p>
            </div>
            <div className="flex justify-start">
              <button onClick={() => { setWizStep(0); setGenerating(false); }}
                className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />重新配置
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Execution Panel */}
      <div className="w-80 flex-shrink-0">
        <ExecutionPanel
          taskId={taskId}
          generating={generating}
          configSummary={{
            source: uploadedFile || (selectedReq ? "最近需求" : (requirementText ? "文本输入" : "未选择")),
            capabilities: `${capabilities.filter((c) => c.selected).length} / ${capabilities.length}`,
            dimensions: `${dimensions.filter((d) => d.active).length} 个`,
            fewShot: `${fewShot.filter((f) => f.selected).length} 份`,
          }}
          onComplete={onExecutionComplete}
        />
      </div>
    </div>
  );
}
