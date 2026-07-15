import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  startCapture,
  stopCapture,
  getCaptureStatus,
} from "@/lib/knowledge-capture";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const result = await startCapture();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[knowledge-credential/capture] POST error:", err);
    const message = err instanceof Error ? err.message : "capture failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    await stopCapture();
    return NextResponse.json(getCaptureStatus());
  } catch (err) {
    console.error("[knowledge-credential/capture] DELETE error:", err);
    return NextResponse.json({ error: "stop failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    return NextResponse.json(getCaptureStatus());
  } catch (err) {
    console.error("[knowledge-credential/capture] GET error:", err);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
