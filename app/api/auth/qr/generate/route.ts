import { NextResponse } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

const QR_BASE_URL = process.env.QR_BASE_URL || "https://app.corpautohome.com/newautobots/qr";

export async function GET() {
  try {
    // 1. 调用外部 API 生成二维码
    const res = await fetch(`${QR_BASE_URL}/generate`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[QR Generate] External API HTTP error:", res.status, res.statusText);
      return NextResponse.json(
        { error: "外部 API 请求失败" },
        { status: 502 }
      );
    }

    const result = await res.json();
    console.log("[QR Generate] External API response:", JSON.stringify(result).slice(0, 200));

    if (result.code !== 200 || result.status !== 1) {
      const msg = result.info || result.message || "API 返回错误";
      console.error("[QR Generate] Business error:", msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const returnObject = result.returnObject || {};
    const uuid = returnObject.uuid;
    const status = returnObject.status;

    if (!uuid) {
      return NextResponse.json(
        { error: "二维码生成失败：未返回 uuid" },
        { status: 502 }
      );
    }

    // 2. 拼接扫码 URL 并生成 base64 图片
    const qrUrl = `https://app.corpautohome.com/newautobots/qr/confirm?uuid=${uuid}`;
    const qrBase64 = await QRCode.toDataURL(qrUrl, {
      type: "image/png",
      width: 256,
      margin: 2,
    });

    return NextResponse.json({ uuid, qrBase64, status }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    console.error("[QR Generate] Unexpected error:", err?.message || err, err?.cause || "");
    return NextResponse.json(
      { error: `二维码生成失败: ${err?.message || "未知错误"}` },
      { status: 500 }
    );
  }
}
