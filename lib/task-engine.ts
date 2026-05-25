import { prisma } from "./prisma";
import { cliRuntime } from "./claude-cli-runtime";
import { getOutputPath, copyFilesToWorkspace } from "./sandbox";
import type { AgentEvent } from "./agent-runtime";
import fs from "fs/promises";
import path from "path";

const runtime = cliRuntime;

export async function createTask(
  userId: string,
  skillId: string,
  input: string,
  uploadedFiles?: string[]
): Promise<string> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!skill) throw new Error("Skill not found");
  if (skill.versions.length === 0) throw new Error("No skill version available");

  const latestVersion = skill.versions[0];

  const task = await prisma.task.create({
    data: {
      userId,
      skillId,
      skillVersionId: latestVersion.id,
      input,
      inputFiles: uploadedFiles || [],
    },
  });

  return task.id;
}

export async function startTaskExecution(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { skill: true, skillVersion: true },
  });

  if (!task) throw new Error("Task not found");
  if (task.status !== "running")
    throw new Error("Task not in running state (execute route should set it first)");

  try {
    // Copy uploaded files to workspace
    if (task.inputFiles && task.inputFiles.length > 0) {
      await copyFilesToWorkspace(taskId, task.inputFiles);
    }

    const skillContent = task.skillVersion.content;
    const skillDir = task.skill.filePath;

    const stream = runtime.start({
      taskId: task.id,
      skillId: task.skillId,
      skillName: task.skill.name,
      skillContent,
      skillDirectory: skillDir,
      userInput: task.input,
      uploadedFiles: task.inputFiles,
    });

    let sequence = 0;
    let output = "";
    const startTime = Date.now();

    // Start health check timer
    const healthCheckInterval = setInterval(async () => {
      if (!task.sessionId) return;
      const status = runtime.getProcessStatus(task.sessionId);
      if (status === "exited" || status === null) {
        // Process crashed unexpectedly
        clearInterval(healthCheckInterval);
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "failed",
            output: output + "\n\n[Error: Process terminated unexpectedly]",
            duration: Date.now() - startTime,
          },
        });
      }
    }, 5000);

    try {
      for await (const event of stream) {
        sequence++;
        await logEvent(taskId, sequence, event);

        if (event.type === "chunk" && event.content) {
          output += event.content;
        }

        if (event.type === "system" && event.content) {
          try {
            const meta = JSON.parse(event.content);
            if (meta.session_id) {
              await prisma.task.update({
                where: { id: taskId },
                data: { sessionId: meta.session_id },
              });
            }
          } catch {}
        }

        if (event.type === "pause") {
          await prisma.task.update({
            where: { id: taskId },
            data: {
              status: "paused",
              pauseReason: event.pauseReason || "unknown",
              pausedAt: new Date(),
              output,
              duration: Date.now() - startTime,
            },
          });
          // Loop continues - process stays alive, waiting for sendInput
          continue;
        }

        if (event.type === "error") {
          await prisma.task.update({
            where: { id: taskId },
            data: {
              status: "failed",
              output,
              duration: Date.now() - startTime,
            },
          });
          return;
        }
      }

      // Stream ended (process exited)
      await collectOutputFiles(taskId);
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: "completed",
          output,
          duration: Date.now() - startTime,
        },
      });
    } finally {
      clearInterval(healthCheckInterval);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "failed", output: `Error: ${message}` },
    });
  }
}

export async function resumeTask(
  taskId: string,
  userReply: string
): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  if (!task.sessionId) throw new Error("No session ID for resume");

  // Allow resume from both paused and running states (user can interject anytime)
  if (!["paused", "running"].includes(task.status)) {
    throw new Error("Task not in a resumable state");
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "running",
      pauseReason: null,
      pausedAt: null,
      pauseCount: { increment: 1 },
    },
  });

  await runtime.sendInput(task.sessionId, userReply);
  // The existing stream in startTaskExecution continues processing
}

export async function cancelTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");

  // Cancel by sessionId if available, otherwise by taskId
  await runtime.cancel(task.sessionId || taskId);

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "cancelled" },
  });
}

async function logEvent(
  taskId: string,
  sequence: number,
  event: AgentEvent
): Promise<void> {
  let inputData: string | null = null;

  if (event.type === "tool_call" || event.type === "pause") {
    inputData = JSON.stringify({
      tool: event.toolName,
      input: event.toolInput,
      reason: event.pauseReason,
    });
  }

  await prisma.taskLog.create({
    data: {
      taskId,
      sequence,
      type: event.type,
      output: event.content || event.error || null,
      input: inputData,
    },
  });
}

async function collectOutputFiles(taskId: string): Promise<void> {
  const outputDir = getOutputPath(taskId);
  try {
    const files = await fs.readdir(outputDir);
    const filePaths = files.map((f) => path.join(outputDir, f));
    await prisma.task.update({
      where: { id: taskId },
      data: { outputFiles: filePaths },
    });
  } catch {
    // No output files
  }
}
