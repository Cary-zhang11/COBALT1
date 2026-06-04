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
  return new SignJWT(payload as unknown as Record<string, unknown>)
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
      update: { username: "anonymous", accountStatus: "active" },
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
