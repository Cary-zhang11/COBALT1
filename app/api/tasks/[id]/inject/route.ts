import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSandboxPath } from "@/lib/sandbox";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs/promises";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const taskId = params.id;
    const { instruction, scope } = await req.json();

    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json(
        { error: "instruction is required" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const fullInstruction = scope
      ? `${instruction}\n\n[Scope: 仅针对"${scope}"模块]`
      : instruction;

    const sandboxDir = getSandboxPath(taskId);
    const injectFile = path.join(sandboxDir, ".inject");
    await fs.appendFile(injectFile, `${fullInstruction}\n`, "utf-8");

    return NextResponse.json({ accepted: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Inject failed";
    console.error("Inject error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
