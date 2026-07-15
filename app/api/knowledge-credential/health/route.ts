import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { checkCredentialHealth } from "@/lib/knowledge-capture";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const result = await checkCredentialHealth();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[knowledge-credential/health] error:", err);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
