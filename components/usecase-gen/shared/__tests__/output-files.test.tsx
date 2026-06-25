import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutputFiles } from "../output-files";

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
    // .md file still has 预览 button
    expect(screen.getByText("预览")).toBeDefined();
    // .xmind file has 编辑 button
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
});
