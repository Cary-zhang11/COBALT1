import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...(actual as object),
    useQuery: () => ({ data: undefined }),
    useMutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
    useQueryClient: () => ({}),
  };
});

import { GenerateWizard } from "../generate-wizard";

const defaultProps = {
  onComplete: vi.fn(),
  skillId: "test-skill-id" as string | undefined,
};

describe("GenerateWizard", () => {
  it("shows error card when skillId is undefined", () => {
    render(<GenerateWizard {...defaultProps} skillId={undefined} />);
    expect(screen.getByText("测试用例生成工具未配置")).toBeDefined();
  });

  it("renders 3-step wizard bar", () => {
    render(<GenerateWizard {...defaultProps} />);
    expect(screen.getByText("输入物料")).toBeDefined();
    expect(screen.getByText("关联用例")).toBeDefined();
    expect(screen.getByText("生成并预览")).toBeDefined();
  });

  it("renders step 0 single card with upload and paste", () => {
    render(<GenerateWizard {...defaultProps} />);
    expect(screen.getByText("输入需求物料")).toBeDefined();
    expect(screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处...")).toBeDefined();
    expect(screen.getByText("下一步：关联用例")).toBeDefined();
  });

  it("wizard root has no nested overflow-auto scroll container", () => {
    render(<GenerateWizard {...defaultProps} />);
    const root = screen.getByTestId("generate-wizard-root");
    expect(root.className).not.toMatch(/overflow-auto/);
  });

  it("navigates to Step 1 when clicking '下一步'", async () => {
    render(<GenerateWizard {...defaultProps} />);
    // Type requirement text to pass validation
    await userEvent.type(
      screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处..."),
      "测试需求内容"
    );
    const nextBtn = screen.getByText("下一步：关联用例");
    await userEvent.click(nextBtn);
    // Step 1 content should be visible
    expect(screen.getByText("历史用例范文")).toBeDefined();
  });

  it("can go back from Step 1 to Step 0", async () => {
    render(<GenerateWizard {...defaultProps} />);
    // Type requirement text to pass validation
    await userEvent.type(
      screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处..."),
      "测试需求内容"
    );
    // Go to Step 1
    await userEvent.click(screen.getByText("下一步：关联用例"));
    // Go back to Step 0
    await userEvent.click(screen.getByText("上一步"));
    expect(screen.getByText("输入需求物料")).toBeDefined();
  });

  it("shows generate button in Step 1", async () => {
    render(<GenerateWizard {...defaultProps} />);
    // Type requirement text to pass validation
    await userEvent.type(
      screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处..."),
      "测试需求内容"
    );
    await userEvent.click(screen.getByText("下一步：关联用例"));
    expect(screen.getByText("开始生成")).toBeDefined();
  });
});
