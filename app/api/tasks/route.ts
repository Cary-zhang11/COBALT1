import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { createTask } from "@/lib/task-engine";
import { taskHasTestcaseOutput } from "@/lib/task-display-status";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const skillId = searchParams.get("skillId");

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (skillId) where.skillId = skillId;

    const rows = await prisma.task.findMany({
      where,
      select: {
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
      },
      orderBy: { createdAt: "desc" },
    });

    const tasks = rows.map(({ report, totalCases, outputFiles, ...rest }) => ({
      ...rest,
      hasTestcaseOutput: taskHasTestcaseOutput({ totalCases, outputFiles, report }),
    }));

    return NextResponse.json({ tasks });
  } catch (error) {
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
