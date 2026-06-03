import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutputFiles } from "../output-files";

describe("OutputFiles", () => {
  it("shows 预览 and 编辑 for .md files", () => {
    const onEdit = vi.fn();
    render(
      <OutputFiles
        taskId="t1"
        files={[{ name: "测试用例.md", relativePath: "测试用例.md", size: 100 }]}
        onEditMarkdown={onEdit}
      />
    );
    expect(screen.getByText("预览")).toBeDefined();
    fireEvent.click(screen.getByText("编辑"));
    expect(onEdit).toHaveBeenCalled();
  });
});
