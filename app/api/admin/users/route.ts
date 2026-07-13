import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });

    if (!currentUser || currentUser.accountStatus !== "active") {
      return NextResponse.json({ error: "账户已禁用" }, { status: 403 });
    }
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20")));
    const keyword = sp.get("keyword");
    const group = sp.get("group");
    const accountStatus = sp.get("accountStatus");
    const username = sp.get("username");

    const where: any = {};
    if (username) where.username = { contains: username, mode: "insensitive" };
    if (group) where.group = group;
    if (accountStatus) where.accountStatus = accountStatus;
    if (keyword) {
      where.OR = [
        { username: { contains: keyword, mode: "insensitive" } },
        { mobile: { contains: keyword, mode: "insensitive" } },
        { email: { contains: keyword, mode: "insensitive" } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          avatar: true,
          mobile: true,
          group: true,
          permissions: true,
          accountStatus: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({ total, page, pageSize, users });
  } catch (err) {
    console.error("Admin users list error:", err);
    return NextResponse.json({ error: "获取用户列表失败" }, { status: 500 });
  }
}
