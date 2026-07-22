import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

const QR_BASE_URL = process.env.QR_BASE_URL || "https://app.corpautohome.com/newautobots/qr";

// 二维码状态码
const QR_STATUS = {
  PENDING: 10,
  SCANNED: 20,
  SUCCESS: 30,
  EXPIRED: 50,
} as const;

export async function GET(req: NextRequest) {
  try {
    const uuid = req.nextUrl.searchParams.get("uuid");
    if (!uuid) {
      return NextResponse.json({ error: "uuid 参数不能为空" }, { status: 400 });
    }

    // 1. 调用外部 API 检查扫码状态
    const checkRes = await fetch(
      `${QR_BASE_URL}/check?uuid=${encodeURIComponent(uuid)}`,
      { signal: AbortSignal.timeout(10000), cache: "no-store" }
    );

    if (!checkRes.ok) {
      console.error("[QR Check] External API HTTP error:", checkRes.status, checkRes.statusText);
      return NextResponse.json({ error: "外部 API 请求失败" }, { status: 502 });
    }

    const checkResult = await checkRes.json();
    console.log("[QR Check] External API response:", JSON.stringify(checkResult));

    if (checkResult.code !== 200 || checkResult.status !== 1) {
      const msg = checkResult.info || checkResult.message || "API 返回错误";
      console.error("[QR Check] External API business error:", msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const returnObject = checkResult.returnObject || {};
    const status: number = returnObject.status;
    const externalToken: string | undefined = returnObject.token;

    // 2. 非成功状态直接返回
    if (status !== QR_STATUS.SUCCESS || !externalToken) {
      return NextResponse.json({ status }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    // 3. 扫码成功：调用 validateTokenIoa 获取用户信息
    console.log("[QR Check] Scan success, validating token...");
    const validateRes = await fetch(
      `${QR_BASE_URL}/validateTokenIoa?token=${encodeURIComponent(externalToken)}`,
      { method: "POST", signal: AbortSignal.timeout(10000) }
    );

    if (!validateRes.ok) {
      console.error("[QR Check] validateTokenIoa HTTP error:", validateRes.status);
      return NextResponse.json({ error: "Token 验证失败" }, { status: 502 });
    }

    const validateResult = await validateRes.json();
    console.log("[QR Check] validateTokenIoa response:", JSON.stringify(validateResult));

    if (validateResult.code !== 200 || validateResult.status !== 1) {
      console.error("[QR Check] validateTokenIoa business error:", validateResult);
      return NextResponse.json({ error: "Token 验证失败" }, { status: 401 });
    }

    const rawInfo = validateResult.returnObject || {};

    // 4. 字段映射
    const username: string | undefined = rawInfo.adAccount;
    if (!username) {
      return NextResponse.json({ error: "用户信息缺少 username" }, { status: 400 });
    }

    const avatar = rawInfo.photoUrl || null;
    const name = rawInfo.displayName || username;
    const email = rawInfo.email || null;
    const mobile = rawInfo.mobile || null;

    // 其余字段存入 extras
    const extras: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawInfo)) {
      if (!["adAccount", "photoUrl", "displayName", "email", "mobile"].includes(key)) {
        extras[key] = value;
      }
    }

    // 5. Upsert 用户
    console.log("[QR Check] Upserting user:", { username, name, email, mobile });
    let user;
    try {
      user = await prisma.user.upsert({
        where: { username },
        update: {
          avatar: avatar || undefined,
          mobile: mobile || undefined,
          email: email || undefined,
          extras: Object.keys(extras).length > 0 ? extras : undefined,
          name,
        },
        create: {
          username,
          name,
          avatar,
          email,
          mobile,
          extras: Object.keys(extras).length > 0 ? extras : undefined,
          accountStatus: "active",
        },
      });
    } catch (dbErr: any) {
      console.error("[QR Check] DB upsert error:", dbErr?.message, dbErr?.code);
      throw dbErr;
    }
    console.log("[QR Check] User upserted:", user.id, user.username);

    // 6. 检查账户状态
    if (user.accountStatus !== "active") {
      return NextResponse.json(
        { error: "账户已被禁用，请联系管理员" },
        { status: 403 }
      );
    }

    // 7. 签发 JWT 并设置 cookie
    const jwt = await createToken({
      userId: user.id,
      username: user.username || undefined,
      email: user.email || undefined,
    });

    const response = NextResponse.json({
      status: QR_STATUS.SUCCESS,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        group: user.group,
        permissions: user.permissions,
        accountStatus: user.accountStatus,
      },
    });

    // 内网局域网常以 HTTP 访问，不能仅按 NODE_ENV 开 secure，
    // 改为根据实际请求协议动态判断
    const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
    const isSecure = proto === "https";

    response.cookies.set("token", jwt, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("[QR Check] Unexpected error:", err?.message || err);
    return NextResponse.json({ error: `扫码检查失败: ${err?.message || "未知错误"}` }, { status: 500 });
  }
}
