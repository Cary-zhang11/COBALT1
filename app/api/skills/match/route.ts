import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { matchSkills } from "@/lib/skill-matcher";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);
    const { input } = await req.json();

    if (!input) {
      return NextResponse.json(
        { error: "input required" },
        { status: 400 }
      );
    }

    const result = await matchSkills(userId, input);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Match failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
