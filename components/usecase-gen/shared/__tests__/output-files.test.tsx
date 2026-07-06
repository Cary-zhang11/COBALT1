import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutputFiles, isDisplayable } from "../output-files";

describe("OutputFiles", () => {
  it("shows 预览 for .md and 编辑 for .xmind", () => {
    const onEdit = vi.fn();
    render(
      <OutputFiles
        taskId="t1"
        files={[
          { name: "测试用例.md", relativePath: "测试用例.md" },
          { name: "测试用例.xmind", relativePath: "测试用例.xmind" },
        ]}
        onEditXmind={onEdit}
      />
    );
    expect(screen.getByText("预览")).toBeDefined();
    fireEvent.click(screen.getByText("编辑"));
    expect(onEdit).toHaveBeenCalled();
  });

  it("no 编辑 button for .md files", () => {
    render(
      <OutputFiles
        taskId="t1"
        files={[{ name: "测试用例.md", relativePath: "测试用例.md" }]}
      />
    );
    expect(screen.queryByText("编辑")).toBeNull();
  });

  it("uses compact row height (32px)", () => {
    const { container } = render(
      <OutputFiles
        taskId="t1"
        files={[{ name: "测试用例.md", relativePath: "测试用例.md" }]}
      />
    );
    const row = container.querySelector("[class*='min-h-[32px]']");
    expect(row).not.toBeNull();
  });

  it("shows 下载 button for .xlsx files", () => {
    render(
      <OutputFiles
        taskId="t1"
        files={[{ name: "测试用例.xlsx", relativePath: "测试用例.xlsx" }]}
      />
    );
    expect(screen.getByText("下载")).toBeDefined();
    expect(screen.queryByText("预览")).toBeNull();
    expect(screen.queryByText("编辑")).toBeNull();
  });
});

describe("isDisplayable", () => {
  it("returns true for .md, .xmind, .xlsx", () => {
    expect(isDisplayable("测试用例.md")).toBe(true);
    expect(isDisplayable("测试用例.xmind")).toBe(true);
    expect(isDisplayable("测试用例.xlsx")).toBe(true);
  });

  it("returns false for _source files", () => {
    expect(isDisplayable("测试用例_source.md")).toBe(false);
  });

  it("returns false for archive/ files", () => {
    expect(isDisplayable("archive/测试用例.md")).toBe(false);
  });

  it("returns false for other extensions", () => {
    expect(isDisplayable("测试用例.txt")).toBe(false);
    expect(isDisplayable("测试用例.pdf")).toBe(false);
  });
});
