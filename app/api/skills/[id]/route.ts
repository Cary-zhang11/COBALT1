import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const skill = await prisma.skill.findUnique({
      where: { id: params.id },
      include: {
        versions: { orderBy: { createdAt: "desc" } },
        _count: { select: { tasks: true } },
      },
    });

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    return NextResponse.json({ skill });
  } catch (error) {
    console.error("Skill detail error:", error);
    return NextResponse.json(
      { error: "Failed to load skill" },
      { status: 500 }
    );
  }
}
