# 企业微信扫码登录融合 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 api_user.py 的企业微信扫码登录 + 用户管理功能完整移植到 Cobalt Next.js 项目

**Architecture:** JWT 认证 + 企业微信扫码登录。扫码成功后 upsert User 表、签发 JWT 写入 httpOnly cookie。Middleware 做无状态 JWT 验证，API route 层查 DB 检查权限和状态。

**Tech Stack:** Next.js 14, Prisma, jose (JWT), qrcode (QR 图片生成), Tailwind CSS, Zustand

---

## Task 1: Prisma Schema 变更 & 依赖管理

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `.env`
- Modify: `package.json` (via npm)

- [ ] **Step 1: 安装 qrcode 依赖**

```bash
npm install qrcode
npm install -D @types/qrcode
```

- [ ] **Step 2: 卸载 bcryptjs 依赖**

```bash
npm uninstall bcryptjs
```

注意：`@types/bcryptjs` 不在 devDependencies 中，无需单独卸载。

- [ ] **Step 3: 修改 Prisma schema**

在 `prisma/schema.prisma` 中修改 User 模型：

```prisma
model User {
  id            String   @id @default(uuid())
  email         String?  @unique
  name          String?
  avatar        String?
  passwordHash  String   @default("")

  username      String?  @unique
  mobile        String?
  group         String?
  permissions   Json?
  accountStatus String   @default("active")
  extras        Json?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tasks         Task[]
  skills        Skill[]
  feedbacks     TaskFeedback[]
  knowledge     Knowledge[]
}
```

- [ ] **Step 4: 更新 .env 环境变量**

在 `.env` 末尾添加：

```env
ADMIN_USERS=jingjiejie
QR_BASE_URL=https://app.corpautohome.com/newautobots/qr
```

- [ ] **Step 5: 运行 Prisma migration**

```bash
npx prisma generate
npx prisma migrate dev --name add-qr-auth-fields
```

- [ ] **Step 6: 验证编译**

```bash
npx tsc --noEmit
```

Expected: 可能有 bcryptjs 相关错误（旧代码引用），下一步修复。

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma .env package.json package-lock.json prisma/migrations/
git commit -m "chore: update Prisma schema, deps for QR auth"
```

---

## Task 2: 核心 Auth 工具重构

**Files:**
- Modify: `lib/auth.ts`
- Create: `lib/admin.ts`

- [ ] **Step 1: 重写 lib/auth.ts**

完整替换 `lib/auth.ts`：

```typescript
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-me"
);

interface JwtPayload {
  userId: string;
  username?: string;
  email?: string;
}

export async function createToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

const AUTH_ENABLED = process.env.AUTH_ENABLED !== "false";
const ANONYMOUS_USER: JwtPayload = {
  userId: "anonymous",
  username: "anonymous",
  email: "anonymous@local",
};

export async function verifyToken(token: string): Promise<JwtPayload> {
  if (!AUTH_ENABLED) {
    return ANONYMOUS_USER;
  }
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    clockTolerance: 60,
  });
  return payload as unknown as JwtPayload;
}

export async function getAuthUser(
  token: string | undefined
): Promise<JwtPayload> {
  if (!AUTH_ENABLED) {
    await prisma.user.upsert({
      where: { id: ANONYMOUS_USER.userId },
      update: {},
      create: {
        id: ANONYMOUS_USER.userId,
        email: ANONYMOUS_USER.email,
        name: "Anonymous",
        username: "anonymous",
        passwordHash: "",
        accountStatus: "active",
      },
    });
    return ANONYMOUS_USER;
  }
  if (!token) {
    throw new Error("Unauthorized");
  }
  return verifyToken(token);
}
```

关键变更：
- 删除 `bcryptjs` import、`hashPassword`、`verifyPassword`
- `JwtPayload` 接口包含 `username?`、`email?`
- 匿名用户 upsert 增加 `username`、`accountStatus` 字段

- [ ] **Step 2: 创建 lib/admin.ts**

```typescript
const ADMIN_USERS = (process.env.ADMIN_USERS || "").split(",").filter(Boolean);

