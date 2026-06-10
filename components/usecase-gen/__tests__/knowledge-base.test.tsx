import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KnowledgeBase } from "../knowledge-base";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("KnowledgeBase", () => {
  it("renders page header and toolbar tabs", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByText("知识库管理")).toBeDefined();
    expect(screen.getByText("业务知识")).toBeDefined();
    expect(screen.getByText("历史用例")).toBeDefined();
  });

  it("renders search input and upload in toolbar", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByPlaceholderText("标题 / 文件名...")).toBeDefined();
    expect(screen.getByText("上传知识")).toBeDefined();
    expect(screen.queryByText("上传 md 文件")).toBeNull();
  });

  it("renders business type filter with 未分类 on knowledge tab", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByText("业务类型")).toBeDefined();
    expect(screen.getByText("C1C")).toBeDefined();
    expect(screen.getByText("未分类")).toBeDefined();
  });

  it("switches to history tab with upload范文 label and 未分类 filter", () => {
    renderWithClient(<KnowledgeBase />);
    fireEvent.click(screen.getByText("历史用例"));
    expect(screen.getByText("上传范文")).toBeDefined();
    expect(screen.queryByText("上传知识")).toBeNull();
    expect(screen.getAllByText("未分类").length).toBeGreaterThanOrEqual(1);
  });

  it("renders without crashing", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByTestId("knowledge-base")).toBeDefined();
  });
});
