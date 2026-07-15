import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  getKnowledgeAccount,
  saveKnowledgeAccount,
  clearKnowledgeAccount,
} from "@/lib/knowledge-account";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const account = await getKnowledgeAccount();
    if (!account) {
      return NextResponse.json({ configured: false });
    }
    return NextResponse.json({
      configured: true,
      username: account.username,
      updatedAt: account.updatedAt,
    });
  } catch (err) {
    console.error("[knowledge-account] GET error:", err);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const body = await req.json();
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "username 和 password 必填" },
        { status: 400 }
      );
    }

    const saved = await saveKnowledgeAccount(username, password);
    return NextResponse.json({
      configured: true,
      username: saved.username,
      updatedAt: saved.updatedAt,
    });
  } catch (err) {
    console.error("[knowledge-account] POST error:", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);
    await clearKnowledgeAccount();
    return NextResponse.json({ configured: false });
  } catch (err) {
    console.error("[knowledge-account] DELETE error:", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
