import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrate() {
  console.log("Starting migration: backfill totalCases and qualityScore...");

  const tasks = await prisma.task.findMany({
    where: {
      totalCases: null,
      report: { not: Prisma.DbNull },
    },
    select: { id: true, report: true },
  });

  let updated = 0;
  for (const task of tasks) {
    const report = task.report as Record<string, unknown> | null;
    const summary = report?.summary as Record<string, unknown> | undefined;
    if (!summary) continue;

    const totalCases = typeof summary.totalCases === "number" ? summary.totalCases : null;
    const qualityScore = typeof summary.qualityScore === "number" ? summary.qualityScore : null;
    const dimensions = (report?.dimensions as Record<string, unknown>[]) || null;

    await prisma.task.update({
      where: { id: task.id },
      data: {
        totalCases,
        qualityScore,
        dimensionCoverage: dimensions as unknown[],
      },
    });
    updated++;
  }

  console.log(`Migration complete: ${updated} tasks updated.`);
}

migrate()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
