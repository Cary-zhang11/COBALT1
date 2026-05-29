import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock hooks
const mockCreateMutateAsync = vi.fn();
const mockExecuteMutateAsync = vi.fn();
const mockResumeMutateAsync = vi.fn();
const mockCancelMutate = vi.fn();

vi.mock("@/hooks/use-tasks", () => ({
  useCreateTask: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useExecuteTask: () => ({
    mutateAsync: mockExecuteMutateAsync,
    isPending: false,
  }),
  useResumeTask: () => ({
    mutateAsync: mockResumeMutateAsync,
    isPending: false,
  }),
  useCancelTask: () => ({
    mutate: mockCancelMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-task-events", () => ({
  useTaskEvents: () => ({ logs: [], status: "idle", pausedData: null, disconnect: () => {} }),
}));

import { GenerateWizard } from "../generate-wizard";

const defaultProps = {
  onComplete: vi.fn(),
  tweakHistoryMap: {},
  onTweakHistoryUpdate: vi.fn(),
  usecaseTree: null,
  skillId: "test-skill-id",
};

describe("GenerateWizard", () => {
  it("shows error card when skillId is undefined", () => {
    render(<GenerateWizard {...defaultProps} skillId={undefined} />);
    expect(screen.getByText("测试用例生成工具未配置")).toBeDefined();
  });

  it("renders 3-step wizard bar", () => {
    render(<GenerateWizard {...defaultProps} />);
    expect(screen.getByText("输入物料")).toBeDefined();
    expect(screen.getByText("选择平台能力")).toBeDefined();
    expect(screen.getByText("生成并预览")).toBeDefined();
  });

  it("renders step 1 upload area and textarea", () => {
    render(<GenerateWizard {...defaultProps} />);
    expect(screen.getByText("上传需求文档")).toBeDefined();
    expect(screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处...")).toBeDefined();
    expect(screen.getByText("下一步：选择平台能力")).toBeDefined();
  });

  it("navigates to step 2 when clicking '下一步'", async () => {
    render(<GenerateWizard {...defaultProps} />);
    // Type requirement text to pass validation
    await userEvent.type(
      screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处..."),
      "测试需求内容"
    );
    const nextBtn = screen.getByText("下一步：选择平台能力");
    await userEvent.click(nextBtn);
    // Step 2 content should be visible
    expect(screen.getByText("知识库与规范增强")).toBeDefined();
  });

  it("can go back from step 2 to step 1", async () => {
    render(<GenerateWizard {...defaultProps} />);
    // Type requirement text to pass validation
    await userEvent.type(
      screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处..."),
      "测试需求内容"
    );
    // Go to step 2
    await userEvent.click(screen.getByText("下一步：选择平台能力"));
    // Go back to step 1
    await userEvent.click(screen.getByText("上一步"));
    expect(screen.getByText("上传需求文档")).toBeDefined();
  });

  it("shows generate button in step 2", async () => {
    render(<GenerateWizard {...defaultProps} />);
    // Type requirement text to pass validation
    await userEvent.type(
      screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处..."),
      "测试需求内容"
    );
    await userEvent.click(screen.getByText("下一步：选择平台能力"));
    expect(screen.getByText("开始生成")).toBeDefined();
  });
});
