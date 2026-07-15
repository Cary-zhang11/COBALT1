import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  getKnowledgeCredential,
  saveKnowledgeCredential,
  clearKnowledgeCredential,
} from "@/lib/knowledge-credential";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const cred = await getKnowledgeCredential();
    if (!cred) {
      return NextResponse.json({ configured: false });
    }
    const reveal = req.nextUrl.searchParams.get("reveal") === "1";
    return NextResponse.json({
      configured: true,
      source: cred.source,
      updatedAt: cred.updatedAt,
      preview: maskCookie(cred.cookie),
      cookie: reveal ? cred.cookie : undefined,
    });
  } catch (err) {
    console.error("[knowledge-credential] GET error:", err);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const body = await req.json();
    const cookie = typeof body?.cookie === "string" ? body.cookie.trim() : "";
    if (!cookie) {
      return NextResponse.json(
        { error: "cookie is required" },
        { status: 400 }
      );
    }
    const saved = await saveKnowledgeCredential(cookie, "manual");
    return NextResponse.json({
      configured: true,
      source: saved.source,
      updatedAt: saved.updatedAt,
      preview: maskCookie(saved.cookie),
      cookie: saved.cookie,
    });
  } catch (err) {
    console.error("[knowledge-credential] POST error:", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);
    await clearKnowledgeCredential();
    return NextResponse.json({ configured: false });
  } catch (err) {
    console.error("[knowledge-credential] DELETE error:", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}

function maskCookie(cookie: string): string {
  if (cookie.length <= 12) return "***";
  return `${cookie.slice(0, 6)}...${cookie.slice(-4)}`;
}
