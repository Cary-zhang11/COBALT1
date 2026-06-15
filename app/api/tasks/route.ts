import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { createTask } from "@/lib/task-engine";
import { taskHasTestcaseOutput } from "@/lib/task-display-status";
import { buildTaskListWhere } from "@/lib/task-list-query";

const TASK_LIST_SELECT = {
  id: true,
  status: true,
  input: true,
  duration: true,
  tweakCount: true,
  createdAt: true,
  totalCases: true,
  outputFiles: true,
  report: true,
  skill: { select: { name: true, description: true } },
  user: { select: { name: true, username: true } },
} as const;

function mapTaskRows(
  rows: {
    report: unknown;
    totalCases: number | null;
    outputFiles: string[];
    id: string;
    status: string;
    input: string;
    duration: number | null;
    tweakCount: number;
    createdAt: Date;
    skill: { name: string; description: string };
  }[],
) {
  return rows.map(({ report, totalCases, outputFiles, ...rest }) => ({
    ...rest,
    createdAt: rest.createdAt.toISOString(),
    hasTestcaseOutput: taskHasTestcaseOutput({ totalCases, outputFiles, report }),
  }));
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const skillId = searchParams.get("skillId") || undefined;
    const displayStatus = searchParams.get("displayStatus") || undefined;
    const search = searchParams.get("search") || undefined;
    const filterUserId = searchParams.get("userId") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const pageRaw = searchParams.get("page");
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10);
    const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20));

    const where = buildTaskListWhere({
      skillId,
      status: status || undefined,
      displayStatus,
      search,
      userId: filterUserId,
      dateFrom,
      dateTo,
    });

    if (pageRaw) {
      const page = Math.max(1, parseInt(pageRaw, 10) || 1);
      const [rows, total] = await Promise.all([
        prisma.task.findMany({
          where,
          select: TASK_LIST_SELECT,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.task.count({ where }),
      ]);

      return NextResponse.json({
        tasks: mapTaskRows(rows),
        total,
        page,
        pageSize,
      });
    }

    const rows = await prisma.task.findMany({
      where,
      select: TASK_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tasks: mapTaskRows(rows) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load tasks";
    if (message === "Unauthorized" || message.includes("JWT") || message.includes("jwt") || message.includes("signature")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Tasks list error:", error);
    return NextResponse.json(
      { error: "Failed to load tasks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);
    const { skillId, input, uploadedFiles, businessType } = await req.json();

    if (!skillId || !input) {
      return NextResponse.json(
        { error: "skillId and input required" },
        { status: 400 }
      );
    }

    const taskId = await createTask(userId, skillId, input, uploadedFiles, businessType || null);
    return NextResponse.json({ taskId }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create task";

    // Auth errors should be 401, not 500
    if (message === "Unauthorized" || message.includes("JWT") || message.includes("jwt") || message.includes("signature")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[POST /api/tasks] Error:", message, error instanceof Error ? error.stack : "");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
