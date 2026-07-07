import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModuleOverviewTable } from "../module-overview-table";
import type { UsecaseModule } from "../types";

const modules: UsecaseModule[] = [
  {
    name: "登录模块",
    open: true,
    cases: [
      {
        id: "tc1",
        title: "正常登录",
        priority: "P0",
        precondition: "用户已注册",
        steps: "1. 打开登录页\n2. 输入账号密码\n3. 点击登录",
        expected: "跳转到首页",
        tags: "登录,正向",
      },
      {
        id: "tc2",
        title: "密码错误",
        priority: "P1",
        precondition: "用户已注册",
        steps: "1. 打开登录页\n2. 输入错误密码\n3. 点击登录",
        expected: "提示密码错误",
        tags: "登录,异常",
      },
    ],
  },
  {
    name: "注册模块",
    open: false,
    cases: [
      {
        id: "tc3",
        title: "手机号注册",
        priority: "P0",
        precondition: "手机号未注册",
        steps: "1. 打开注册页\n2. 输入手机号\n3. 点击注册",
        expected: "注册成功",
        tags: "注册,正向",
      },
    ],
  },
];

describe("ModuleOverviewTable", () => {
  it("renders module names and case counts", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    expect(screen.getByText("登录模块")).toBeDefined();
    expect(screen.getByText("注册模块")).toBeDefined();
    expect(screen.getByText(/2 用例/)).toBeDefined();
    expect(screen.getByText(/1 用例/)).toBeDefined();
  });

  it("shows expand/collapse all buttons", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    expect(screen.getByText("全部展开")).toBeDefined();
    expect(screen.getByText("全部收起")).toBeDefined();
  });

  it("does not show case details when collapsed (default)", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    expect(screen.queryByText("正常登录")).toBeNull();
  });

  it("expands single module on header click", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    fireEvent.click(screen.getByText("登录模块"));
    expect(screen.getByText("正常登录")).toBeDefined();
    expect(screen.getByText("密码错误")).toBeDefined();
    expect(screen.queryByText("手机号注册")).toBeNull();
  });

  it("expands all modules on 全部展开 click", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    fireEvent.click(screen.getByText("全部展开"));
    expect(screen.getByText("正常登录")).toBeDefined();
    expect(screen.getByText("手机号注册")).toBeDefined();
  });

  it("collapses all modules on 全部收起 click", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    fireEvent.click(screen.getByText("全部展开"));
    expect(screen.getByText("正常登录")).toBeDefined();
    fireEvent.click(screen.getByText("全部收起"));
    expect(screen.queryByText("正常登录")).toBeNull();
  });

  it("shows full case fields when expanded", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} />);
    fireEvent.click(screen.getByText("登录模块"));
    expect(screen.getByText("正常登录")).toBeDefined();
    expect(screen.getAllByText(/用户已注册/).length).toBeGreaterThan(0);
    expect(screen.getByText(/跳转到首页/)).toBeDefined();
    expect(screen.getByText(/登录,正向/)).toBeDefined();
  });

  it("shows quality score and duration in header when provided", () => {
    render(<ModuleOverviewTable modules={modules} totalCases={3} qualityScore={82} duration={90000} />);
    expect(screen.getByText("82")).toBeDefined();
    expect(screen.getByText(/1.5min/)).toBeDefined();
  });

  it("applies green color to score >= 80", () => {
    const { container } = render(<ModuleOverviewTable modules={modules} totalCases={3} qualityScore={85} duration={60000} />);
    const scoreEl = container.querySelector(".text-emerald-600");
    expect(scoreEl).not.toBeNull();
    expect(scoreEl?.textContent).toBe("85");
  });

  it("does not render stats divider when qualityScore and duration are null", () => {
    const { container } = render(<ModuleOverviewTable modules={modules} totalCases={3} qualityScore={null} duration={null} />);
    expect(container.querySelector(".border-l")).toBeNull();
  });
});
