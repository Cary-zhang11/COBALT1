import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resumeTask } from "@/lib/task-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);
    const { userReply, uploadedFiles } = await req.json();

    if (!userReply) {
      return NextResponse.json(
        { error: "userReply required" },
        { status: 400 }
      );
    }

    // Persist user message as a log entry
    const logCount = await prisma.taskLog.count({
      where: { taskId: params.id },
    });
    await prisma.taskLog.create({
      data: {
        taskId: params.id,
        sequence: logCount + 1,
        type: "user_input",
        output: userReply,
      },
    });

    await resumeTask(params.id, userReply, uploadedFiles);

    return NextResponse.json({ success: true, status: "running" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Resume failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
