"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Task {
  id: string;
  status: string;
  input: string;
  output: string | null;
  duration: number | null;
  tweakCount?: number;
  createdAt: string;
  hasTestcaseOutput?: boolean;
  skill: { name: string; description: string };
  user?: { name: string | null; username: string | null };
}

export function useTasks(status?: string, skillId?: string) {
  return useQuery<{ tasks: Task[] }>({
    queryKey: ["tasks", status, skillId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (skillId) params.set("skillId", skillId);
      const qs = params.toString();
      const res = await fetch(`/api/tasks${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
  });
}

export type TasksPageParams = {
  skillId?: string;
  search?: string;
  displayStatus?: string;
  page: number;
  pageSize?: number;
};

export type TasksPageResult = {
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
};

export function useTasksPage(params: TasksPageParams) {
  const pageSize = params.pageSize ?? 20;
  return useQuery<TasksPageResult>({
    queryKey: [
      "tasks",
      "page",
      params.skillId,
      params.search,
      params.displayStatus,
      params.page,
      pageSize,
    ],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("page", String(params.page));
      qs.set("pageSize", String(pageSize));
      if (params.skillId) qs.set("skillId", params.skillId);
      if (params.search?.trim()) qs.set("search", params.search.trim());
      if (params.displayStatus) qs.set("displayStatus", params.displayStatus);
      const res = await fetch(`/api/tasks?${qs}`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    enabled: !!params.skillId,
    placeholderData: (prev) => prev,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${id}`);
      if (!res.ok) throw new Error("Failed to fetch task");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      skillId: string;
      input: string;
      uploadedFiles?: string[];
      businessType?: string | null;
    }) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create task");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useExecuteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      taskId: string;
      referenceFiles?: { sourcePath?: string; sourceTaskId?: string; mdFileName?: string; subdir: string; destName: string }[];
    }) => {
      const res = await fetch(`/api/tasks/${input.taskId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceFiles: input.referenceFiles,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to execute task");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useResumeTask() {
  return useMutation({
    mutationFn: async ({
      taskId,
      userReply,
      uploadedFiles,
    }: {
      taskId: string;
      userReply: string;
      uploadedFiles?: string[];
    }) => {
      const res = await fetch(`/api/tasks/${taskId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userReply, uploadedFiles }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to resume task");
      }
      return res.json();
    },
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/tasks/${taskId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to cancel task");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
