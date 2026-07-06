import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionPanel } from "../execution-panel";

// Mock fetch for RatingPanel
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  );
});

const defaultConfig = {
  source: "文本输入",
  knowledge: "2 份",
  history: "1 份",
};

const foundFiles = [
  { name: "测试用例.md", relativePath: "测试用例.md" },
  { name: "测试用例.xmind", relativePath: "测试用例.xmind" },
  { name: "测试用例.xlsx", relativePath: "测试用例.xlsx" },
];

const noop = () => {};

const baseProps = {
  taskId: null as string | null,
  generating: false,
  wizStep: 0,
  hasResult: false,
  configSummary: defaultConfig,
  foundFiles: [] as typeof foundFiles,
  onDownloadFile: noop,
  onScrollToAITweak: noop,
  onNavigateToEditor: noop as (filePath?: string) => void,
};

describe("ExecutionPanel", () => {
  describe("Step 0-1: trajectory + config", () => {
    it("renders config summary on Step 0", () => {
      render(<ExecutionPanel {...baseProps} wizStep={0} />);
      expect(screen.getByText("执行轨迹")).toBeDefined();
      expect(screen.getByText("当前配置预览")).toBeDefined();
      expect(screen.getByText("文本输入")).toBeDefined();
    });
  });

  describe("Step 2 generating", () => {
    it("renders workflow nodes while generating", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          generating={true}
          wizStep={2}
        />
      );
      expect(screen.getByText("生成中")).toBeDefined();
      expect(screen.getByText("文档解析")).toBeDefined();
      expect(screen.getByText("用例生成")).toBeDefined();
    });
  });

  describe("Step 2 complete: quick actions + rating", () => {
    it("renders 下载文件 and 编辑脑图 buttons", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      expect(screen.getByText("快捷操作")).toBeDefined();
      expect(screen.getByText("下载文件")).toBeDefined();
      expect(screen.getByText("编辑脑图")).toBeDefined();
      expect(screen.getByText("AI 微调")).toBeDefined();
    });

    it("does NOT render old separate download buttons", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      expect(screen.queryByText("下载 Markdown")).toBeNull();
      expect(screen.queryByText("下载 XMind")).toBeNull();
    });

    it("renders rating panel in sidebar", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      expect(screen.getByText("本次生成评价")).toBeDefined();
    });

    it("opens download modal on 下载文件 click", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      fireEvent.click(screen.getByText("下载文件"));
      // Modal title (h3) should now be visible
      expect(screen.getByRole("heading", { level: 3, name: "下载文件" })).toBeDefined();
    });

    it("calls onDownloadFile when download action clicked in modal", () => {
      const onDownload = vi.fn();
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
          onDownloadFile={onDownload}
        />
      );
      fireEvent.click(screen.getByText("下载文件"));
      // Click the first 下载 button in the modal (not the trigger)
      const downloadButtons = screen.getAllByText("下载");
      fireEvent.click(downloadButtons[0]);
      expect(onDownload).toHaveBeenCalled();
    });

    it("calls onNavigateToEditor with filePath when edit clicked in modal", () => {
      const onEdit = vi.fn();
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
          onNavigateToEditor={onEdit}
        />
      );
      fireEvent.click(screen.getByText("编辑脑图"));
      // Click the first 编辑 button in the modal
      fireEvent.click(screen.getAllByText("编辑")[0]);
      expect(onEdit).toHaveBeenCalledWith("测试用例.xmind");
    });
  });
});
