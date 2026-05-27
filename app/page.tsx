"use client";

import { useTasks } from "@/hooks/use-tasks";
import { useRouter } from "next/navigation";
import { Clock, CheckCircle2, AlertCircle, Loader2, Plus } from "lucide-react";
import Link from "next/link";

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "等待中", color: "text-yellow-600 bg-yellow-50", icon: Clock },
  running: { label: "执行中", color: "text-blue-600 bg-blue-50", icon: Loader2 },
  paused: { label: "已暂停", color: "text-orange-600 bg-orange-50", icon: Clock },
  completed: { label: "已完成", color: "text-green-600 bg-green-50", icon: CheckCircle2 },
  failed: { label: "失败", color: "text-red-600 bg-red-50", icon: AlertCircle },
  cancelled: { label: "已取消", color: "text-gray-600 bg-gray-50", icon: AlertCircle },
};

export default function DashboardPage() {
  const { data, isLoading } = useTasks();
  const router = useRouter();
  const tasks = data?.tasks || [];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">任务列表</h1>
            <p className="text-muted-foreground text-sm mt-1">
              管理你的所有执行任务
            </p>
          </div>
          <Link
            href="/tasks/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建任务
          </Link>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-16 bg-muted/30 rounded-xl border border-dashed">
            <p className="text-muted-foreground mb-4">暂无任务</p>
            <Link
              href="/tasks/new"
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              创建第一个任务 →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const config = statusConfig[task.status] || statusConfig.pending;
              const Icon = config.icon;
              return (
                <div
                  key={task.id}
                  onClick={() => {
                    if (task.status === "completed" || task.status === "failed") {
                      router.push(`/tasks/${task.id}/result`);
                    } else {
                      router.push(`/tasks/${task.id}/execute`);
                    }
                  }}
                  className="flex items-center gap-4 p-4 bg-card border rounded-xl hover:shadow-md transition-all cursor-pointer"
                >
                  <div className={`p-2 rounded-lg ${config.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{task.skill.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {task.input.slice(0, 80)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
                      {config.label}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(task.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
