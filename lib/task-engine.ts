import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { cliRuntime } from "./claude-cli-runtime";
import { getWorkspacePath, getOutputPath, copyFilesToWorkspace } from "./sandbox";
import type { AgentEvent } from "./agent-runtime";
import { parseTestcaseMarkdown } from "./parse-testcase-md";
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

export async function startTaskExecution(
  taskId: string,
  referenceFiles?: { sourcePath: string; subdir: string; destName: string }[]
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { skill: true, skillVersion: true },
  });

  if (!task) throw new Error("Task not found");
  if (task.status !== "running")
    throw new Error("Task not in running state (execute route should set it first)");

  const isTweak = (task.tweakCount || 0) > 0;
  const tweakRound = task.tweakCount || 0;

  // Snapshot pre-existing files for tweak fallback rename
  let preFileNames: Set<string> | undefined;
  if (isTweak) {
    try {
      const outputDir = getOutputPath(taskId);
      const entries = await fs.readdir(outputDir);
      preFileNames = new Set(entries);
    } catch { /* dir may not exist */ }
  }

  try {
    let workspaceFiles: string[] = [];
    if (task.inputFiles && task.inputFiles.length > 0) {
      workspaceFiles = await copyFilesToWorkspace(taskId, task.inputFiles, referenceFiles);
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
      uploadedFiles: workspaceFiles.length > 0 ? workspaceFiles : undefined,
    });

    let sequence = 0;
    let output = "";
    const startTime = Date.now();

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
        // On output_complete: rename new files during tweaks, save report for all
        if (event.pauseReason === "output_complete") {
          if (isTweak && preFileNames) {
            try {
              const outputDir = getOutputPath(taskId);
              const entries = await fs.readdir(outputDir, { withFileTypes: true });
              for (const entry of entries) {
                if (!entry.isFile()) continue;
                if (preFileNames.has(entry.name)) continue;
                const ext = path.extname(entry.name);
                const base = path.basename(entry.name, ext);
                if (!/_v\d+$/.test(base)) {
                  await fs.rename(
                    path.join(outputDir, entry.name),
                    path.join(outputDir, `${base}_v${tweakRound}${ext}`)
                  );
                }
              }
            } catch { /* non-critical */ }
          }
          // Write duration FIRST so report API sees it
          await prisma.task.update({
            where: { id: taskId },
            data: { duration: Date.now() - startTime },
          });
          await saveOutputAndReport(taskId);
        }

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
        return;
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

    // Stream ended normally (should not happen, but handle anyway)
    await prisma.task.update({
      where: { id: taskId },
      data: { duration: Date.now() - startTime },
    });
    await saveOutputAndReport(taskId);
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "paused",
        output,
        duration: Date.now() - startTime,
      },
    });
  } catch (error) {
    // Don't overwrite if user already cancelled
    const current = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
    if (current?.status === "cancelled") return;
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "failed", output: `Error: ${message}` },
    });
  }
}

