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

const TICKET_API = "http://10.168.80.25:8771/api/needs/document-urls";
const KB_BASE = "https://doc.autohome.com.cn/docapi/doc";
const KB_COOKIE = "APP_KNOWLEDGE_ltK";

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

/** 从知识库链接中提取 targetId */
function extractTargetId(input: string): string | null {
  try {
    const u = new URL(input);
    const id = u.searchParams.get("targetId");
    if (id) return id.trim();
    // 从路径最后一段提取 ID（如 /page/share/share_xxx）
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (/^[A-Za-z0-9_-]{8,64}$/.test(lastSegment)) return lastSegment;
    }
  } catch { /* not a URL */ }
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{8,64}$/.test(trimmed)) return trimmed;
  return null;
}

/** 判断是否为知识库链接 */
function isKnowledgeLink(url: string): boolean {
  return /zhishi\.autohome\.com\.cn|doc\.autohome\.com\.cn/i.test(url) || !!extractTargetId(url);
}

/** 通过知识库认证下载 */
async function downloadFromKnowledge(targetId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const doDownload = async (cookieValue: string) => {
    const downloadUrl = `${KB_BASE}/download/${encodeURIComponent(targetId)}?k=`;
    return fetch(downloadUrl, {
      method: "GET",
      headers: {
        Cookie: `${KB_COOKIE}=${cookieValue}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*",
        Referer: "https://zhishi.autohome.com.cn/",
      },
      redirect: "follow",
    });
  };

  let { cookie } = await ensureValidCredential();
  let upstream = await doDownload(cookie);

  if (isAuthFailure(upstream)) {
    await clearKnowledgeCredential();
    try {
      cookie = (await refreshCredentialHeadless()) || "";
    } catch { /* ignore */ }
    if (cookie) upstream = await doDownload(cookie);
  }

  if (!upstream.ok || isAuthFailure(upstream)) return null;

  const disposition = upstream.headers.get("Content-Disposition") || "";
  const filename = parseFilename(disposition) || `${targetId}.docx`;
  const buffer = Buffer.from(await upstream.arrayBuffer());
  return { buffer, filename };
}

/** 直接下载 */
async function downloadDirect(url: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    redirect: "follow",
  });
  if (!res.ok) return null;

  const disposition = res.headers.get("Content-Disposition") || "";
  let filename = parseFilename(disposition);
  if (!filename) {
    try {
      const urlPath = new URL(url).pathname;
      filename = path.basename(decodeURIComponent(urlPath)) || `document-${Date.now()}.docx`;
    } catch {
      filename = `document-${Date.now()}.docx`;
    }
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, filename };
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const body = await req.json();
    const ticketUrl = (body.url || "").trim();

    if (!ticketUrl) {
      return NextResponse.json({ error: "缺少工单地址" }, { status: 400 });
    }

    // 1. 调用工单 API 获取需求文档地址和描述
    const apiUrl = `${TICKET_API}?url=${encodeURIComponent(ticketUrl)}`;
    const apiRes = await fetch(apiUrl, { method: "GET" });

    if (!apiRes.ok) {
      return NextResponse.json(
        { error: `获取需求信息失败 (${apiRes.status})` },
        { status: 502 },
      );
    }

    const apiData = await apiRes.json();
    const respData = apiData.data || apiData;
    const documentUrls: string[] = respData.documentUrls || [];
    const description: string = respData.description || "";

    // 2. 下载每个文档
    const uploadsDir = path.join(PROJECT_ROOT, "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const files: { fileName: string; filePath: string }[] = [];
    for (const docUrl of documentUrls) {
      try {
        let result: { buffer: Buffer; filename: string } | null = null;

        if (isKnowledgeLink(docUrl)) {
          const targetId = extractTargetId(docUrl);
          if (targetId) result = await downloadFromKnowledge(targetId);
        } else {
          result = await downloadDirect(docUrl);
        }

        if (!result) {
          console.warn(`[ticket-needs] download failed for ${docUrl}`);
          continue;
        }

        const fileName = `${Date.now()}-${result.filename}`;
        const filePath = path.join(uploadsDir, fileName);
        await writeFile(filePath, result.buffer);
        files.push({ fileName, filePath });
      } catch (err) {
        console.warn(`[ticket-needs] download error for ${docUrl}:`, err);
      }
    }

    return NextResponse.json({ files, description, documentUrls });
  } catch (error) {
    console.error("[ticket-needs] error:", error);
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
