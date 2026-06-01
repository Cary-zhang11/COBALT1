"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GenerateWizard } from "@/components/usecase-gen/generate-wizard";
import { CaseEditor } from "@/components/usecase-gen/case-editor";
import { Dashboard } from "@/components/usecase-gen/dashboard";
import { KnowledgeBase } from "@/components/usecase-gen/knowledge-base";
import { HistoryList } from "@/components/usecase-gen/history-list";
import type { UsecaseModule } from "@/components/usecase-gen/shared/types";

const TAB_KEYS = ["generate", "history", "editor", "dashboard", "knowledge"];
const TAB_INDEX: Record<string, number> = Object.fromEntries(TAB_KEYS.map((k, i) => [k, i]));

export default function UsecaseGenPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL is the single source of truth for navigation state
  const [activeTab, setActiveTabState] = useState(() => {
    const tab = searchParams.get("tab");
    return tab && TAB_INDEX[tab] !== undefined ? TAB_INDEX[tab] : 0;
  });
  // taskId lives in URL, not useState — eliminates all stale-state bugs
  const taskId = searchParams.get("taskId") || null;

  const [usecaseTree, setUsecaseTree] = useState<UsecaseModule[] | null>(null);

  // Sync URL → state (sidebar clicks / bookmark / back button)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && TAB_INDEX[tab] !== undefined) {
      setActiveTabState(TAB_INDEX[tab]);
    }
  }, [searchParams]);

  // Sync state → URL (tab bar clicks / wizard internal navigation)
  const setActiveTab = useCallback((i: number) => {
    setActiveTabState(i);
    router.replace(`/usecase-gen?tab=${TAB_KEYS[i]}`, { scroll: false });
  }, [router]);

  const skillId = process.env.NEXT_PUBLIC_USECASE_SKILL_ID;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 0 && (
          <GenerateWizard
            key="generate"
            initialTaskId={null}
            onComplete={(tree) => setUsecaseTree(tree)}
            skillId={skillId}
            onNavigateToTab={setActiveTab}
          />
        )}
        {activeTab === 1 && (
          taskId ? (
            <div>
              <button
                onClick={() => router.replace("/usecase-gen?tab=history", { scroll: false })}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                返回列表
              </button>
              <GenerateWizard
                key={taskId}
                initialTaskId={taskId}
                onComplete={(tree) => setUsecaseTree(tree)}
                skillId={skillId}
                onNavigateToTab={setActiveTab}
              />
            </div>
          ) : (
            <HistoryList
              skillId={skillId}
              onSelectTask={(id) => {
                router.replace(`/usecase-gen?tab=history&taskId=${id}`, { scroll: false });
              }}
            />
          )
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
