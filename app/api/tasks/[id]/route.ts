import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);
    const task = await prisma.task.findUnique({
      where: { id: params.id },
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

const VALID_BUSINESS_TYPES = ["C1C", "C1B", "C2C", "C2B", "数科", "车小妹"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const body = await req.json();
    const { businessType } = body;

    if (!businessType || !VALID_BUSINESS_TYPES.includes(businessType)) {
      return NextResponse.json(
        { error: "Invalid businessType" },
        { status: 400 }
      );
    }

    const task = await prisma.task.update({
      where: { id: params.id },
      data: { businessType },
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Task patch error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}
