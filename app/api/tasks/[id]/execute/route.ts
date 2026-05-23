import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { startTaskExecution } from "@/lib/task-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifyToken(token);

    const result = await prisma.task.updateMany({
      where: { id: params.id, userId, status: "pending" },
      data: { status: "running" },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Task not found or not in pending state" },
        { status: 409 }
      );
    }

    startTaskExecution(params.id).catch((err) => {
      console.error("Task execution error:", err);
    });

    return NextResponse.json({ success: true, status: "running" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
