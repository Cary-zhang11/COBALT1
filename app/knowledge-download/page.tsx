"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, AlertCircle, XCircle } from "lucide-react";

type Format = "raw" | "md";

const ZHISHI_URL_RE = /zhishi\.autohome\.com\.cn/;
const TARGET_ID_RE = /[?&]targetId=[A-Za-z0-9_-]+/;

export default function KnowledgeDownloadPage() {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<Format>("raw");
  const [customFilename, setCustomFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFilename, setLastFilename] = useState<string | null>(null);

  const inputError = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    // 用户输入的是知识库链接（或看起来是URL）
    if (ZHISHI_URL_RE.test(trimmed) || trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
      if (!TARGET_ID_RE.test(trimmed)) {
        return "链接中缺少 targetId 参数，请确认从知识库页面复制的完整链接";
      }
    }
    return null;
  }, [url]);

  const handleDownload = async () => {
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("请输入知识库文档链接");
      return;
    }

    // 检查是否有 targetId：可能是完整URL，也可能用户直接贴了targetId
    const hasTargetIdInUrl = /[?&]targetId=/.test(trimmed);
    const looksLikeBare = /^[A-Za-z0-9_-]{8,64}$/.test(trimmed);

    if (!hasTargetIdInUrl && !looksLikeBare) {
      if (trimmed.startsWith("http") || trimmed.includes("zhishi.autohome")) {
        setError("链接中缺少 targetId 参数，请确认从知识库页面复制的完整链接");
      } else {
        setError("请输入完整链接（含 targetId=xxx）或直接粘贴 targetId");
      }
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ url: trimmed, format });
      const res = await fetch(`/api/knowledge-doc?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `下载失败 (${res.status})`);
      }

      const disposition = res.headers.get("Content-Disposition") || "";
      const filename =
        customFilename.trim() ||
        parseFilename(disposition) ||
        defaultFilename(trimmed, format);
      setLastFilename(filename);
      const blob = await res.blob();

      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      setError(err?.message || "下载失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">知识库文档下载</h1>
          <p className="text-muted-foreground text-sm mt-1">
            粘贴知识库文档链接，一键下载。凭证失效时会自动使用预配置的账号刷新。
          </p>
        </div>

        <div className="rounded-xl border p-5 space-y-4 bg-card">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              知识库文档链接
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://zhishi.autohome.com.cn/home/teamplace/file?targetId=xxxxxxx"
              className={
                "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 " +
                (inputError ? "border-red-300" : "")
              }
              disabled={loading}
            />
            {inputError ? (
              <div className="flex items-start gap-1.5 mt-1 text-xs text-red-600">
                <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{inputError}</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">
                支持完整链接（含 targetId=xxx）或直接粘贴 targetId
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">格式</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormat("raw")}
                className={
                  "px-4 py-2 text-sm rounded-lg border transition-colors " +
                  (format === "raw"
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "hover:bg-muted")
                }
                disabled={loading}
              >
                原格式
              </button>
              <button
                type="button"
                onClick={() => setFormat("md")}
                className={
                  "px-4 py-2 text-sm rounded-lg border transition-colors " +
                  (format === "md"
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "hover:bg-muted")
                }
                disabled={loading}
              >
                Markdown
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              文件名（可选）
            </label>
            <input
              type="text"
              value={customFilename}
              onChange={(e) => setCustomFilename(e.target.value)}
              placeholder="留空则使用远程返回的文件名"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <div className="text-xs text-muted-foreground mt-1">
              留空时自动从远程接口读取文档原名
              {lastFilename && !customFilename && (
                <span className="text-green-700 ml-1">
                  （上次下载：{lastFilename}）
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={loading || !url.trim() || !!inputError}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                下载中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                下载
              </>
            )}
          </button>
        </div>

        <div className="text-xs text-muted-foreground">
          未配置凭证或需要更新账号密码？前往{" "}
          <a
            href="/admin/knowledge-credential"
            className="text-blue-600 hover:underline"
          >
            凭证管理页
          </a>
          。
        </div>
      </div>
    </div>
  );
}

function parseFilename(disposition: string): string | null {
  // 优先匹配 filename*=UTF-8''<urlencoded>
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // ignore
    }
  }
  // 匹配 filename=<urlencoded> 或 filename="..." 或 filename=...
  const plainMatch = disposition.match(/filename\s*=\s*"?([^";\s]+)"?/i);
  if (plainMatch) {
    const raw = plainMatch[1];
    // 如果值包含 % 开头，说明是 URL 编码的
    if (/%[0-9A-Fa-f]{2}/.test(raw)) {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  return null;
}

function defaultFilename(url: string, format: Format): string {
  try {
    const u = new URL(url);
    const id = u.searchParams.get("targetId") || "document";
    return format === "md" ? `${id}.md` : `${id}.docx`;
  } catch {
    return format === "md" ? "document.md" : "document.bin";
  }
}
