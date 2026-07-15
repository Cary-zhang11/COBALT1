import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { clearKnowledgeCredential } from "@/lib/knowledge-credential";
import {
  ensureValidCredential,
  refreshCredentialHeadless,
} from "@/lib/knowledge-capture";

export const dynamic = "force-dynamic";

const BASE = "https://doc.autohome.com.cn/docapi/doc";
const TARGET_COOKIE = "APP_KNOWLEDGE_ltK";
const TARGET_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const urlParam = req.nextUrl.searchParams.get("url")?.trim() || "";
    const targetIdParam =
      req.nextUrl.searchParams.get("targetId")?.trim() || "";
    const formatParam = req.nextUrl.searchParams.get("format") || "raw";
    const format = formatParam === "md" ? "md" : "raw";

    const targetId = urlParam
      ? extractTargetIdFromUrl(urlParam)
      : targetIdParam;

    if (!targetId) {
      return NextResponse.json(
        { error: "缺少 targetId 或无法从 url 中解析出 targetId" },
        { status: 400 }
      );
    }
    if (!TARGET_ID_RE.test(targetId)) {
      return NextResponse.json(
        { error: "targetId 格式非法" },
        { status: 400 }
      );
    }

    const doDownload = async (cookieValue: string) => {
      const url =
        format === "md"
          ? `${BASE}/download_md/${encodeURIComponent(targetId)}?k=`
          : `${BASE}/download/${encodeURIComponent(targetId)}?k=`;
      console.log("[knowledge-doc] downloading:", url);
      return fetch(url, {
        method: "GET",
        headers: {
          Cookie: `${TARGET_COOKIE}=${cookieValue}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
          Accept: "*/*",
          Referer: "https://zhishi.autohome.com.cn/",
        },
        redirect: "follow",
      });
    };

    // 1. 先健康检查 / 自动刷新拿到有效 cookie
    let { cookie, refreshed } = await ensureValidCredential();
    let upstream = await doDownload(cookie);

    // 2. 兜底：下载接口返回认证失败时，再清理重试一次
    if (isAuthFailure(upstream)) {
      await clearKnowledgeCredential();
      try {
        cookie = (await refreshCredentialHeadless()) || "";
        refreshed = true;
      } catch {
        // ignore
      }
      if (cookie) {
        upstream = await doDownload(cookie);
      }
    }

    if (!upstream.ok || isAuthFailure(upstream)) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        {
          error: `远程返回 ${upstream.status}${
            isAuthFailure(upstream) ? "（凭证可能已失效）" : ""
          }`,
          detail: text.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("Content-Type") || "application/octet-stream";
    const upstreamDisposition = upstream.headers.get("Content-Disposition") || "";

    console.log("[knowledge-doc] Content-Disposition:", upstreamDisposition || "(empty)");

    const contentDisposition =
      upstreamDisposition ||
      `attachment; filename="${targetId}.${format === "md" ? "md" : "bin"}"`;

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      },
    });
  } catch (err) {
    console.error("[knowledge-doc] GET error:", err);
    const message = err instanceof Error ? err.message : "download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractTargetIdFromUrl(input: string): string | null {
  try {
    const u = new URL(input);
    const id = u.searchParams.get("targetId");
    return id ? id.trim() : null;
  } catch {
    return null;
  }
}

function isAuthFailure(res: Response): boolean {
  if (res.status === 401 || res.status === 403) return true;
  const ct = res.headers.get("Content-Type") || "";
  // CAS 未登录时通常302到登录页，fetch follow后落到html登录页
  if (res.status === 200 && ct.includes("text/html")) return true;
  return false;
}
