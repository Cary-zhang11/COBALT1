import { spawn, ChildProcess, execSync } from "child_process";
import { createInterface } from "readline";
import path from "path";
import type { AgentEvent, IAgentRuntime, SkillInput } from "./agent-runtime";
import {
  getSandboxPath,
  getWorkspacePath,
  getOutputPath,
  getTempPath,
  ensureSandbox,
} from "./sandbox";

const TASK_MAX_STEPS = parseInt(process.env.TASK_MAX_STEPS || "30", 10);

// Tools that modify files — pause only when target is outside workspace
const FILE_WRITE_TOOLS = new Set(["Edit", "Write", "Delete", "NotebookEdit"]);

function extractFilePath(input: Record<string, unknown>): string | null {
  const field = input.file_path || input.target_file || input.notebook_path;
  if (typeof field !== "string" || !field.trim()) return null;
  return field;
}

function isPathInside(target: string, root: string): boolean {
  const absolute = path.isAbsolute(target)
    ? path.resolve(target)
    : path.resolve(root, target);
  const normalizedRoot = path.resolve(root) + path.sep;
  return absolute.startsWith(normalizedRoot) || absolute === path.resolve(root);
}

export class ClaudeCodeCLIRuntime implements IAgentRuntime {
  readonly name = "claude-cli";
  private processes = new Map<string, ChildProcess>();
  private sessionId: string | null = null;
  private sessionCwdMap = new Map<string, string>();

  async *start(input: SkillInput): AsyncIterable<AgentEvent> {
    await ensureSandbox(input.taskId);

    const cwd = getWorkspacePath(input.taskId);
    const sandboxRoot = getSandboxPath(input.taskId);
    const tempDir = getTempPath(input.taskId);
    const env = {
      ...process.env,
      SKILL_DIR: input.skillDirectory,
      WORKSPACE_ROOT: cwd,
      TASK_OUTPUT_DIR: getOutputPath(input.taskId),
      TASK_TEMP_DIR: tempDir,
      TASK_ID: input.taskId,
    };

    const systemPrompt = this.buildSystemPrompt(input);
    const userPrompt = this.buildUserPrompt(input);
    const outputDir = getOutputPath(input.taskId);

    const combinedPrompt = [
      "<system_instructions>",
      systemPrompt,
      `\n<output_rules>\n所有输出文件（.md, .xlsx, .xmind, .json 等）必须直接保存到以下目录（不要创建子目录，直接放文件）:\n${outputDir}\n示例: ${outputDir}\\report.md（正确）\n示例: ${outputDir}\\xxx\\report.md（错误，禁止创建子目录）\n禁止将输出文件保存到其他任何目录。\n</output_rules>`,
      "</system_instructions>",
      "",
      "<user_request>",
      userPrompt,
      "</user_request>",
    ].join("\n");

    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--add-dir",
      cwd,
    ];

