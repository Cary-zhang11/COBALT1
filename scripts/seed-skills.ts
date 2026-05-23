import "dotenv/config";
import { syncBuiltInSkillsToDB } from "../lib/skill-registry";

async function main() {
  console.log("正在同步 .claude/skills/ 内置技能到数据库...");
  await syncBuiltInSkillsToDB();
  console.log("完成！");
}

main()
  .catch((err) => {
    console.error("同步失败:", err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
