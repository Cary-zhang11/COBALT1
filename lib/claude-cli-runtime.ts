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

interface ProcessInfo {
  process: ChildProcess;
  sessionId: string | null;
}

export class ClaudeCodeCLIRuntime implements IAgentRuntime {
  readonly name = "claude-cli";
  private processes = new Map<string, ProcessInfo>();
  private taskSessionMap = new Map<string, string>(); // taskId -> sessionId

  async *start(input: SkillInput): AsyncIterable<AgentEvent> {
    await ensureSandbox(input.taskId);

    const cwd = getWorkspacePath(input.taskId);
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

    // Combine system + user prompt into a single stdin payload
    // This avoids Windows shell argument length limits and escaping issues
    const combinedPrompt = [
      "<system_instructions>",
      systemPrompt,
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
      "--add-dir",
      cwd,
    ];

    yield* this.spawnCLI(args, env, cwd, input.taskId, combinedPrompt);
  }

  async *resume(sessionId: string, userReply: string): AsyncIterable<AgentEvent> {
    const args = [
      "--resume",
      sessionId,
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
    ];

    yield* this.spawnCLI(
      args,
      process.env as NodeJS.ProcessEnv,
      process.cwd(),
      sessionId,
      userReply
    );
  }

  async sendInput(sessionId: string, message: string): Promise<void> {
    const info = Array.from(this.processes.values()).find(
      (p) => p.sessionId === sessionId
    );
    if (!info) {
      throw new Error(`No active process for session ${sessionId}`);
    }
    const payload = JSON.stringify({ type: "user", content: message });
    info.process.stdin?.write(payload + "\n", "utf-8");
  }

  getProcessStatus(sessionId: string): "running" | "paused" | "crashed" | "exited" | null {
    const info = Array.from(this.processes.values()).find(
      (p) => p.sessionId === sessionId
    );
    if (!info) return null;
    const proc = info.process;
    if (proc.killed || proc.exitCode !== null) return "exited";
    return "running";
  }

  async cancel(key: string): Promise<void> {
    let info = this.processes.get(key);
    if (!info) {
      info = Array.from(this.processes.values()).find((p) => p.sessionId === key);
    }
    if (info && !info.process.killed && info.process.exitCode === null) {
      info.process.kill("SIGTERM");
    }
    // Clean up all references
    for (const [k, v] of Array.from(this.processes.entries())) {
      if (v === info || k === key || v.sessionId === key) {
        this.processes.delete(k);
      }
    }
    for (const [taskId, sessionId] of Array.from(this.taskSessionMap.entries())) {
      if (sessionId === key || taskId === key) {
        this.taskSessionMap.delete(taskId);
      }
    }
  }

  private async *spawnCLI(
    args: string[],
    env: NodeJS.ProcessEnv,
    cwd: string,
    processKey: string,
    stdinData?: string
  ): AsyncIterable<AgentEvent> {
    const proc = spawn("claude", args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    this.processes.set(processKey, { process: proc, sessionId: null });

    if (stdinData) {
      proc.stdin?.write(stdinData + "\n", "utf-8");
      // stdin stays open for sendInput
    }

    // Capture stderr for debugging
    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[claude-cli stderr] ${data.toString().trim()}`);
    });

    const rl = createInterface({ input: proc.stdout! });

    try {
      for await (const line of rl) {
        const event = this.parseStreamJson(line, processKey);
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

  private parseStreamJson(line: string, processKey: string): AgentEvent | null {
    const HIGH_RISK_TOOLS = ["Bash", "Edit", "Write", "Delete", "CreateFile"];

    try {
      const data = JSON.parse(line);

      if (data.type === "system" && data.subtype === "init") {
        this.taskSessionMap.set(processKey, data.session_id);
        const info = this.processes.get(processKey);
        if (info) {
          info.sessionId = data.session_id;
        }
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
        // Prefer text over thinking/tool_use
        const textBlock = blocks.find((b: { type: string }) => b.type === "text");
        if (textBlock) {
          return { type: "chunk", content: textBlock.text };
        }
        const toolBlock = blocks.find((b: { type: string }) => b.type === "tool_use");
        if (toolBlock) {
          if (HIGH_RISK_TOOLS.includes(toolBlock.name)) {
            return {
              type: "pause",
              pauseReason: "tool_call",
              toolName: toolBlock.name,
              toolInput: toolBlock.input,
            };
          }
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
}

export const cliRuntime = new ClaudeCodeCLIRuntime();
