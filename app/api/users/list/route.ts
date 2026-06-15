import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    // Return users who have created knowledge or tasks (for filter dropdowns)
    const users = await prisma.user.findMany({
      where: {
        accountStatus: "active",
        OR: [
          { knowledge: { some: {} } },
          { tasks: { some: {} } },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
      },
      orderBy: { name: "asc" },
      distinct: ["id"],
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Users list error:", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
