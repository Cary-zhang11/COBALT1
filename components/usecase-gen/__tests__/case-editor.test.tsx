import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { CaseEditor } from "../case-editor";

// Mock fetch for XMind download
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the bridge
vi.mock("../editor-bridge", () => ({
  createEditorBridge: vi.fn(() => ({
    waitReady: vi.fn(() => Promise.resolve()),
    init: vi.fn(),
    importXmindFile: vi.fn(),
    getData: vi.fn(() => Promise.resolve({ data: { text: "Root" }, children: [] })),
    exportXmind: vi.fn(() => Promise.resolve("dGVzdA==")),
    undo: vi.fn(),
    redo: vi.fn(),
    onDirty: vi.fn(),
    onSaveRequested: vi.fn(),
    onError: vi.fn(),
    destroy: vi.fn(),
  })),
  markGlobalReady: vi.fn(),
  resetGlobalReadyState: vi.fn(),
}));

/** Helper: trigger iframe onLoad */
function fireIframeLoad() {
  const iframe = document.querySelector("iframe");
  if (iframe) {
    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
  }
}

describe("CaseEditor", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders toolbar buttons", async () => {
    render(<CaseEditor onSave={vi.fn()} />);
    fireIframeLoad();
    await waitFor(() => {
      expect(screen.getByText("保存")).toBeDefined();
    });
    expect(screen.getByText("下载 XMind")).toBeDefined();
    // Knowledge export button has been removed from the toolbar.
    expect(screen.queryByText("反哺知识库")).toBeNull();
  });

  it("disables save/download when no data", async () => {
    render(<CaseEditor onSave={vi.fn()} />);
    fireIframeLoad();
    await waitFor(() => {
      expect(screen.queryByText("加载脑图画布...")).toBeNull();
    });
    const saveBtn = screen.getByText("保存").closest("button");
    const downloadBtn = screen.getByText("下载 XMind").closest("button");
    expect(saveBtn?.disabled).toBe(true);
    expect(downloadBtn?.disabled).toBe(true);
  });

  it("shows empty state message when no taskId/filePath", async () => {
    render(<CaseEditor onSave={vi.fn()} />);
    fireIframeLoad();
    await waitFor(() => {
      expect(screen.getByText("请从任务结果页进入编辑")).toBeDefined();
    });
  });

  it("renders iframe element", () => {
    render(
      <CaseEditor
        taskId="test-task"
        filePath="test.xmind"
        onSave={vi.fn()}
      />
    );
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("/editor/mind-map.html");
  });

  it("renders back button when onBack provided", () => {
    render(
      <CaseEditor
        taskId="test-task"
        filePath="test.xmind"
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByTitle("返回详情")).toBeDefined();
  });
});
