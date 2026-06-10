/**
 * 修复历史任务的 dimensionCoverage 数据
 * 旧代码用 ## 匹配但 AI 输出是 ###，导致所有历史数据为空数组
 */
import { PrismaClient } from "@prisma/client";
import { parseTestcaseMarkdown } from "../lib/parse-testcase-md";
import { getOutputPath } from "../lib/sandbox";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    where: { status: { in: ["completed", "paused"] }, report: { not: null } },
    select: { id: true, outputFiles: true },
  });

  console.log(`Found ${tasks.length} tasks to check`);

  let fixed = 0;
  let skipped = 0;

  for (const task of tasks) {
    const outputFiles = (task.outputFiles as string[]) || [];
    const mdFiles = outputFiles.filter(
      (f: string) => f.endsWith(".md") && f.includes("测试用例")
    );
    // 取最高版本
    mdFiles.sort((a, b) => {
      const vA = (a.match(/_v(\d+)/) || [])[1];
      const vB = (b.match(/_v(\d+)/) || [])[1];
      return (vB ? parseInt(vB, 10) : 0) - (vA ? parseInt(vA, 10) : 0);
    });
    const mdFile = mdFiles[0];
    if (!mdFile) {
      console.log(`  SKIP ${task.id.slice(0, 8)}: no MD file`);
      skipped++;
      continue;
    }

    const mdPath = path.join(getOutputPath(task.id), mdFile);
    if (!fs.existsSync(mdPath)) {
      console.log(`  SKIP ${task.id.slice(0, 8)}: file not found`);
      skipped++;
      continue;
    }

    const content = fs.readFileSync(mdPath, "utf-8");
    const parsed = parseTestcaseMarkdown(content);

    if (parsed.dimensions.length > 0) {
      await prisma.task.update({
        where: { id: task.id },
        data: { dimensionCoverage: parsed.dimensions as any },
      });
      console.log(`  FIX  ${task.id.slice(0, 8)}: ${parsed.dimensions.length} dimensions`);
      fixed++;
    } else {
      console.log(`  SKIP ${task.id.slice(0, 8)}: no dimensions in MD`);
      skipped++;
    }
  }

  console.log(`\nDone: fixed=${fixed}, skipped=${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
