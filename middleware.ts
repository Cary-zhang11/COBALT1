import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_ENABLED = process.env.AUTH_ENABLED !== "false";

const PUBLIC_PATHS = [
  "/login",
];

export function middleware(request: NextRequest) {
  if (!AUTH_ENABLED) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next") &&
    pathname !== "/favicon.ico"
  ) {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
