import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionPanel } from "../execution-panel";

const defaultConfig = {
  source: "文本输入",
  knowledge: "2 份",
  history: "1 份",
};

const foundFiles = [
  { name: "测试用例.md", relativePath: "测试用例.md" },
  { name: "测试用例.xmind", relativePath: "测试用例.xmind" },
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
  onScrollToRating: noop,
  onNavigateToEditor: noop,
};

describe("ExecutionPanel", () => {
  describe("Step 0-1: trajectory + config", () => {
    it("renders config summary on Step 0", () => {
      render(<ExecutionPanel {...baseProps} wizStep={0} />);
      expect(screen.getByText("执行轨迹")).toBeDefined();
      expect(screen.getByText("当前配置预览")).toBeDefined();
      expect(screen.getByText("文本输入")).toBeDefined();
    });

    it("renders config summary on Step 1", () => {
      render(<ExecutionPanel {...baseProps} wizStep={1} />);
      expect(screen.getByText("当前配置预览")).toBeDefined();
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

  describe("Step 2 complete: quick actions", () => {
    it("renders quick action buttons when files exist", () => {
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
      expect(screen.getByText("下载 Markdown")).toBeDefined();
      expect(screen.getByText("AI 微调")).toBeDefined();
      expect(screen.getByText("评价")).toBeDefined();
      expect(screen.getByText("编辑")).toBeDefined();
    });

    it("calls onDownloadFile when download button clicked", () => {
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
      fireEvent.click(screen.getByText("下载 Markdown"));
      expect(onDownload).toHaveBeenCalledWith(foundFiles[0]);
    });

    it("calls onScrollToRating when rating button clicked", () => {
      const onRating = vi.fn();
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
          onScrollToRating={onRating}
        />
      );
      fireEvent.click(screen.getByText("评价"));
      expect(onRating).toHaveBeenCalled();
    });

    it("does not show config preview on Step 3 complete", () => {
      render(
        <ExecutionPanel
          {...baseProps}
          taskId="test-id"
          wizStep={2}
          hasResult={true}
          foundFiles={foundFiles}
        />
      );
      expect(screen.queryByText("当前配置预览")).toBeNull();
    });
  });
});
