import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KnowledgeBase } from "../knowledge-base";

describe("KnowledgeBase", () => {
  it("renders sub-tab bar", () => {
    render(<KnowledgeBase />);
    expect(screen.getByText("业务知识")).toBeDefined();
    expect(screen.getByText("历史用例")).toBeDefined();
    expect(screen.getByText("用例规范")).toBeDefined();
    expect(screen.getByText("Prompt 模板")).toBeDefined();
  });

  it("renders filter section", () => {
    render(<KnowledgeBase />);
    expect(screen.getByPlaceholderText("关键词...")).toBeDefined();
    expect(screen.getByText("标签筛选")).toBeDefined();
  });

  it("switches content when clicking sub-tab", () => {
    render(<KnowledgeBase />);
    fireEvent.click(screen.getByText("Prompt 模板"));
    expect(screen.getByText("标准用例生成 Prompt")).toBeDefined();
  });

  it("shows add button for knowledge items", () => {
    render(<KnowledgeBase />);
    expect(screen.getByText("添加新条目")).toBeDefined();
  });
});