export function isAdmin(user: {
  username?: string | null;
  permissions?: any;
}): boolean {
  if (user.username && ADMIN_USERS.includes(user.username)) return true;
  if (user.permissions?.is_admin) return true;
  return false;
}
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit
```

Expected: 登录/注册路由仍有 bcryptjs 引用错误（下一步删除）。

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts lib/admin.ts
git commit -m "feat: rewrite auth utils for JWT-only, add admin helper"
```

---

## Task 3: Middleware 更新

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: 更新 PUBLIC_PATHS**

在 `middleware.ts` 中修改 `PUBLIC_PATHS` 数组：

```typescript
const PUBLIC_PATHS = [
  "/login",
];
```

移除 `/register`、`/api/auth/register`、`/api/auth/login`。

QR 路由 `/api/auth/qr/*` 属于 `/api/auth/` 前缀，已被现有逻辑 `!pathname.startsWith("/api/auth/")` 自动跳过，无需添加。

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: update middleware PUBLIC_PATHS for QR auth"
```

---

## Task 4: 删除旧认证代码

**Files:**
- Delete: `app/api/auth/login/route.ts`
- Delete: `app/api/auth/register/route.ts`
- Delete: `app/register/page.tsx`

- [ ] **Step 1: 删除文件**

```bash
git rm app/api/auth/login/route.ts
git rm app/api/auth/register/route.ts
git rm app/register/page.tsx
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

Expected: PASS（login page 引用 register 链接，但 Link 组件不会导致编译错误）。

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove email/password auth routes and register page"
```

---

## Task 5: QR Generate API

**Files:**
- Create: `app/api/auth/qr/generate/route.ts`

- [ ] **Step 1: 创建 QR 生成接口**

```typescript
import { NextResponse } from "next/server";
import QRCode from "qrcode";

const QR_BASE_URL = process.env.QR_BASE_URL || "https://app.corpautohome.com/newautobots/qr";

