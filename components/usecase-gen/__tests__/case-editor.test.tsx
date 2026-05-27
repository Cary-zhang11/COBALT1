import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CaseEditor } from "../case-editor";
import type { UsecaseModule } from "../shared/types";

const mockTree: UsecaseModule[] = [
  {
    name: "1. 登录模块", open: true, cases: [
      { id: "c1", title: "正常登录", priority: "P0" as const, precondition: "", steps: "", expected: "", tags: "" },
      { id: "c2", title: "密码错误", priority: "P1" as const, precondition: "", steps: "", expected: "", tags: "" },
    ],
  },
  {
    name: "2. 注册模块", open: false, cases: [
      { id: "c3", title: "正常注册", priority: "P0" as const, precondition: "", steps: "", expected: "", tags: "" },
    ],
  },
];

describe("CaseEditor", () => {
  it("shows empty state when no usecaseTree", () => {
    render(<CaseEditor usecaseTree={null} tweakHistory={[]} />);
    expect(screen.getByText("暂无生成结果，请先在「生成向导」中生成用例")).toBeDefined();
  });

  it("renders module names in tree", () => {
    render(<CaseEditor usecaseTree={mockTree} tweakHistory={[]} />);
    expect(screen.getByText("1. 登录模块")).toBeDefined();
    expect(screen.getByText("2. 注册模块")).toBeDefined();
  });

  it("shows case names under open module", () => {
    render(<CaseEditor usecaseTree={mockTree} tweakHistory={[]} />);
    expect(screen.getByText("正常登录")).toBeDefined();
    expect(screen.getByText("密码错误")).toBeDefined();
  });

  it("hides cases of closed module", () => {
    render(<CaseEditor usecaseTree={mockTree} tweakHistory={[]} />);
    // 注册模块 closed, cases hidden
    expect(screen.queryByText("正常注册")).toBeNull();
  });

  it("shows case detail when clicking a case", () => {
    render(<CaseEditor usecaseTree={mockTree} tweakHistory={[]} />);
    fireEvent.click(screen.getByText("正常登录"));
    // Detail section labels should appear
    expect(screen.getByText("前置条件")).toBeDefined();
    expect(screen.getByText("测试步骤")).toBeDefined();
    expect(screen.getByText("预期结果")).toBeDefined();
  });

  it("shows toolbar with export buttons", () => {
    render(<CaseEditor usecaseTree={mockTree} tweakHistory={[]} />);
    expect(screen.getByText("导出 XMind")).toBeDefined();
    expect(screen.getByText("导出 Excel")).toBeDefined();
  });

  it("shows save bar at bottom", () => {
    render(<CaseEditor usecaseTree={mockTree} tweakHistory={[]} />);
    expect(screen.getByText("保存修改")).toBeDefined();
    expect(screen.getByText("放弃修改")).toBeDefined();
  });
});
