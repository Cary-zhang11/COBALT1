import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);
    const task = await prisma.task.findFirst({
      where: { id: params.id, userId },
      include: {
        skill: true,
        logs: { orderBy: { sequence: "asc" } },
        feedback: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Task detail error:", error);
    return NextResponse.json(
      { error: "Failed to load task" },
      { status: 500 }
    );
  }
}