export async function GET() {
  try {
    // 1. 调用外部 API 生成二维码
    const res = await fetch(`${QR_BASE_URL}/generate`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "外部 API 请求失败" },
        { status: 502 }
      );
    }

    const result = await res.json();

    if (result.code !== 200 || result.status !== 1) {
      const msg = result.info || result.message || "API 返回错误";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const returnObject = result.returnObject || {};
    const uuid = returnObject.uuid;
    const status = returnObject.status;

    if (!uuid) {
      return NextResponse.json(
        { error: "二维码生成失败：未返回 uuid" },
        { status: 502 }
      );
    }

    // 2. 拼接扫码 URL 并生成 base64 图片
    const qrUrl = `https://app.corpautohome.com/newautobots/qr/confirm?uuid=${uuid}`;
    const qrBase64 = await QRCode.toDataURL(qrUrl, {
      type: "image/png",
      width: 256,
      margin: 2,
    });

    return NextResponse.json({ uuid, qrBase64, status });
  } catch (err) {
    console.error("QR generate error:", err);
    return NextResponse.json(
      { error: "二维码生成失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/qr/generate/route.ts
git commit -m "feat: add QR code generate API route"
```

---

## Task 6: QR Check API（核心登录逻辑）

**Files:**
- Create: `app/api/auth/qr/check/route.ts`

- [ ] **Step 1: 创建 QR 状态检查接口**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";

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
      { signal: AbortSignal.timeout(10000) }
    );

    if (!checkRes.ok) {
      return NextResponse.json({ error: "外部 API 请求失败" }, { status: 502 });
    }

    const checkResult = await checkRes.json();

    if (checkResult.code !== 200 || checkResult.status !== 1) {
      const msg = checkResult.info || checkResult.message || "API 返回错误";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const returnObject = checkResult.returnObject || {};
    const status: number = returnObject.status;
    const externalToken: string | undefined = returnObject.token;

    // 2. 非成功状态直接返回
    if (status !== QR_STATUS.SUCCESS || !externalToken) {
      return NextResponse.json({ status });
    }

    // 3. 扫码成功：调用 validateTokenIoa 获取用户信息
    const validateRes = await fetch(
      `${QR_BASE_URL}/validateTokenIoa?token=${encodeURIComponent(externalToken)}`,
      { method: "POST", signal: AbortSignal.timeout(10000) }
    );

    if (!validateRes.ok) {
      return NextResponse.json({ error: "Token 验证失败" }, { status: 502 });
    }

    const validateResult = await validateRes.json();

    if (validateResult.code !== 200 || validateResult.status !== 1) {
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
    const user = await prisma.user.upsert({
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
      username: user.username,
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

    response.cookies.set("token", jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("QR check error:", err);
    return NextResponse.json({ error: "扫码检查失败" }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/qr/check/route.ts
git commit -m "feat: add QR check API with user upsert and JWT login"
```

---

## Task 7: Auth Store 更新

**Files:**
- Modify: `stores/auth-store.ts`

- [ ] **Step 1: 扩展 User 接口**

完整替换 `stores/auth-store.ts`：

```typescript
import { create } from "zustand";

interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  username: string | null;
  group: string | null;
  permissions: any;
  accountStatus: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    set({ user: null });
    window.location.href = "/login";
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add stores/auth-store.ts
git commit -m "feat: extend auth store User interface for QR auth"
```

---

## Task 8: Auth Provider 适配

**Files:**
- Modify: `components/auth-provider.tsx`

- [ ] **Step 1: 更新 /me 返回结构适配**

`components/auth-provider.tsx` 的 `/api/auth/me` 调用逻辑不变（仍然 fetch + setUser），但需要确认 `/api/auth/me` 路由返回的字段与新的 User 接口匹配。当前 `/api/auth/me` 路由返回 `{ user: { id, email, name, avatar } }`，需要扩展。

修改 `app/api/auth/me/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        username: true,
        group: true,
        permissions: true,
        accountStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
```

`components/auth-provider.tsx` 本身无需修改。

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/me/route.ts
git commit -m "feat: extend /me endpoint with QR auth user fields"
```

---

## Task 9: 登录页重写（扫码登录）

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: 完整重写登录页**

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

type QRStatus = "loading" | "pending" | "scanned" | "success" | "expired" | "error";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [qrImage, setQrImage] = useState("");
  const [status, setStatus] = useState<QRStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const uuidRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const generateQR = useCallback(async () => {
    setStatus("loading");
    setQrImage("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/qr/generate");
      if (!res.ok) throw new Error("生成二维码失败");
      const data = await res.json();
      uuidRef.current = data.uuid;
      setQrImage(data.qrBase64);
      setStatus("pending");
      startPolling(data.uuid);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "生成二维码失败");
    }
  }, []);

  const startPolling = (uuid: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/auth/qr/check?uuid=${encodeURIComponent(uuid)}`
        );
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 10) {
          setStatus("pending");
        } else if (data.status === 20) {
          setStatus("scanned");
        } else if (data.status === 30) {
          setStatus("success");
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (data.user) setUser(data.user);
          router.push("/");
        } else if (data.status === 50) {
          setStatus("expired");
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        // 网络错误不中断轮询
      }
    }, 2000);
  };

  useEffect(() => {
    generateQR();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [generateQR]);

  const statusText: Record<QRStatus, string> = {
    loading: "正在加载二维码...",
    pending: "请使用企业微信扫描二维码登录",
    scanned: "已扫码，请在手机上确认",
    success: "登录成功，正在跳转...",
    expired: "二维码已过期",
    error: errorMsg || "加载失败",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">COBALT</h1>
            <p className="text-gray-500 mt-2">企业微信扫码登录</p>
          </div>

          <div className="flex flex-col items-center">
            {status === "loading" && !qrImage ? (
              <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                <p className="text-gray-400 text-sm">加载中...</p>
              </div>
            ) : (
              <div className="relative">
                <img
                  src={qrImage}
                  alt="登录二维码"
                  className="w-64 h-64 rounded-lg"
                />
                {(status === "scanned" || status === "success") && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                    <p className="text-blue-600 font-medium text-lg">
                      {status === "success" ? "登录成功" : "已扫码"}
                    </p>
                  </div>
                )}
              </div>
            )}

            <p
              className={`mt-4 text-sm ${
                status === "error" || status === "expired"
                  ? "text-red-500"
                  : status === "success"
                  ? "text-green-600"
                  : "text-gray-500"
              }`}
            >
              {statusText[status]}
            </p>

            {status === "expired" && (
              <button
                onClick={generateQR}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                刷新二维码
              </button>
            )}

            {status === "error" && (
              <button
                onClick={generateQR}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                重试
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: rewrite login page with QR code scanning"
```

---

## Task 10: Admin Users API

**Files:**
- Create: `app/api/admin/users/route.ts`

- [ ] **Step 1: 创建用户列表接口**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";

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
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/users/route.ts
git commit -m "feat: add admin users list API"
```

---

## Task 11: Admin Batch Update API

**Files:**
- Create: `app/api/admin/users/batch-update/route.ts`

- [ ] **Step 1: 创建批量更新接口**

```typescript
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
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/users/batch-update/route.ts
git commit -m "feat: add admin batch update API"
```

---

## Task 12: 侧边栏更新

**Files:**
- Modify: `components/sidebar.tsx`

- [ ] **Step 1: 添加管理员可见的"用户管理"入口**

在 `components/sidebar.tsx` 中：

1. 在 import 中添加 `Users` icon：

```typescript
import {
  LayoutDashboard,
  LogOut,
  Cpu,
  Wand2,
  FileText,
  Clock,
  BarChart3,
  BookOpen,
  Users,
} from "lucide-react";
```

2. 在组件中读取 user 并判断管理员权限，在 navItems 后动态添加：

```typescript
const ADMIN_USERS = (process.env.NEXT_PUBLIC_ADMIN_USERS || "").split(",").filter(Boolean);

function useIsAdmin(user: { username?: string | null; permissions?: any }) {
  if (user?.username && ADMIN_USERS.includes(user.username)) return true;
  if (user?.permissions?.is_admin) return true;
  return false;
}
```

3. 在 `Sidebar` 组件中，在 `navItems.map` 渲染后添加管理员入口：

```tsx
const showAdmin = useIsAdmin(user);

// 在 nav 内的 navItems.map 后添加：
{showAdmin && (
  <>
    <div className="my-2 border-t" />
    <Link
      href="/admin/users"
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
        pathname.startsWith("/admin")
          ? "bg-blue-50 text-blue-700 shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Users className={cn(
        "w-4 h-4 transition-colors",
        pathname.startsWith("/admin") ? "text-blue-600" : "text-muted-foreground"
      )} />
      用户管理
    </Link>
  </>
)}
```

注意：`ADMIN_USERS` 需要暴露为 `NEXT_PUBLIC_ADMIN_USERS` 环境变量（因为 sidebar 是 client component）。同步在 `.env` 中添加 `NEXT_PUBLIC_ADMIN_USERS=jingjiejie`。

- [ ] **Step 2: 更新 .env**

```env
NEXT_PUBLIC_ADMIN_USERS=jingjiejie
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/sidebar.tsx .env
git commit -m "feat: add admin users link to sidebar"
```

---

## Task 13: 用户管理页面

**Files:**
- Create: `app/admin/users/page.tsx`

- [ ] **Step 1: 创建用户管理页面**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  avatar: string | null;
  mobile: string | null;
  group: string | null;
  permissions: any;
  accountStatus: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500",
  inactive: "bg-gray-400",
  disabled: "bg-red-500",
  locked: "bg-yellow-500",
};

const STATUS_LABELS: Record<string, string> = {
  active: "正常",
  inactive: "未激活",
  disabled: "已禁用",
  locked: "已锁定",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: authLoading } = useAuthStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (keyword) params.set("keyword", keyword);
      if (groupFilter) params.set("group", groupFilter);
      if (statusFilter) params.set("accountStatus", statusFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.status === 403) {
        router.push("/");
        return;
      }
      if (!res.ok) throw new Error("获取用户列表失败");
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, groupFilter, statusFilter, router]);

  useEffect(() => {
    if (!authLoading) fetchUsers();
  }, [authLoading, fetchUsers]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === users.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.id)));
    }
  };

  const batchUpdate = async (updates: Record<string, any>) => {
    if (selected.size === 0) return;
    try {
      const res = await fetch("/api/admin/users/batch-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected), ...updates }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "批量更新失败");
        return;
      }
      setSelected(new Set());
      fetchUsers();
    } catch {
      alert("批量更新失败");
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">用户管理</h1>

      {/* 搜索和筛选 */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="搜索用户名、手机号、邮箱..."
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm w-64 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={groupFilter}
          onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm outline-none"
        >
          <option value="">全部用户组</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm outline-none"
        >
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="inactive">未激活</option>
          <option value="disabled">已禁用</option>
          <option value="locked">已锁定</option>
        </select>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selected.size === users.length && users.length > 0}
                  onChange={selectAll}
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">用户名</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">邮箱</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">用户组</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">状态</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">注册时间</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                  />
                </td>
                <td className="px-4 py-3">{u.username || u.name || "-"}</td>
                <td className="px-4 py-3 text-gray-500">{u.email || "-"}</td>
                <td className="px-4 py-3">{u.group || "-"}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[u.accountStatus] || "bg-gray-400"}`} />
                    {STATUS_LABELS[u.accountStatus] || u.accountStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  暂无用户数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 批量操作 + 分页 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 items-center">
          {selected.size > 0 && (
            <>
              <span className="text-sm text-gray-500">已选 {selected.size} 项</span>
              <button
                onClick={() => batchUpdate({ accountStatus: "active" })}
                className="px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded border hover:bg-green-100"
              >
                启用
              </button>
              <button
                onClick={() => batchUpdate({ accountStatus: "disabled" })}
                className="px-3 py-1.5 text-xs bg-red-50 text-red-700 rounded border hover:bg-red-100"
              >
                禁用
              </button>
              <button
                onClick={() => batchUpdate({ accountStatus: "locked" })}
                className="px-3 py-1.5 text-xs bg-yellow-50 text-yellow-700 rounded border hover:bg-yellow-100"
              >
                锁定
              </button>
            </>
          )}
        </div>
        <div className="flex gap-2 items-center text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 border rounded disabled:opacity-50"
          >
            上一页
          </button>
          <span>{page} / {totalPages || 1}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 border rounded disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/users/page.tsx
git commit -m "feat: add admin users management page"
```

---

## Task 14: 最终编译验证 & 清理

**Files:**
- All modified files

- [ ] **Step 1: 全量编译检查**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2: Next.js build 检查**

```bash
npm run build
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 检查是否有残留的 bcryptjs 引用**

搜索项目源码中是否有 `bcryptjs`、`hashPassword`、`verifyPassword` 的引用（`node_modules` 除外）。

- [ ] **Step 4: 检查 login 页面是否还有注册链接**

确认 `app/login/page.tsx` 中没有指向 `/register` 的链接。

- [ ] **Step 5: 最终 commit**

```bash
git add -A
git commit -m "feat: complete enterprise QR auth integration"
```
