import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_ENABLED = process.env.AUTH_ENABLED !== "false";

const PUBLIC_PATHS = [
  "/login",
];

/**
 * 给响应加上 CORS 头。dev 时局域网 IP 访问会触发 non-simple preflight，
 * Next 14 的 allowedDevOrigins 只管 HMR 资源，不管 API，需要在这里放行。
 * 生产环境如果需要跨域，也可以借助这里的通用逻辑。
 */
function withCorsHeaders(response: Response, origin: string | null): Response {
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  return response;
}

export default function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");

  // 1. Preflight OPTIONS 直接返回 204，不做鉴权
  if (request.method === "OPTIONS") {
    return withCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  if (!AUTH_ENABLED) {
    return withCorsHeaders(NextResponse.next(), origin);
  }

  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return withCorsHeaders(NextResponse.next(), origin);
  }

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/") && !pathname.startsWith("/api/editor-assets/")) {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return withCorsHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        origin
      );
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

  return withCorsHeaders(NextResponse.next(), origin);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|__nextjs_font|vendor/|editor/|favicon.ico).*)"],
};
