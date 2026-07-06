import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileActionModal } from "../file-action-modal";

const files = [
  { name: "测试用例.md", relativePath: "测试用例.md" },
  { name: "测试用例.xmind", relativePath: "测试用例.xmind" },
];

describe("FileActionModal", () => {
  it("renders title and file list when open", () => {
    render(
      <FileActionModal
        open={true}
        onClose={vi.fn()}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={vi.fn()}
      />
    );
    expect(screen.getByText("下载文件")).toBeDefined();
    expect(screen.getByText("测试用例.md")).toBeDefined();
    expect(screen.getByText("测试用例.xmind")).toBeDefined();
  });

  it("calls onAction with correct file when button clicked", () => {
    const onAction = vi.fn();
    render(
      <FileActionModal
        open={true}
        onClose={vi.fn()}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getAllByText("下载")[0]);
    expect(onAction).toHaveBeenCalledWith(files[0]);
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <FileActionModal
        open={true}
        onClose={onClose}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("关闭"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows empty text when files list is empty", () => {
    render(
      <FileActionModal
        open={true}
        onClose={vi.fn()}
        title="下载文件"
        files={[]}
        actionLabel="下载"
        onAction={vi.fn()}
        emptyText="暂无可下载文件"
      />
    );
    expect(screen.getByText("暂无可下载文件")).toBeDefined();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <FileActionModal
        open={false}
        onClose={vi.fn()}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <FileActionModal
        open={true}
        onClose={onClose}
        title="下载文件"
        files={files}
        actionLabel="下载"
        onAction={vi.fn()}
      />
    );
    const backdrop = document.querySelector(".fixed.inset-0")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
