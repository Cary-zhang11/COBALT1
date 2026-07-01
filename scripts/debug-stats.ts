import { prisma } from "@/lib/prisma";

async function main() {
  const allTasks = await prisma.task.findMany({
    select: { id: true, status: true, totalCases: true, tokenUsage: true, duration: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  console.log("=== 各任务关键字段 ===");
  for (const t of allTasks) {
    console.log(
      `  id=${t.id.slice(0, 8)} status=${t.status}` +
      ` totalCases=${t.totalCases}` +
      ` tokenUsage=${t.tokenUsage}` +
      ` duration=${t.duration}` +
      ` createdAt=${t.createdAt.toISOString()}`
    );
  }

  const sumCases = allTasks.reduce((s, t) => s + (t.totalCases || 0), 0);
  const sumTokens = allTasks.reduce((s, t) => s + (t.tokenUsage || 0), 0);
  const sumDuration = allTasks.reduce((s, t) => s + (t.duration || 0), 0);
  console.log("\n=== 合计 ===");
  console.log("  totalCases 合计:", sumCases);
  console.log("  tokenUsage 合计:", sumTokens);
  console.log("  duration 合计:", sumDuration, "ms =", (sumDuration / 60000).toFixed(1), "分钟");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
