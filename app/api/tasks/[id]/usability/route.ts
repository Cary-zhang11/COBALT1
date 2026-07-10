import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const task = await prisma.task.findUnique({
      where: { id: params.id },
      select: {
        usabilityRate: true,
        reviewDuration: true,
        manualDuration: true,
        duration: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({
      usabilityRate: task.usabilityRate,
      reviewDuration: task.reviewDuration,
      manualDuration: task.manualDuration,
      // AI 生成耗时：DB 存储的是毫秒，前端展示按分钟
      aiDurationMinutes: task.duration != null
        ? Math.max(0, Math.round(task.duration / 60000))
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load review data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);
    const body = await req.json();

    const data: {
      usabilityRate?: number;
      reviewDuration?: number;
      manualDuration?: number;
    } = {};

    if (body.usabilityRate !== undefined) {
      if (typeof body.usabilityRate !== "number" || body.usabilityRate < 0 || body.usabilityRate > 100) {
        return NextResponse.json(
          { error: "usabilityRate must be 0-100" },
          { status: 400 }
        );
      }
      data.usabilityRate = body.usabilityRate;
    }

    if (body.reviewDuration !== undefined) {
      if (typeof body.reviewDuration !== "number" || body.reviewDuration < 0) {
        return NextResponse.json(
          { error: "reviewDuration must be a non-negative number" },
          { status: 400 }
        );
      }
      data.reviewDuration = body.reviewDuration;
    }

    if (body.manualDuration !== undefined) {
      if (typeof body.manualDuration !== "number" || body.manualDuration < 0) {
        return NextResponse.json(
          { error: "manualDuration must be a non-negative number" },
          { status: 400 }
        );
      }
      data.manualDuration = body.manualDuration;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.task.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({
      usabilityRate: updated.usabilityRate,
      reviewDuration: updated.reviewDuration,
      manualDuration: updated.manualDuration,
      aiDurationMinutes: updated.duration != null
        ? Math.max(0, Math.round(updated.duration / 60000))
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save review data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
