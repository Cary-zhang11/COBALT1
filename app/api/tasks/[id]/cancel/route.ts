import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { cancelTask } from "@/lib/task-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);
    await cancelTask(params.id);

    return NextResponse.json({ success: true, status: "cancelled" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cancel failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
