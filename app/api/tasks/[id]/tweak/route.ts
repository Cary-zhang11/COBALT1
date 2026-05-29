import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOutputPath } from "@/lib/sandbox";
import { startTaskExecution } from "@/lib/task-engine";
import path from "path";
import fs from "fs/promises";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

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

    // Read existing test case markdown output
    const outputDir = getOutputPath(taskId);
    let existingOutput = "";
    try {
      const files = await fs.readdir(outputDir);
      const mdFile = files.find(
        (f) => f.includes("测试用例") && f.endsWith(".md")
      );
      if (mdFile) {
        existingOutput = await fs.readFile(
          path.join(outputDir, mdFile),
          "utf-8"
        );
      }
    } catch {
      // output dir may not exist yet
    }

    const scopeDirective = scope
      ? `\n\n修改范围：仅针对"${scope}"模块`
      : "";

    const tweakInput = existingOutput
      ? `以下是已生成的测试用例：\n\n${existingOutput}\n\n---\n\n用户微调指令：${instruction}${scopeDirective}\n\n请在已有测试用例基础上进行修改，保持格式一致，只修改涉及的部分，不要重新生成全部内容。`
      : `${instruction}${scopeDirective}`;

    // Rename existing files with version suffix so tweaked files coexist
    const tweakRound = (task.tweakCount || 0) + 1;
    try {
      const entries = await fs.readdir(outputDir);
      for (const entry of entries) {
        const oldPath = path.join(outputDir, entry);
        const stat = await fs.stat(oldPath);
        if (stat.isFile()) {
          const ext = path.extname(entry);
          const base = path.basename(entry, ext);
          const newName = `${base}_v${tweakRound}${ext}`;
          await fs.rename(oldPath, path.join(outputDir, newName));
        }
      }
    } catch {
      // output dir may not exist yet
    }

    // Update task input, increment tweak count, and set to running for re-execution
    await prisma.task.update({
      where: { id: taskId },
      data: {
        input: tweakInput,
        status: "running",
        tweakCount: { increment: 1 },
        pauseReason: null,
        pausedAt: null,
      },
    });

    // Start re-execution in background
    startTaskExecution(taskId).catch((err) => {
      console.error("Tweak execution error:", err);
    });

    return NextResponse.json({ accepted: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tweak failed";
    console.error("Tweak error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
