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

    const feedback = await prisma.taskFeedback.findFirst({
      where: { taskId: params.id, userId },
      orderBy: { createdAt: "desc" },
      select: { rating: true, comment: true },
    });

    if (!feedback) {
      return NextResponse.json({ rating: null, comment: null });
    }

    return NextResponse.json({
      rating: feedback.rating,
      comment: feedback.comment,
    });
  } catch (error) {
    console.error("Feedback GET error:", error);
    return NextResponse.json(
      { error: "Failed to load feedback" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);
    const { rating, comment } = await req.json();

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be 1-5" },
        { status: 400 }
      );
    }

    const feedback = await prisma.taskFeedback.create({
      data: {
        taskId: params.id,
        userId,
        rating,
        comment: comment || null,
      },
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Feedback failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
