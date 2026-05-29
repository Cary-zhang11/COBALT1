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

    // Read LATEST test case markdown (pick _v{N} max) as context
    const outputDir = getOutputPath(taskId);
    let existingOutput = "";
    const tweakRound = (task.tweakCount || 0) + 1;
    try {
      const files = await fs.readdir(outputDir);
      // Pick all matching md files, select the one with highest _v{N}
      let bestMd: string | null = null;
      let bestVersion = -1;
      for (const f of files) {
        if (f.includes("测试用例") && f.endsWith(".md")) {
          const m = f.match(/_v(\d+)\.md$/);
          const v = m ? parseInt(m[1], 10) : 0;
          if (v > bestVersion) { bestVersion = v; bestMd = f; }
        }
      }
      if (bestMd) {
        existingOutput = await fs.readFile(
          path.join(outputDir, bestMd),
          "utf-8"
        );
      }
    } catch {
      // output dir may not exist yet
    }

    const scopeDirective = scope
      ? `\n\n修改范围：仅针对"${scope}"模块`
      : "";

    const namingDirective = `\n\n输出文件名必须使用: *_v${tweakRound}.md 和 *_v${tweakRound}.xmind（不要用原名覆盖已有文件）`;

    const tweakInput = existingOutput
      ? `以下是已生成的测试用例：\n\n${existingOutput}\n\n---\n\n用户微调指令：${instruction}${scopeDirective}${namingDirective}\n\n请在已有测试用例基础上进行修改，保持格式一致，只修改涉及的部分，不要重新生成全部内容。`
      : `${instruction}${scopeDirective}${namingDirective}`;

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