export async function resumeTask(
  taskId: string,
  userReply: string,
  uploadedFiles?: string[]
): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  if (!task.sessionId) throw new Error("No session ID for resume");

  if (!["paused", "running"].includes(task.status)) {
    throw new Error("Task not in a resumable state");
  }

  if (uploadedFiles && uploadedFiles.length > 0) {
    await copyFilesToWorkspace(taskId, uploadedFiles);
  }

  const tweakRound = task.tweakCount || 0;

  // Snapshot existing files for post-resume rename
  let preFileNames: Set<string> | undefined;
  try {
    const outputDir = getOutputPath(taskId);
    const entries = await fs.readdir(outputDir);
    preFileNames = new Set(entries);
  } catch { /* dir may not exist */ }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "running",
      pauseReason: null,
      pausedAt: null,
      pauseCount: { increment: 1 },
    },
  });

  const cwd = getWorkspacePath(taskId);
  const stream = runtime.resume(task.sessionId, userReply, cwd);
  let sequence = (await prisma.taskLog.count({ where: { taskId } })) + 1;
  let output = task.output || "";
  const startTime = Date.now();
  const previousDuration = task.duration || 0;
  try {
    for await (const event of stream) {
      sequence++;
      await logEvent(taskId, sequence, event);

      if (event.type === "chunk" && event.content) {
        output += event.content;
      }

      if (event.type === "pause") {
        // On output_complete: rename new files, save report for all
        if (event.pauseReason === "output_complete") {
          if (tweakRound > 0 && preFileNames) {
            try {
              const outputDir = getOutputPath(taskId);
              const entries = await fs.readdir(outputDir, { withFileTypes: true });
              for (const entry of entries) {
                if (!entry.isFile()) continue;
                if (preFileNames.has(entry.name)) continue;
                const ext = path.extname(entry.name);
                const base = path.basename(entry.name, ext);
                if (!/_v\d+$/.test(base)) {
                  await fs.rename(
                    path.join(outputDir, entry.name),
                    path.join(outputDir, `${base}_v${tweakRound}${ext}`)
                  );
                }
              }
            } catch { /* non-critical */ }
          }
          // Write duration FIRST so report API sees it
          await prisma.task.update({
            where: { id: taskId },
            data: { duration: previousDuration + (Date.now() - startTime) },
          });
          await saveOutputAndReport(taskId);
        }

        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "paused",
            pauseReason: event.pauseReason || "unknown",
            pausedAt: new Date(),
            output,
            duration: previousDuration + (Date.now() - startTime),
          },
        });
        return;
      }

      if (event.type === "error") {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "failed",
            output,
            duration: previousDuration + (Date.now() - startTime),
          },
        });
        return;
      }
    }

    // Stream ended normally
    await prisma.task.update({
      where: { id: taskId },
      data: { duration: previousDuration + (Date.now() - startTime) },
    });
    await saveOutputAndReport(taskId);
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "paused",
        output,
        duration: previousDuration + (Date.now() - startTime),
      },
    });
  } catch (error) {
    // Don't overwrite if user already cancelled
    const current = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
    if (current?.status === "cancelled") return;
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "failed", output: `Error: ${message}` },
    });
  }
}

export async function cancelTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");

  // Cancel by taskId (initial start) or sessionId (after resume)
  await runtime.cancel(taskId);
  if (task.sessionId) {
    await runtime.cancel(task.sessionId);
  }

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

export async function saveOutputAndReport(taskId: string): Promise<void> {
  const outputDir = getOutputPath(taskId);
  try {
    const files = await collectFilesRelative(outputDir);
    const updates: Record<string, unknown> = { outputFiles: files };

    const mdPath = await findLatestMdFile(outputDir);
    if (mdPath) {
      const mdContent = await fs.readFile(mdPath, "utf-8");
      const parsed = parseTestcaseMarkdown(mdContent);
      updates.report = {
        tree: parsed.tree,
        summary: parsed.summary,
        meta: parsed.meta,
        dimensions: parsed.dimensions,
      };

      // First-time generation — write stats columns
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { totalCases: true },
      });

      if (task && task.totalCases === null) {
        updates.totalCases = parsed.summary.totalCases;
        updates.qualityScore = parsed.summary.qualityScore;
        updates.dimensionCoverage = parsed.dimensions as unknown as Prisma.InputJsonValue;
      }
    }

    await prisma.task.update({
      where: { id: taskId },
      data: updates as Prisma.TaskUpdateInput,
    });
  } catch {
    // No output files
  }
}

async function collectFilesRelative(dir: string, baseDir?: string): Promise<string[]> {
  const base = baseDir || dir;
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectFilesRelative(fullPath, base);
      results.push(...subFiles);
    } else {
      results.push(path.relative(base, fullPath));
    }
  }
  return results;
}

async function findLatestMdFile(outputDir: string): Promise<string | null> {
  const candidates: { path: string; version: number }[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "archive") continue;
        await walk(fullPath);
      } else if (entry.name.includes("测试用例") && entry.name.endsWith(".md")) {
        const m = entry.name.match(/_v(\d+)\.md$/);
        candidates.push({
          path: fullPath,
          version: m ? parseInt(m[1], 10) : 0,
        });
      }
    }
  }

  await walk(outputDir);
  candidates.sort((a, b) => b.version - a.version);
  return candidates[0]?.path ?? null;
}
