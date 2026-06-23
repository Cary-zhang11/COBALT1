"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GenerateWizard } from "@/components/usecase-gen/generate-wizard";
import { CaseEditor } from "@/components/usecase-gen/case-editor";
import { Dashboard } from "@/components/usecase-gen/dashboard";
import { KnowledgeBase } from "@/components/usecase-gen/knowledge-base";
import { HistoryList } from "@/components/usecase-gen/history-list";
import type { UsecaseModule } from "@/components/usecase-gen/shared/types";
import { modulesToMindMap } from "@/lib/md-mindmap-convert";

const TAB_KEYS = ["generate", "history", "editor", "dashboard", "knowledge"];
const TAB_INDEX: Record<string, number> = Object.fromEntries(TAB_KEYS.map((k, i) => [k, i]));

function UsecaseGenPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTabState] = useState(() => {
    const tab = searchParams.get("tab");
    return tab && TAB_INDEX[tab] !== undefined ? TAB_INDEX[tab] : 0;
  });
  const taskId = searchParams.get("taskId") || null;

  const [usecaseTree, setUsecaseTree] = useState<UsecaseModule[] | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && TAB_INDEX[tab] !== undefined) {
      setActiveTabState(TAB_INDEX[tab]);
    }
  }, [searchParams]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  const setActiveTab = useCallback((i: number) => {
    setActiveTabState(i);
    router.replace(`/usecase-gen?tab=${TAB_KEYS[i]}`, { scroll: false });
  }, [router]);

  const skillId = process.env.NEXT_PUBLIC_USECASE_SKILL_ID;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 0 && (
          <div className="max-w-7xl mx-auto w-full">
            <GenerateWizard
              key="generate"
              initialTaskId={null}
              onComplete={(tree) => setUsecaseTree(tree)}
              skillId={skillId}
              onNavigateToTab={setActiveTab}
            />
          </div>
        )}
        {activeTab === 1 &&
          (taskId ? (
            <div className="max-w-7xl mx-auto w-full">
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
            <div className="max-w-4xl mx-auto w-full">
              <HistoryList
                skillId={skillId}
                onSelectTask={(id) => {
                  router.replace(`/usecase-gen?tab=history&taskId=${id}`, { scroll: false });
                }}
                onGoToGenerate={() => setActiveTab(0)}
              />
            </div>
          ))}
        {activeTab === 2 && (
          <div className="max-w-7xl mx-auto w-full">
            <CaseEditor
              data={usecaseTree && usecaseTree.length > 0 ? modulesToMindMap(usecaseTree, "测试用例") : null}
              onSave={async () => {
                // Future iteration: call POST /api/tasks/[id]/save-usecase
              }}
              onExportToKnowledge={async () => {
                // Future iteration: POST to knowledge API
              }}
            />
          </div>
        )}
        {activeTab === 3 && (
          <div className="max-w-7xl mx-auto w-full">
            <Dashboard />
          </div>
        )}
        {activeTab === 4 && (
          <div className="max-w-7xl mx-auto w-full">
            <KnowledgeBase />
          </div>
        )}
      </div>
    </div>
  );
}

export default function UsecaseGenPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-6 text-sm text-muted-foreground">
          加载中...
        </div>
      }
    >
      <UsecaseGenPageContent />
    </Suspense>
  );
}