    const stream = this.spawnCLI(args, env, cwd, sandboxRoot, input.taskId, combinedPrompt);
    for await (const event of stream) {
      if (event.type === "system" && event.content) {
        try {
          const meta = JSON.parse(event.content);
          if (meta.session_id) {
            this.sessionCwdMap.set(meta.session_id, cwd);
          }
        } catch {}
      }
      yield event;
    }
  }

  async *resume(sessionId: string, userReply: string, cwd?: string): AsyncIterable<AgentEvent> {
    const resolvedCwd = cwd || this.sessionCwdMap.get(sessionId) || process.cwd();
    const sandboxRoot = path.dirname(resolvedCwd);
    const args = [
      "--resume",
      sessionId,
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ];

    yield* this.spawnCLI(
      args,
      process.env as NodeJS.ProcessEnv,
      resolvedCwd,
      sandboxRoot,
      sessionId,
      userReply
    );
  }

  async cancel(key: string): Promise<void> {
    const proc = this.processes.get(key);
    if (!proc || proc.killed || proc.exitCode !== null) {
      this.processes.delete(key);
      return;
    }

    const pid = proc.pid;
    if (!pid) {
      this.processes.delete(key);
      return;
    }

    // Step 1: graceful SIGTERM
    proc.kill("SIGTERM");

    // Step 2: after 2s, force kill entire process tree (Windows-safe)
    setTimeout(() => {
      if (!proc.killed && proc.exitCode === null) {
        try {
          if (process.platform === "win32") {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
          } else {
            proc.kill("SIGKILL");
          }
        } catch {
          // process already gone
        }
      }
      this.processes.delete(key);
    }, 2000);
  }

  private async *spawnCLI(
    args: string[],
    env: NodeJS.ProcessEnv,
    cwd: string,
    sandboxRoot: string,
    processKey: string,
    stdinData?: string
  ): AsyncIterable<AgentEvent> {
    const proc = spawn("claude", args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    this.processes.set(processKey, proc);

    if (stdinData) {
      proc.stdin?.write(stdinData + "\n", "utf-8", () => {
        proc.stdin?.end();
      });
    } else {
      proc.stdin?.end();
    }

    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[claude-cli stderr] ${data.toString().trim()}`);
    });

    const rl = createInterface({ input: proc.stdout! });

    try {
      for await (const line of rl) {
        const event = this.parseStreamJson(line, sandboxRoot);
        if (event) {
          yield event;
          if (event.type === "complete" || event.type === "error") {
            break;
          }
        }
      }
    } finally {
      rl.close();
      if (!proc.killed && proc.exitCode === null) {
        const pid = proc.pid;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed && proc.exitCode === null && pid) {
            try {
              if (process.platform === "win32") {
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
              } else {
                proc.kill("SIGKILL");
              }
            } catch {
              // already gone
            }
          }
        }, 2000);
      }
      this.processes.delete(processKey);
    }
  }

  private parseStreamJson(line: string, sandboxRoot: string): AgentEvent | null {
    try {
      const data = JSON.parse(line);

      if (data.type === "system" && data.subtype === "init") {
        this.sessionId = data.session_id;
        return {
          type: "system",
          content: JSON.stringify({
            session_id: data.session_id,
            model: data.model,
          }),
        };
      }

      if (data.type === "assistant" && data.message?.content) {
        const blocks = data.message.content;
        const textBlock = blocks.find((b: { type: string }) => b.type === "text");
        if (textBlock) {
          return { type: "chunk", content: textBlock.text };
        }
        const toolBlock = blocks.find((b: { type: string }) => b.type === "tool_use");
        if (toolBlock) {
          // File write tools: check if target is inside workspace
          if (FILE_WRITE_TOOLS.has(toolBlock.name)) {
            const targetPath = extractFilePath(toolBlock.input as Record<string, unknown>);
            if (targetPath && !isPathInside(targetPath, sandboxRoot)) {
              return {
                type: "pause",
                pauseReason: "tool_outside_workspace",
                toolName: toolBlock.name,
                toolInput: toolBlock.input,
              };
            }
          }
          // Read tools, Bash, workspace-internal writes: pass through
          return {
            type: "tool_call",
            toolName: toolBlock.name,
            toolInput: toolBlock.input,
          };
        }
        const thinkingBlock = blocks.find((b: { type: string }) => b.type === "thinking");
        if (thinkingBlock) {
          return {
            type: "chunk",
            content: `[thinking] ${thinkingBlock.thinking?.slice(0, 200)}...`,
          };
        }
        return null;
      }

      if (data.type === "result") {
        if (data.subtype === "error" || data.is_error) {
          return { type: "error", error: data.result || "CLI execution error" };
        }
        return { type: "pause", pauseReason: "output_complete" };
      }

      return null;
    } catch {
      if (line.trim()) {
        return { type: "chunk", content: line };
      }
      return null;
    }
  }

  private buildSystemPrompt(input: SkillInput): string {
    let content = input.skillContent;
    content = content.replace(/\{SKILL_DIR\}/g, input.skillDirectory);
    content = content.replace(/\{WORKSPACE_ROOT\}/g, getWorkspacePath(input.taskId));
    content = content.replace(/\{TASK_OUTPUT_DIR\}/g, getOutputPath(input.taskId));
    content = content.replace(/\{TASK_TEMP_DIR\}/g, getTempPath(input.taskId));
    content = content.replace(/\{TASK_ID\}/g, input.taskId);
    return content;
  }

  private buildUserPrompt(input: SkillInput): string {
    let prompt = input.userInput;
    if (input.uploadedFiles && input.uploadedFiles.length > 0) {
      prompt += `\n\n用户上传的文件:\n${input.uploadedFiles.map((f) => `- ${f}`).join("\n")}`;
    }
    return prompt;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}

export const cliRuntime = new ClaudeCodeCLIRuntime();
