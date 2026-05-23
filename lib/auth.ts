import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-me"
);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: {
  userId: string;
  email: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

const AUTH_ENABLED = process.env.AUTH_ENABLED !== "false";
const ANONYMOUS_USER = { userId: "anonymous", email: "anonymous@local" };

export async function verifyToken(
  token: string
): Promise<{ userId: string; email: string }> {
  if (!AUTH_ENABLED) {
    return ANONYMOUS_USER;
  }
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    clockTolerance: 60,
  });
  return payload as unknown as { userId: string; email: string };
}

/**
 * 从请求中提取用户身份。AUTH 关闭时返回匿名用户（自动 upsert 到数据库），不抛错。
 */
export async function getAuthUser(
  token: string | undefined
): Promise<{ userId: string; email: string }> {
  if (!AUTH_ENABLED) {
    await prisma.user.upsert({
      where: { id: ANONYMOUS_USER.userId },
      update: {},
      create: {
        id: ANONYMOUS_USER.userId,
        email: ANONYMOUS_USER.email,
        name: "Anonymous",
        passwordHash: "",
      },
    });
    return ANONYMOUS_USER;
  }
  if (!token) {
    throw new Error("Unauthorized");
  }
  return verifyToken(token);
}
