import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExecutionPanel } from "../execution-panel";

// Mock useTaskEvents
let mockStatus = "connected";
vi.mock("@/hooks/use-task-events", () => ({
  useTaskEvents: ({ enabled }: { taskId: string; enabled?: boolean; onComplete?: (status: string) => void }) => {
    return {
      logs: enabled ? [{ sequence: 1, type: "log", output: "hello", input: null, createdAt: "2026-01-01" }] : [],
      status: enabled ? mockStatus : "idle",
      pausedData: null,
      disconnect: () => {},
    };
  },
}));

const defaultConfig = {
  source: "文本输入",
  capabilities: "3/4",
  dimensions: "3 个",
  fewShot: "1 份",
};

describe("ExecutionPanel", () => {
  it("renders config summary when not generating", () => {
    render(
      <ExecutionPanel
        taskId={null}
        generating={false}
        configSummary={defaultConfig}
      />
    );
    expect(screen.getByText("当前配置预览")).toBeDefined();
    expect(screen.getByText("文本输入")).toBeDefined();
    expect(screen.getByText("3/4")).toBeDefined();
  });

  it("renders workflow nodes when generating", () => {
    render(
      <ExecutionPanel
        taskId="test-id"
        generating={true}
        configSummary={defaultConfig}
      />
    );
    // Workflow nodes should be visible
    expect(screen.getByText("文档解析")).toBeDefined();
    expect(screen.getByText("知识检索")).toBeDefined();
    expect(screen.getByText("LLM 生成")).toBeDefined();
    expect(screen.getByText("质量校验")).toBeDefined();
    expect(screen.getByText("导出格式化")).toBeDefined();
  });

  it("shows completion message when task completed", async () => {
    mockStatus = "completed";
    render(
      <ExecutionPanel
        taskId="test-id"
        generating={true}
        configSummary={defaultConfig}
      />
    );
    expect(screen.getByText("工作流执行完成，用例文件已就绪")).toBeDefined();
  });
});
