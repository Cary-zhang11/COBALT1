import type { Browser, BrowserContext } from "playwright";
import { saveKnowledgeCredential, getKnowledgeCredential } from "./knowledge-credential";
import { getKnowledgeAccount } from "./knowledge-account";

const LOGIN_URL =
  "https://sso.corpautohome.com/login?service=https://zhishi.autohome.com.cn/v2/casLogin";
const TARGET_COOKIE_NAME = "APP_KNOWLEDGE_ltK";
const TARGET_COOKIE_DOMAIN = "zhishi.autohome.com.cn";
const POLL_INTERVAL_MS = 1000;
const MAX_WAIT_MS = 10 * 60 * 1000; // 10 分钟内用户必须完成登录

export type CaptureStatus =
  | "idle"
  | "launching"
  | "waiting"
  | "captured"
  | "failed"
  | "cancelled";

interface CaptureSession {
  status: CaptureStatus;
  message: string;
  startedAt: number;
  cookieValue?: string;
  browser?: Browser;
  context?: BrowserContext;
  cancelRequested?: boolean;
}

let currentSession: CaptureSession | null = null;

export function getCaptureStatus(): {
  status: CaptureStatus;
  message: string;
  startedAt: number | null;
} {
  if (!currentSession) {
    return { status: "idle", message: "未开始", startedAt: null };
  }
  return {
    status: currentSession.status,
    message: currentSession.message,
    startedAt: currentSession.startedAt,
  };
}

export async function startCapture(): Promise<{
  status: CaptureStatus;
  message: string;
}> {
  if (
    currentSession &&
    (currentSession.status === "launching" ||
      currentSession.status === "waiting")
  ) {
    return {
      status: currentSession.status,
      message: "抓取任务已在进行中",
    };
  }

  const session: CaptureSession = {
    status: "launching",
    message: "正在启动浏览器...",
    startedAt: Date.now(),
  };
  currentSession = session;

  // 后台异步跑，不阻塞HTTP响应
  runCapture(session).catch((err) => {
    console.error("[knowledge-capture] fatal error:", err);
    session.status = "failed";
    session.message = err?.message || "未知错误";
  });

  return { status: session.status, message: session.message };
}

export async function stopCapture(): Promise<void> {
  if (!currentSession) return;
  currentSession.cancelRequested = true;
  const ctx = currentSession.context;
  const browser = currentSession.browser;
  try {
    if (ctx) await ctx.close();
  } catch {
    // ignore
  }
  try {
    if (browser) await browser.close();
  } catch {
    // ignore
  }
  if (
    currentSession.status === "launching" ||
    currentSession.status === "waiting"
  ) {
    currentSession.status = "cancelled";
    currentSession.message = "已手动停止";
  }
}

