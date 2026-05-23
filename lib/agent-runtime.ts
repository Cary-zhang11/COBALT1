export interface AgentEvent {
  type: "system" | "chunk" | "tool_call" | "pause" | "error" | "complete";
  content?: string;
  toolName?: string;
  toolInput?: unknown;
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
  resume(sessionId: string, userReply: string): AsyncIterable<AgentEvent>;
  cancel(sessionId: string): Promise<void>;
}
