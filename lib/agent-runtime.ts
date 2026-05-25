export interface AgentEvent {
  type: "system" | "chunk" | "tool_call" | "pause" | "error" | "complete";
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  pauseReason?: "tool_call" | "output_complete" | "permission_request";
  error?: string;
}

export interface SkillInput {
  taskId: string;
  skillId: string;
  skillName: string;
  skillContent: string;
  skillDirectory: string;
  userInput: string;
  uploadedFiles?: string[];
}

export interface IAgentRuntime {
  readonly name: string;
  start(input: SkillInput): AsyncIterable<AgentEvent>;
  sendInput(sessionId: string, message: string): Promise<void>;
  resume(sessionId: string, userReply: string): AsyncIterable<AgentEvent>;
  getProcessStatus(sessionId: string): "running" | "paused" | "crashed" | "exited" | null;
  cancel(key: string): Promise<void>;
}
