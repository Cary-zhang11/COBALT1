import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { AgentEvent, IAgentRuntime, SkillInput } from "./agent-runtime";
import {
  getWorkspacePath,
  getOutputPath,
  getTempPath,
  ensureSandbox,
} from "./sandbox";

const TASK_MAX_STEPS = parseInt(process.env.TASK_MAX_STEPS || "30", 10);

export class ClaudeCodeCLIRuntime implements IAgentRuntime {
  readonly name = "claude-cli";
  private processes = new Map<string, ChildProcess>();
  private sessionId: string | null = null;

  async *start(input: SkillInput): AsyncIterable<AgentEvent> {
    await ensureSandbox(input.taskId);

    const cwd = getWorkspacePath(input.taskId);
    const env = {
      ...process.env,
      SKILL_DIR: input.skillDirectory,
      WORKSPACE_ROOT: cwd,
      TASK_OUTPUT_DIR: getOutputPath(input.taskId),
      TASK_TEMP_DIR: getTempPath(input.taskId),
      TASK_ID: input.taskId,
    };

    const systemPrompt = this.buildSystemPrompt(input);
    const userPrompt = this.buildUserPrompt(input);

    const args = [
      "-p",
      userPrompt,
      "--system-prompt",
      systemPrompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--add-dir",
      cwd,
    ];

    yield* this.spawnCLI(args, env, cwd, input.taskId);
  }

  async *resume(sessionId: string, userReply: string): AsyncIterable<AgentEvent> {
    const args = [
      "--resume",
      sessionId,
      "-p",
      userReply,
      "--output-format",
      "stream-json",
      "--verbose",
    ];

    yield* this.spawnCLI(args, process.env as NodeJS.ProcessEnv, process.cwd(), sessionId);
  }

  async cancel(taskId: string): Promise<void> {
    const proc = this.processes.get(taskId);
    if (proc && !proc.killed && proc.exitCode === null) {
      proc.kill("SIGTERM");
      this.processes.delete(taskId);
    }
  }

  private async *spawnCLI(
    args: string[],
    env: NodeJS.ProcessEnv,
    cwd: string,
    processKey: string
  ): AsyncIterable<AgentEvent> {
    const proc = spawn("claude", args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    this.processes.set(processKey, proc);

    const rl = createInterface({ input: proc.stdout! });

    try {
      for await (const line of rl) {
        const event = this.parseStreamJson(line);
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
        proc.kill();
      }
      this.processes.delete(processKey);
    }
  }

  private parseStreamJson(line: string): AgentEvent | null {
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
        for (const block of data.message.content) {
          if (block.type === "text") {
            return { type: "chunk", content: block.text };
          }
          if (block.type === "tool_use") {
            return {
              type: "tool_call",
              toolName: block.name,
              toolInput: block.input,
            };
          }
          if (block.type === "thinking") {
            return {
              type: "chunk",
              content: `[thinking] ${block.thinking?.slice(0, 200)}...`,
            };
          }
        }
        return null;
      }

      if (data.type === "result") {
        if (data.subtype === "error" || data.is_error) {
          return { type: "error", error: data.result || "CLI execution error" };
        }
        return { type: "complete" };
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
