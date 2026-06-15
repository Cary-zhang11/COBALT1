import { Prisma } from "@prisma/client";

/** 历史列表展示态 → Prisma where（与 task-display-status 口径一致） */
export function buildTaskListWhere(options: {
  skillId?: string;
  /** 原始 DB status（兼容旧调用） */
  status?: string;
  /** 历史页展示态：active | paused | completed | failed */
  displayStatus?: string;
  search?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};

  if (options.skillId) {
    where.skillId = options.skillId;
  }

  if (options.search?.trim()) {
    where.input = { contains: options.search.trim(), mode: "insensitive" };
  }

  if (options.userId) {
    where.userId = options.userId;
  }

  if (options.dateFrom || options.dateTo) {
    where.createdAt = {};
    if (options.dateFrom) {
      where.createdAt.gte = new Date(options.dateFrom);
    }
    if (options.dateTo) {
      where.createdAt.lte = new Date(options.dateTo + "T23:59:59.999Z");
    }
  }

  if (options.displayStatus) {
    switch (options.displayStatus) {
      case "active":
        where.status = { in: ["running", "pending"] };
        break;
      case "failed":
        where.status = "failed";
        break;
      case "cancelled":
        where.status = "cancelled";
        break;
      case "completed":
        where.OR = [
          { status: "completed" },
          {
            status: "paused",
            OR: [
              { totalCases: { gt: 0 } },
              { report: { not: Prisma.DbNull } },
            ],
          },
        ];
        break;
      case "paused":
        where.status = "paused";
        where.NOT = {
          OR: [
            { totalCases: { gt: 0 } },
            { report: { not: Prisma.DbNull } },
          ],
        };
        break;
      default:
        break;
    }
  } else if (options.status) {
    where.status = options.status;
  }

  return where;
}
