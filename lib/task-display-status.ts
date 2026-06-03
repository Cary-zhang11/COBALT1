/** 是否已产出可解析的测试用例（与 saveOutputAndReport / 向导 Step2 口径一致） */
export function taskHasTestcaseOutput(task: {
  totalCases?: number | null;
  outputFiles?: string[];
  report?: unknown;
}): boolean {
  if (task.totalCases != null && task.totalCases > 0) return true;

  if (
    task.outputFiles?.some(
      (f) => f.includes("测试用例") && f.toLowerCase().endsWith(".md"),
    )
  ) {
    return true;
  }

  const report = task.report as { tree?: unknown } | null | undefined;
  if (report?.tree) return true;

  return false;
}

/** 历史列表展示态：CLI 为 paused 但已有用例 MD 时展示为已完成 */
export function getDisplayStatus(
  rawStatus: string,
  hasTestcaseOutput: boolean,
): string {
  if (rawStatus === "paused" && hasTestcaseOutput) return "completed";
  return rawStatus;
}
