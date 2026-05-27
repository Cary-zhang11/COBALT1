import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dashboard } from "../dashboard";

describe("Dashboard", () => {
  it("renders KPI cards", () => {
    render(<Dashboard />);
    expect(screen.getByText("累计生成用例数")).toBeDefined();
    expect(screen.getByText("本月活跃用户")).toBeDefined();
    expect(screen.getByText("平均生成耗时")).toBeDefined();
  });

  it("renders chart sections", () => {
    render(<Dashboard />);
    expect(screen.getByText("每日生成量 & 质量分趋势")).toBeDefined();
    expect(screen.getByText("需求类型分布")).toBeDefined();
    expect(screen.getByText("人员使用 Top 10")).toBeDefined();
  });

  it("renders records table", () => {
    render(<Dashboard />);
    expect(screen.getByText("最近生成记录")).toBeDefined();
    expect(screen.getByText("张小明")).toBeDefined();
  });
});
