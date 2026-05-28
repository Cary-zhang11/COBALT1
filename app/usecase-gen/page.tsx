"use client";

import { useState } from "react";
import { GenerateWizard } from "@/components/usecase-gen/generate-wizard";
import { CaseEditor } from "@/components/usecase-gen/case-editor";
import { Dashboard } from "@/components/usecase-gen/dashboard";
import { KnowledgeBase } from "@/components/usecase-gen/knowledge-base";
import { HistoryList } from "@/components/usecase-gen/history-list";
import type { UsecaseModule, TweakEntry } from "@/components/usecase-gen/shared/types";

const TABS = ["生成向导", "历史记录", "用例预览编辑", "数据看板", "知识库管理"];

export default function UsecaseGenPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [usecaseTree, setUsecaseTree] = useState<UsecaseModule[] | null>(null);
  const [tweakHistory, setTweakHistory] = useState<TweakEntry[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [preloadedResult, setPreloadedResult] = useState<{
    tree: UsecaseModule[];
    stats: { totalCases: number; qualityScore: number; modules: number };
  } | null>(null);

  const skillId = process.env.NEXT_PUBLIC_USECASE_SKILL_ID;

  const handleLoadResult = (result: {
    tree: UsecaseModule[];
    stats: { totalCases: number; qualityScore: number; modules: number };
  }) => {
    setUsecaseTree(result.tree);
    setPreloadedResult(result);
    setActiveTab(0);
  };

  const handleResumeTask = (taskId: string) => {
    setCurrentTaskId(taskId);
    setActiveTab(0);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">用例生成</h1>
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            {TABS.map((tab, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === i
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 0 && (
          <GenerateWizard
            onComplete={(tree) => setUsecaseTree(tree)}
            tweakHistory={tweakHistory}
            onTweakHistoryUpdate={setTweakHistory}
            usecaseTree={usecaseTree}
            skillId={skillId}
            onNavigateToTab={setActiveTab}
            preloadedResult={preloadedResult}
            onClearPreloaded={() => setPreloadedResult(null)}
            resumeTaskId={currentTaskId}
            onClearResume={() => setCurrentTaskId(null)}
          />
        )}
        {activeTab === 1 && (
          <HistoryList
            skillId={skillId}
            onLoadResult={handleLoadResult}
            onResumeTask={handleResumeTask}
          />
        )}
        {activeTab === 2 && (
          <CaseEditor usecaseTree={usecaseTree} tweakHistory={tweakHistory} />
        )}
        {activeTab === 3 && <Dashboard />}
        {activeTab === 4 && <KnowledgeBase />}
      </div>
    </div>
  );
}
