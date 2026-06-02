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
  it("renders main tabs (业务知识, 历史用例)", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByText("业务知识")).toBeDefined();
    expect(screen.getByText("历史用例")).toBeDefined();
  });

  it("renders search input", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByPlaceholderText("关键词...")).toBeDefined();
  });

  it("renders business type filter with options", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByText("业务类型")).toBeDefined();
    expect(screen.getByText("C1C")).toBeDefined();
    expect(screen.getByText("数科")).toBeDefined();
    expect(screen.queryByText("标签筛选")).toBeNull();
  });

  it("switches to history tab and shows sub-tabs", () => {
    renderWithClient(<KnowledgeBase />);
    fireEvent.click(screen.getByText("历史用例"));
    expect(screen.getByText("平台生成")).toBeDefined();
    expect(screen.getByText("手动上传")).toBeDefined();
  });

  it("shows 未分类 filter option when on 平台生成 sub-tab", () => {
    renderWithClient(<KnowledgeBase />);
    fireEvent.click(screen.getByText("历史用例"));
    expect(screen.getByText("未分类")).toBeDefined();
  });

  it("does not show 未分类 filter when switching to 手动上传 sub-tab", () => {
    renderWithClient(<KnowledgeBase />);
    fireEvent.click(screen.getByText("历史用例"));
    fireEvent.click(screen.getByText("手动上传"));
    expect(screen.queryByText("未分类")).toBeNull();
  });

  it("renders without crashing", () => {
    renderWithClient(<KnowledgeBase />);
    expect(document.body).toBeDefined();
  });
});
