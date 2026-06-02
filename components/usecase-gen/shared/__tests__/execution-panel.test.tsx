import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionPanel } from "../execution-panel";

const defaultConfig = {
  source: "文本输入",
  knowledge: "2 份",
  history: "1 份",
};

const noop = () => {};

describe("ExecutionPanel", () => {
  describe("Mode 1: Config Preview (wizStep < 2)", () => {
    it("renders config summary on Step 0", () => {
      render(
        <ExecutionPanel
          taskId={null} generating={false} wizStep={0} hasResult={false}
          configSummary={defaultConfig} foundFiles={[]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onNavigateToEditor={noop}
        />
      );
      expect(screen.getByText("当前配置预览")).toBeDefined();
      expect(screen.getByText("文本输入")).toBeDefined();
      expect(screen.getByText("1 份")).toBeDefined();
    });

    it("renders config summary on Step 1", () => {
      render(
        <ExecutionPanel
          taskId={null} generating={false} wizStep={1} hasResult={false}
          configSummary={defaultConfig} foundFiles={[]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onNavigateToEditor={noop}
        />
      );
      expect(screen.getByText("当前配置预览")).toBeDefined();
    });
  });

  describe("Mode 2: Progress Dots (wizStep 2 + generating)", () => {
    it("renders 5 workflow nodes as progress dots", () => {
      render(
        <ExecutionPanel
          taskId="test-id" generating={true} wizStep={2} hasResult={false}
          configSummary={defaultConfig} foundFiles={[]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onNavigateToEditor={noop}
        />
      );
      expect(screen.getByText("生成中")).toBeDefined();
      expect(screen.getByText("文档解析")).toBeDefined();
      expect(screen.getByText("用例生成")).toBeDefined();
      expect(screen.getByText("导出格式")).toBeDefined();
    });

    it("marks nodes as done based on foundFiles", () => {
      render(
        <ExecutionPanel
          taskId="test-id" generating={true} wizStep={2} hasResult={false}
          configSummary={defaultConfig} foundFiles={[{ name: "_source.md", relativePath: "_source.md" }]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onNavigateToEditor={noop}
        />
      );
      const docParse = screen.getByText("文档解析");
      expect(docParse.className).toContain("text-green-700");
    });

    it("cascades done status — later done nodes force earlier nodes to done", () => {
      // Only xmind exists (export done), but _source.md not yet created
      render(
        <ExecutionPanel
          taskId="test-id" generating={true} wizStep={2} hasResult={false}
          configSummary={defaultConfig}
          foundFiles={[{ name: "测试用例.xmind", relativePath: "测试用例.xmind" }]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onNavigateToEditor={noop}
        />
      );
      const docParse = screen.getByText("文档解析");
      const requirement = screen.getByText("需求分析");
      const caseGen = screen.getByText("用例生成");
      expect(docParse.className).toContain("text-green-700");
      expect(requirement.className).toContain("text-green-700");
      expect(caseGen.className).toContain("text-green-700");
    });
  });

  describe("Mode 3: Quick Actions (wizStep 2 + !generating + has result)", () => {
    const foundFiles = [
      { name: "测试用例.md", relativePath: "测试用例.md" },
      { name: "测试用例.xmind", relativePath: "测试用例.xmind" },
    ];

    it("renders quick action buttons when files exist", () => {
      render(
        <ExecutionPanel
          taskId="test-id" generating={false} wizStep={2} hasResult={true}
          configSummary={defaultConfig} foundFiles={foundFiles}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onNavigateToEditor={noop}
        />
      );
      expect(screen.getByText("快捷操作")).toBeDefined();
      expect(screen.getByText("下载 Markdown")).toBeDefined();
      expect(screen.getByText("下载 XMind")).toBeDefined();
      expect(screen.getByText("AI 微调")).toBeDefined();
      expect(screen.getByText("去编辑用例")).toBeDefined();
    });

    it("calls onDownloadFile when download button clicked", () => {
      const onDownload = vi.fn();
      render(
        <ExecutionPanel
          taskId="test-id" generating={false} wizStep={2} hasResult={true}
          configSummary={defaultConfig} foundFiles={foundFiles}
          onDownloadFile={onDownload} onScrollToAITweak={noop}
          onNavigateToEditor={noop}
        />
      );
      fireEvent.click(screen.getByText("下载 Markdown"));
      expect(onDownload).toHaveBeenCalledWith(foundFiles[0]);
    });

    it("shows empty wrapper when no files and no result", () => {
      const { container } = render(
        <ExecutionPanel
          taskId="test-id" generating={false} wizStep={2} hasResult={false}
          configSummary={defaultConfig} foundFiles={[]}
          onDownloadFile={noop} onScrollToAITweak={noop}
          onNavigateToEditor={noop}
        />
      );
      expect(screen.queryByText("快捷操作")).toBeNull();
      expect(screen.queryByText("当前配置预览")).toBeNull();
      expect(screen.queryByText("生成中")).toBeNull();
    });
  });
});
