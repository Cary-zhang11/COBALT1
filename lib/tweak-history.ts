import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export interface TweakEntry {
  round: number;
  instruction: string;
  time: string;
  delta: string;
  status: "running" | "done" | "failed";
  summary?: string;
}

/**
 * 返回 tweakHistory 中最后一个 status === "running" 的条目。
 * 纯函数，前后端共享逻辑。
 */
export function findRunningTweakEntry(
  history: TweakEntry[]
): TweakEntry | undefined {
  const running = history.filter((e) => e.status === "running");
  if (running.length === 0) return undefined;
  running.sort((a, b) => b.round - a.round);
  return running[0];
}

/**
 * 将指定 round 的 tweakHistory 条目标为 "done"。
 * 使用 spread 保留已有字段（如前端已写入的 summary）。
 */
export async function markTweakEntryDone(
  taskId: string,
  round: number,
  summary?: string
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { tweakHistory: true },
  });
  if (!task?.tweakHistory) return;

  const history = (task.tweakHistory as TweakEntry[]).map((e) =>
    e.round === round
      ? { ...e, status: "done" as const, ...(summary !== undefined ? { summary } : {}) }
      : e
  );

  await prisma.task.update({
    where: { id: taskId },
    data: { tweakHistory: history as Prisma.InputJsonValue },
  });
}

/**
 * 将指定 round 的 tweakHistory 条目标为 "failed"。
 * 可选的 error 信息写入 summary 字段。
 */
export async function markTweakEntryFailed(
  taskId: string,
  round: number,
  error?: string
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { tweakHistory: true },
  });
  if (!task?.tweakHistory) return;

  const history = (task.tweakHistory as TweakEntry[]).map((e) =>
    e.round === round
      ? { ...e, status: "failed" as const, ...(error ? { summary: error } : {}) }
      : e
  );

  await prisma.task.update({
    where: { id: taskId },
    data: { tweakHistory: history as Prisma.InputJsonValue },
  });
}
