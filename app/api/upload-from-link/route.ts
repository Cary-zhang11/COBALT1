import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getAuthUser } from "@/lib/auth";
import { clearKnowledgeCredential } from "@/lib/knowledge-credential";
import {
  ensureValidCredential,
  refreshCredentialHeadless,
} from "@/lib/knowledge-capture";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

export const dynamic = "force-dynamic";

const BASE = "https://doc.autohome.com.cn/docapi/doc";
const TARGET_COOKIE = "APP_KNOWLEDGE_ltK";
const TARGET_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function extractTargetId(input: string): string | null {
  // 尝试从完整 URL 中提取
  try {
    const u = new URL(input);
    const id = u.searchParams.get("targetId");
    if (id) return id.trim();
  } catch {
    // not a URL, continue
  }
  // 尝试直接作为 targetId
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{8,64}$/.test(trimmed)) return trimmed;
  return null;
}

function isAuthFailure(res: Response): boolean {
  if (res.status === 401 || res.status === 403) return true;
  const ct = res.headers.get("Content-Type") || "";
  if (res.status === 200 && ct.includes("text/html")) return true;
  return false;
}

function parseFilename(disposition: string): string | null {
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try { return decodeURIComponent(utf8Match[1]); } catch { /* ignore */ }
  }
  const plainMatch = disposition.match(/filename\s*=\s*"?([^";\s]+)"?/i);
  if (plainMatch) {
    const raw = plainMatch[1];
    if (/%[0-9A-Fa-f]{2}/.test(raw)) {
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
    return raw;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const body = await req.json();
    const url = (body.url || "").trim();
    const format = body.format === "md" ? "md" : "raw";

    if (!url) {
      return NextResponse.json({ error: "缺少文档链接" }, { status: 400 });
    }

    const targetId = extractTargetId(url);
    if (!targetId || !TARGET_ID_RE.test(targetId)) {
      return NextResponse.json(
        { error: "无法从链接中解析出 targetId，请确认链接格式正确" },
        { status: 400 }
      );
    }

    // 下载逻辑：复用 knowledge-doc 的认证 + 下载流程
    const doDownload = async (cookieValue: string) => {
      const downloadUrl =
        format === "md"
          ? `${BASE}/download_md/${encodeURIComponent(targetId)}?k=`
          : `${BASE}/download/${encodeURIComponent(targetId)}?k=`;
      return fetch(downloadUrl, {
        method: "GET",
        headers: {
          Cookie: `${TARGET_COOKIE}=${cookieValue}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "*/*",
          Referer: "https://zhishi.autohome.com.cn/",
        },
        redirect: "follow",
      });
    };

    let { cookie } = await ensureValidCredential();
    let upstream = await doDownload(cookie);

    // 认证失败时重试一次
    if (isAuthFailure(upstream)) {
      await clearKnowledgeCredential();
      try {
        cookie = (await refreshCredentialHeadless()) || "";
      } catch { /* ignore */ }
      if (cookie) {
        upstream = await doDownload(cookie);
      }
    }

    if (!upstream.ok || isAuthFailure(upstream)) {
      return NextResponse.json(
        { error: `远程下载失败 (${upstream.status})，请确认链接有效且凭证已配置` },
        { status: 502 }
      );
    }

    // 解析文件名
    const disposition = upstream.headers.get("Content-Disposition") || "";
    const remoteFilename = parseFilename(disposition) || `${targetId}.${format === "md" ? "md" : "docx"}`;

    // 读取文件内容并保存到 uploads
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const uploadsDir = path.join(PROJECT_ROOT, "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const fileName = `${Date.now()}-${remoteFilename}`;
    const filePath = path.join(uploadsDir, fileName);
    await writeFile(filePath, buffer);

    return NextResponse.json({ filePath, fileName });
  } catch (error) {
    console.error("[upload-from-link] error:", error);
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
