"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { GenerateWizard } from "@/components/usecase-gen/generate-wizard";
import { CaseEditor } from "@/components/usecase-gen/case-editor";
import { Dashboard } from "@/components/usecase-gen/dashboard";
import { KnowledgeBase } from "@/components/usecase-gen/knowledge-base";
import { HistoryList } from "@/components/usecase-gen/history-list";
import type { UsecaseModule } from "@/components/usecase-gen/shared/types";

const TABS = ["生成向导", "历史记录", "用例预览编辑", "数据看板", "知识库管理"];
const TAB_KEYS = ["generate", "history", "editor", "dashboard", "knowledge"];
const TAB_INDEX: Record<string, number> = Object.fromEntries(TAB_KEYS.map((k, i) => [k, i]));

export default function UsecaseGenPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTabState] = useState(() => {
    const tab = searchParams.get("tab");
    return tab && TAB_INDEX[tab] !== undefined ? TAB_INDEX[tab] : 0;
  });
  const [usecaseTree, setUsecaseTree] = useState<UsecaseModule[] | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Sync URL → state (sidebar clicks / bookmark)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && TAB_INDEX[tab] !== undefined) {
      setActiveTabState(TAB_INDEX[tab]);
    }
  }, [searchParams]);

  // Sync state → URL (tab bar clicks / internal navigation)
  const setActiveTab = useCallback((i: number) => {
    setActiveTabState(i);
    router.replace(`/usecase-gen?tab=${TAB_KEYS[i]}`, { scroll: false });
  }, [router]);

  const skillId = process.env.NEXT_PUBLIC_USECASE_SKILL_ID;

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
            key={activeTaskId}
            initialTaskId={activeTaskId}
            onComplete={(tree) => setUsecaseTree(tree)}
            skillId={skillId}
            onNavigateToTab={setActiveTab}
          />
        )}
        {activeTab === 1 && (
          <HistoryList
            skillId={skillId}
            onSelectTask={(taskId) => {
              setActiveTaskId(taskId);
              setActiveTab(0);
            }}
          />
        )}
        {activeTab === 2 && (
          <CaseEditor usecaseTree={usecaseTree} />
        )}
        {activeTab === 3 && <Dashboard />}
        {activeTab === 4 && <KnowledgeBase />}
      </div>
    </div>
  );
}
