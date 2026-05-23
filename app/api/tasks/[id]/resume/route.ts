import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { resumeTask } from "@/lib/task-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await verifyToken(token);
    const { userReply } = await req.json();

    if (!userReply) {
      return NextResponse.json(
        { error: "userReply required" },
        { status: 400 }
      );
    }

    resumeTask(params.id, userReply).catch((err) => {
      console.error("Task resume error:", err);
    });

    return NextResponse.json({ success: true, status: "running" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Resume failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
