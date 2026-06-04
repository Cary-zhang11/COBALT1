import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";

const VALID_STATUSES = ["active", "inactive", "disabled", "locked"] as const;

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { userIds, mobile, email, group, accountStatus, permissions } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds 不能为空" }, { status: 400 });
    }

    // 校验 accountStatus
    if (accountStatus !== undefined && !VALID_STATUSES.includes(accountStatus)) {
      return NextResponse.json(
        { error: `accountStatus 必须是: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // 构建更新字段
    const updateData: any = {};
    if (mobile !== undefined) updateData.mobile = mobile;
    if (email !== undefined) updateData.email = email;
    if (group !== undefined) updateData.group = group;
    if (accountStatus !== undefined) updateData.accountStatus = accountStatus;
    if (permissions !== undefined) updateData.permissions = permissions;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "没有提供要更新的字段" }, { status: 400 });
    }

    const result = await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: updateData,
    });

    return NextResponse.json({
      updatedCount: result.count,
      updatedFields: Object.keys(updateData),
    });
  } catch (err) {
    console.error("Admin batch update error:", err);
    return NextResponse.json({ error: "批量更新失败" }, { status: 500 });
  }
}
