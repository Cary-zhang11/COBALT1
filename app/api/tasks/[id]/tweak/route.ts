import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resumeTask } from "@/lib/task-engine";
import { sanitizeEntry, type TweakEntry } from "@/lib/tweak-history";

export const dynamic = "force-dynamic";
import { Prisma } from "@prisma/client";

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
    if (!task.sessionId) {
      return NextResponse.json(
        { error: "Task has no active session" },
        { status: 400 }
      );
    }

    const tweakRound = (task.tweakCount || 0) + 1;

    // Build resume instruction — session already has full history,
    // just send the tweak directive + file naming constraint
    const scopeDirective = scope
      ? `\n\n修改范围：仅针对"${scope}"模块`
      : "";
    const namingDirective = `\n\n输出文件名必须使用: *_v${tweakRound}.md 和 *_v${tweakRound}.xmind（不要用原名覆盖已有文件）`;
    const resumeInput = `用户微调指令：${instruction}${scopeDirective}${namingDirective}\n\n请在已有测试用例基础上进行修改，保持格式一致，只修改涉及的部分，不要重新生成全部内容。`;

    // Build tweak history entry
    const existingHistory = (task.tweakHistory as Array<Record<string, unknown>>) || [];
    const newEntry = sanitizeEntry({
      round: tweakRound,
      instruction,
      time: new Date().toLocaleString("zh-CN"),
      delta: scope ? `模块: ${scope}` : "全部模块",
      status: "running",
    }) as unknown as Record<string, unknown>;
    existingHistory.push(newEntry);

    // Update task: increment tweak count, save history, set running
    await prisma.task.update({
      where: { id: taskId },
      data: {
        input: resumeInput,
        status: "running",
        tweakCount: { increment: 1 },
        tweakHistory: existingHistory as Prisma.InputJsonValue,
        pauseReason: null,
        pausedAt: null,
      },
    });

    // Resume existing session — CLI sees full interaction history
    resumeTask(taskId, resumeInput).catch((err) => {
      console.error("Tweak resume error:", err);
    });

    return NextResponse.json({
      accepted: true,
      round: tweakRound,
      tweakHistory: existingHistory,
    }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tweak failed";
    console.error("Tweak error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    const taskId = params.id;
    const { round, updates, expectedStatus } = await req.json();

    if (!round || !updates) {
      return NextResponse.json(
        { error: "round and updates required" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const history = (task.tweakHistory as Array<Record<string, unknown>>) || [];
    const idx = history.findIndex((e) => e.round === round);

    if (idx < 0) {
      return NextResponse.json(
        { error: "Tweak entry not found" },
        { status: 404 }
      );
    }

    // Optimistic lock: if expectedStatus provided, check it matches current
    if (expectedStatus !== undefined) {
      if (history[idx].status !== expectedStatus) {
        return NextResponse.json(
          { conflict: true, current: history[idx] },
          { status: 409 }
        );
      }
    }

    history[idx] = sanitizeEntry({ ...history[idx], ...updates } as TweakEntry) as unknown as Record<string, unknown>;
    await prisma.task.update({
      where: { id: taskId },
      data: { tweakHistory: history as Prisma.InputJsonValue },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Tweak PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update tweak entry" },
      { status: 500 }
    );
  }
}
