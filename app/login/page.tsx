"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

type QRStatus = "loading" | "pending" | "scanned" | "success" | "expired" | "error";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore();
  const [qrImage, setQrImage] = useState("");
  const [status, setStatus] = useState<QRStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const uuidRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const generateQR = useCallback(async () => {
    setStatus("loading");
    setQrImage("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/qr/generate");
      console.log("[Login] QR generate response:", res.status, res.statusText);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error("[Login] QR generate failed:", errBody);
        throw new Error(errBody.error || "生成二维码失败");
      }
      const data = await res.json();
      console.log("[Login] QR generated, uuid:", data.uuid);
      uuidRef.current = data.uuid;
      setQrImage(data.qrBase64);
      setStatus("pending");
      startPolling(data.uuid);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "生成二维码失败");
    }
  }, []);

  const startPolling = (uuid: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/auth/qr/check?uuid=${encodeURIComponent(uuid)}`
        );
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 10) {
          setStatus("pending");
        } else if (data.status === 20) {
          setStatus("scanned");
        } else if (data.status === 30) {
          setStatus("success");
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (data.user) setUser(data.user);
          const redirect = searchParams.get("redirect") || "/";
          router.push(redirect);
        } else if (data.status === 50) {
          setStatus("expired");
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        // 网络错误不中断轮询
      }
    }, 2000);
  };

  useEffect(() => {
    console.log("[Login] useEffect fired, calling generateQR...");
    generateQR();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [generateQR]);

  const statusText: Record<QRStatus, string> = {
    loading: "正在加载二维码...",
    pending: "请使用汽车人扫描二维码登录",
    scanned: "已扫码，请在手机上确认",
    success: "登录成功，正在跳转...",
    expired: "二维码已过期",
    error: errorMsg || "加载失败",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">COBALT</h1>
            <p className="text-gray-500 mt-2">汽车人扫码登录</p>
          </div>

          <div className="flex flex-col items-center">
            {status === "loading" && !qrImage ? (
              <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                <p className="text-gray-400 text-sm">加载中...</p>
              </div>
            ) : (
              <div className="relative">
                <img
                  src={qrImage}
                  alt="登录二维码"
                  className="w-64 h-64 rounded-lg"
                />
                {(status === "scanned" || status === "success") && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                    <p className="text-blue-600 font-medium text-lg">
                      {status === "success" ? "登录成功" : "已扫码"}
                    </p>
                  </div>
                )}
              </div>
            )}

            <p
              className={`mt-4 text-sm ${
                status === "error" || status === "expired"
                  ? "text-red-500"
                  : status === "success"
                  ? "text-green-600"
                  : "text-gray-500"
              }`}
            >
              {statusText[status]}
            </p>

            {status === "expired" && (
              <button
                onClick={generateQR}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                刷新二维码
              </button>
            )}

            {status === "error" && (
              <button
                onClick={generateQR}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                重试
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center animate-pulse">
          <p className="text-gray-400 text-sm">加载中...</p>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