async function runCapture(session: CaptureSession): Promise<void> {
  const { chromium } = await import("playwright");

  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: false,
      channel: "chrome",
    });
  } catch (err) {
    // 兜底：不指定channel，让playwright找可用浏览器
    console.warn(
      "[knowledge-capture] launch with channel=chrome failed, retrying without channel:",
      err
    );
    browser = await chromium.launch({ headless: false });
  }
  session.browser = browser;

  const context = await browser.newContext();
  session.context = context;

  const page = await context.newPage();
  session.status = "waiting";
  session.message = "请在弹出的浏览器中完成登录";

  await page.goto(LOGIN_URL);

  // 如果已配置账号密码，自动填入
  const account = await getKnowledgeAccount();
  if (account) {
    try {
      await page.waitForSelector("#username", { timeout: 15000 });
      await page.fill("#username", account.username);
      await page.fill("#ipt_password", account.password);
      session.message = "已自动填入账号，请点击登录或等待自动提交";
      // 尝试自动点击登录
      try {
        await page.click(
          '.login_button-button, input[type="submit"][value="登录"]',
          { timeout: 3000 }
        );
      } catch {
        // 找不到按钮不影响，用户可以手动点
      }
    } catch (err) {
      console.warn("[knowledge-capture] auto-fill failed:", err);
      session.message = "自动填入失败，请手动完成登录";
    }
  }

  const deadline = session.startedAt + MAX_WAIT_MS;
  let captured: string | null = null;

  while (Date.now() < deadline) {
    if (session.cancelRequested) {
      session.status = "cancelled";
      session.message = "已手动停止";
      break;
    }

    const cookies = await context.cookies();
    const target = cookies.find(
      (c) =>
        c.name === TARGET_COOKIE_NAME &&
        (c.domain.endsWith(TARGET_COOKIE_DOMAIN) ||
          c.domain.endsWith("autohome.com.cn"))
    );

    if (target?.value) {
      captured = target.value;
      break;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  try {
    if (captured) {
      session.cookieValue = captured;
      await saveKnowledgeCredential(captured, "auto");
      session.status = "captured";
      session.message = "凭证已保存";
    } else if (session.status !== "cancelled") {
      session.status = "failed";
      session.message = "超时未捕获到凭证，请重试";
    }
  } finally {
    try {
      await context.close();
    } catch {
      // ignore
    }
    try {
      await browser.close();
    } catch {
      // ignore
    }
    session.browser = undefined;
    session.context = undefined;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HEALTH_URL =
  "https://zhishi.autohome.com.cn/v2/web/user/getCurrentUser";
const HEALTH_OK_CODE = 10000;

export interface HealthResult {
  valid: boolean;
  code?: number;
  message: string;
  checkedAt: string;
  autoRefreshed: boolean;
}

export async function checkCredentialHealth(
  cookieValue?: string
): Promise<HealthResult> {
  const cred = cookieValue ? { cookie: cookieValue } : await getKnowledgeCredential();
  if (!cred) {
    return {
      valid: false,
      message: "凭证未配置",
      checkedAt: new Date().toISOString(),
      autoRefreshed: false,
    };
  }

  try {
    // 清理可能的前缀（手动填写时可能把 "APP_KNOWLEDGE_ltK=" 也粘进来了）
    const rawCookie = cred.cookie;
    const cookieValue = rawCookie.startsWith("APP_KNOWLEDGE_ltK=")
      ? rawCookie.slice("APP_KNOWLEDGE_ltK=".length)
      : rawCookie;

    const res = await fetch(HEALTH_URL, {
      method: "POST",
      headers: {
        "AppKey": "newautobots",
        "Cookie": `APP_KNOWLEDGE_ltK=${cookieValue}`,
        "Content-Type": "text/plain",
        "Accept": "application/json, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: HEALTH_URL,
    });
    const json = await res.json().catch(() => ({}));
    const code = json?.code;
    const valid = code === HEALTH_OK_CODE;

    return {
      valid,
      code,
      message: valid
        ? "凭证有效"
        : code != null
        ? `凭证已失效 (code=${code})`
        : `凭证已失效 (status=${res.status})`,
      checkedAt: new Date().toISOString(),
      autoRefreshed: false,
    };
  } catch (err: any) {
    return {
      valid: false,
      message: `健康检查失败: ${err?.message || "网络错误"}`,
      checkedAt: new Date().toISOString(),
      autoRefreshed: false,
    };
  }
}

export async function ensureValidCredential(): Promise<{
  cookie: string;
  refreshed: boolean;
}> {
  const result = await checkCredentialHealth();
  if (result.valid) {
    const cred = await getKnowledgeCredential();
    return { cookie: cred!.cookie, refreshed: false };
  }

  console.log(
    "[knowledge-capture] cookie invalid, auto-refreshing...",
    result.message
  );
  const cookie = await refreshCredentialHeadless();
  if (!cookie) {
    throw new Error("凭证已失效且自动刷新失败，请手动重新登录");
  }
  return { cookie, refreshed: true };
}

let headlessLoginPromise: Promise<string | null> | null = null;

export async function refreshCredentialHeadless(): Promise<string | null> {
  if (headlessLoginPromise) return headlessLoginPromise;
  headlessLoginPromise = doHeadlessLogin().finally(() => {
    headlessLoginPromise = null;
  });
  return headlessLoginPromise;
}

async function doHeadlessLogin(): Promise<string | null> {
  const account = await getKnowledgeAccount();
  if (!account) {
    throw new Error("尚未配置账号密码，无法自动刷新凭证");
  }

  const { chromium } = await import("playwright");
  let browser: Browser | null = null;
  try {
    try {
      browser = await chromium.launch({ headless: true, channel: "chrome" });
    } catch {
      browser = await chromium.launch({ headless: true });
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

    await page.waitForSelector("#username", { timeout: 15000 });
    await page.fill("#username", account.username);
    await page.fill("#ipt_password", account.password);

    await Promise.all([
      page
        .waitForURL((url) => url.host.endsWith("zhishi.autohome.com.cn"), {
          timeout: 30000,
        })
        .catch(() => null),
      page.click('.login_button-button, input[type="submit"][value="登录"]'),
    ]);

    const deadline = Date.now() + 30000;
    let captured: string | null = null;
    while (Date.now() < deadline) {
      const cookies = await context.cookies();
      const target = cookies.find(
        (c) =>
          c.name === TARGET_COOKIE_NAME &&
          (c.domain.endsWith(TARGET_COOKIE_DOMAIN) ||
            c.domain.endsWith("autohome.com.cn"))
      );
      if (target?.value) {
        captured = target.value;
        break;
      }
      await sleep(500);
    }

    if (captured) {
      await saveKnowledgeCredential(captured, "auto");
      return captured;
    }
    return null;
  } finally {
    try {
      if (browser) await browser.close();
    } catch {
      // ignore
    }
  }
}
