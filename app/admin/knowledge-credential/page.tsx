"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CaptureStatus =
  | "idle"
  | "launching"
  | "waiting"
  | "captured"
  | "failed"
  | "cancelled";

interface CredentialInfo {
  configured: boolean;
  source?: "auto" | "manual";
  updatedAt?: string;
  preview?: string;
  cookie?: string;
}

interface CaptureInfo {
  status: CaptureStatus;
  message: string;
  startedAt: number | null;
}

interface AccountInfo {
  configured: boolean;
  username?: string;
  updatedAt?: string;
}

const LOGIN_URL =
  "https://sso.corpautohome.com/login?service=https://zhishi.autohome.com.cn/v2/casLogin";
const TARGET_COOKIE = "APP_KNOWLEDGE_ltK";

export default function KnowledgeCredentialPage() {
  const [credential, setCredential] = useState<CredentialInfo | null>(null);
  const [capture, setCapture] = useState<CaptureInfo>({
    status: "idle",
    message: "未开始",
    startedAt: null,
  });
  const [manualCookie, setManualCookie] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accountUsername, setAccountUsername] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [revealCookie, setRevealCookie] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [health, setHealth] = useState<{
    checking: boolean;
    valid?: boolean;
    message?: string;
    code?: number;
    checkedAt?: string;
  }>({ checking: false });

  const loadCredential = useCallback(async (reveal = false) => {
    try {
      const url = reveal
        ? "/api/knowledge-credential?reveal=1"
        : "/api/knowledge-credential";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setCredential(data);
    } catch (err: any) {
      setError(err?.message || "加载失败");
    }
  }, []);

  const checkHealth = useCallback(async () => {
    setHealth({ checking: true });
    try {
      const res = await fetch("/api/knowledge-credential/health", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setHealth({ checking: false, ...data });
      } else {
        setHealth({ checking: false, message: "检查失败" });
      }
    } catch {
      setHealth({ checking: false, message: "网络错误" });
    }
  }, []);

  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge-account", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setAccount(data);
      if (data.configured && data.username) {
        setAccountUsername(data.username);
      }
    } catch {
      // 静默
    }
  }, []);

  const loadCaptureStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge-credential/capture", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setCapture(data);
      if (data.status === "captured") {
        loadCredential().then(() => checkHealth());
      }
    } catch {
      // 静默
    }
  }, [loadCredential]);

  useEffect(() => {
    loadCredential().then(() => checkHealth());
    loadCaptureStatus();
    loadAccount();
  }, [loadCredential, loadCaptureStatus, loadAccount, checkHealth]);

  const handleSaveAccount = async () => {
    if (!accountUsername.trim() || !accountPassword) {
      setError("请填写账号和密码");
      return;
    }
    setError(null);
    setSavingAccount(true);
    try {
      const res = await fetch("/api/knowledge-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: accountUsername.trim(),
          password: accountPassword,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "保存失败");
      }
      setAccountPassword("");
      loadAccount();
    } catch (err: any) {
      setError(err?.message || "保存失败");
    } finally {
      setSavingAccount(false);
    }
  };

  const handleClearAccount = async () => {
    if (!confirm("确认清除已保存的账号密码？")) return;
    setError(null);
    try {
      await fetch("/api/knowledge-account", { method: "DELETE" });
      setAccountUsername("");
      setAccountPassword("");
      loadAccount();
    } catch (err: any) {
      setError(err?.message || "清除失败");
    }
  };

  const active =
    capture.status === "launching" || capture.status === "waiting";

  useEffect(() => {
    if (active && !pollingRef.current) {
      pollingRef.current = setInterval(loadCaptureStatus, 1500);
    }
    if (!active && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [active, loadCaptureStatus]);

  const handleStartCapture = async () => {
    setError(null);
    try {
      const res = await fetch("/api/knowledge-credential/capture", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "启动抓取失败");
      }
      const data = await res.json();
      setCapture((prev) => ({
        ...prev,
        status: data.status,
        message: data.message,
      }));
    } catch (err: any) {
      setError(err?.message || "启动抓取失败");
    }
  };

  const handleStopCapture = async () => {
    setError(null);
    try {
      await fetch("/api/knowledge-credential/capture", { method: "DELETE" });
      loadCaptureStatus();
    } catch (err: any) {
      setError(err?.message || "停止失败");
    }
  };

  const handleSaveManual = async () => {
    if (!manualCookie.trim()) return;
    setSavingManual(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: manualCookie.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "保存失败");
      }
      setManualCookie("");
      loadCredential();
    } catch (err: any) {
      setError(err?.message || "保存失败");
    } finally {
      setSavingManual(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("确认清除已保存的凭证？")) return;
    setError(null);
    try {
      await fetch("/api/knowledge-credential", { method: "DELETE" });
      loadCredential();
    } catch (err: any) {
      setError(err?.message || "清除失败");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 pb-12 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">知识库凭证管理</h1>
        <p className="text-muted-foreground text-sm mt-1">
          用于访问汽车之家知识库文档下载接口的登录凭证（
          <code className="text-xs bg-muted px-1 py-0.5 rounded">
            {TARGET_COOKIE}
          </code>
          ）
        </p>
      </div>

      {/* 凭证状态卡片 */}
      <div
        className={
          "rounded-xl border p-4 " +
          (credential?.configured
            ? "border-green-200 bg-green-50/60"
            : "border-yellow-200 bg-yellow-50/60")
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div
              className={
                "font-semibold " +
                (credential?.configured ? "text-green-700" : "text-yellow-700")
              }
            >
              {credential?.configured ? "凭证已配置" : "凭证未配置"}
            </div>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {credential?.configured && (
                <>
                  <div>
                    来源：{credential.source === "auto" ? "浏览器抓取" : "手动填写"}
                  </div>
                  {credential.updatedAt && (
                    <div>
                      更新时间：
                      {new Date(credential.updatedAt).toLocaleString("zh-CN")}
                    </div>
                  )}
                  <div className="flex items-start gap-2 pt-1">
                    <span className="whitespace-nowrap">APP_KNOWLEDGE_ltK：</span>
                    <div className="flex-1 min-w-0">
                      <code className="block text-[11px] font-mono break-all bg-white/70 border rounded px-2 py-1">
                        {revealCookie && credential.cookie
                          ? credential.cookie
                          : credential.preview}
                      </code>
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={async () => {
                            if (revealCookie) {
                              setRevealCookie(false);
                            } else {
                              await loadCredential(true);
                              setRevealCookie(true);
                            }
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {revealCookie ? "隐藏" : "显示完整值"}
                        </button>
                        <button
                          onClick={async () => {
                            let value = credential.cookie;
                            if (!value) {
                              const res = await fetch(
                                "/api/knowledge-credential?reveal=1",
                                { cache: "no-store" }
                              );
                              const data = await res.json();
                              value = data.cookie;
                            }
                            if (value) {
                              try {
                                await navigator.clipboard.writeText(value);
                                setCopyHint("已复制到剪贴板");
                                setTimeout(() => setCopyHint(null), 2000);
                              } catch {
                                setCopyHint("复制失败，请手动选中");
                                setTimeout(() => setCopyHint(null), 2000);
                              }
                            }
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          复制
                        </button>
                        {copyHint && (
                          <span className="text-xs text-green-700">
                            {copyHint}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 健康状态 */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-xs text-muted-foreground">
                      状态：
                    </span>
                    {health.checking ? (
                      <span className="text-xs text-muted-foreground">
                        检测中…
                      </span>
                    ) : health.valid ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        有效
                      </span>
                    ) : health.message ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        {health.code != null
                          ? `失效 (code=${health.code})`
                          : "失效"}
                      </span>
                    ) : null}
                    <button
                      onClick={() => checkHealth()}
                      disabled={health.checking}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                    >
                      重新检测
                    </button>
                  </div>
                </>
              )}
              {!credential?.configured && (
                <div>请通过下方「打开登录页抓取」或「手动填写」配置凭证</div>
              )}
            </div>
          </div>
          {credential?.configured && (
            <button
              onClick={handleClear}
              className="px-3 py-1.5 text-xs border rounded hover:bg-muted"
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* 账号密码预配置卡片 */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">预配置账号密码</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              保存后，凭证失效时系统会自动使用此账号 headless 登录并刷新 cookie
            </div>
          </div>
          {account?.configured && (
            <button
              onClick={handleClearAccount}
              className="px-3 py-1.5 text-xs border rounded hover:bg-muted"
            >
              清除
            </button>
          )}
        </div>

        {account?.configured && (
          <div className="text-xs text-muted-foreground">
            当前账号：<span className="font-mono">{account.username}</span>
            {account.updatedAt && (
              <>
                {" · "}更新于{" "}
                {new Date(account.updatedAt).toLocaleString("zh-CN")}
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="OA 账号"
            value={accountUsername}
            onChange={(e) => setAccountUsername(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            autoComplete="off"
          />
          <input
            type="password"
            placeholder={
              account?.configured ? "留空则保留原密码（点击保存则覆盖）" : "OA 密码"
            }
            value={accountPassword}
            onChange={(e) => setAccountPassword(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            autoComplete="new-password"
          />
        </div>

        <div className="flex justify-between items-center">
          <div className="text-[11px] text-muted-foreground">
            仅本地存储于{" "}
            <code className="bg-muted/60 px-1 rounded">
              data/knowledge-account.json
            </code>
            ，请勿在多用户共享的机器上使用
          </div>
          <button
            onClick={handleSaveAccount}
            disabled={savingAccount || !accountUsername.trim() || !accountPassword}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {savingAccount ? "保存中..." : "保存账号"}
          </button>
        </div>
      </div>

      {/* 抓取配置卡片 */}
      <div className="rounded-xl border p-4 space-y-4">
        <div>
          <div className="text-sm font-medium mb-1">登录页面</div>
          <div className="text-xs text-muted-foreground break-all bg-muted/40 px-3 py-2 rounded border">
            {LOGIN_URL}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium mb-1">目标 Cookie 名</div>
          <div className="text-xs bg-muted/40 px-3 py-2 rounded border font-mono">
            {TARGET_COOKIE}
          </div>
        </div>

        <div className="text-xs bg-blue-50 border border-blue-200 rounded px-3 py-2 text-blue-800">
          自动抓取流程：点击「打开登录页抓取」→ 在弹出浏览器中完成登录 →
          系统自动从浏览器 Cookie 中捕获 {TARGET_COOKIE} 并保存。
        </div>

        {/* 状态条 */}
        <div className="text-xs">
          <span className="text-muted-foreground">抓取状态：</span>
          <span
            className={
              "font-medium " +
              (capture.status === "captured"
                ? "text-green-700"
                : capture.status === "failed"
                ? "text-red-700"
                : capture.status === "waiting" ||
                  capture.status === "launching"
                ? "text-blue-700"
                : "text-gray-700")
            }
          >
            {statusLabel(capture.status)}
          </span>
          <span className="text-muted-foreground ml-2">{capture.message}</span>
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleStartCapture}
            disabled={active}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {active ? "抓取中..." : "打开登录页抓取"}
          </button>
          <button
            onClick={handleStopCapture}
            disabled={!active}
            className="px-4 py-2 text-sm border rounded hover:bg-muted disabled:opacity-50"
          >
            停止抓取
          </button>
        </div>
      </div>

      {/* 手动填写卡片 */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="text-sm font-medium">手动填写凭证（可选）</div>
        <textarea
          className="w-full border rounded px-3 py-2 text-xs font-mono resize-y min-h-[80px]"
          placeholder={`粘贴 ${TARGET_COOKIE} 的值，如：kl_root_xxxxxxxxx_0`}
          value={manualCookie}
          onChange={(e) => setManualCookie(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            onClick={handleSaveManual}
            disabled={!manualCookie.trim() || savingManual}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {savingManual ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function statusLabel(status: CaptureStatus): string {
  switch (status) {
    case "idle":
      return "未开始";
    case "launching":
      return "启动浏览器中";
    case "waiting":
      return "等待用户登录";
    case "captured":
      return "已捕获";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}
