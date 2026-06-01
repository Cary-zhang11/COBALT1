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
  it("renders only 2 tabs (业务知识, 历史用例)", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByText("业务知识")).toBeDefined();
    expect(screen.getByText("历史用例")).toBeDefined();
    // 用例规范 and Prompt 模板 are removed
    expect(screen.queryByText("用例规范")).toBeNull();
    expect(screen.queryByText("Prompt 模板")).toBeNull();
  });

  it("renders search and filter", () => {
    renderWithClient(<KnowledgeBase />);
    expect(screen.getByPlaceholderText("关键词...")).toBeDefined();
    expect(screen.getByText("标签筛选")).toBeDefined();
  });

  it("switches tabs on click", () => {
    renderWithClient(<KnowledgeBase />);
    fireEvent.click(screen.getByText("历史用例"));
    // History tab should be active (styled as primary)
    expect(screen.getByText("历史用例").className).toContain("text-primary-foreground");
  });

  it("renders without crashing", () => {
    renderWithClient(<KnowledgeBase />);
    const container = document.body;
    expect(container).toBeDefined();
  });
});
