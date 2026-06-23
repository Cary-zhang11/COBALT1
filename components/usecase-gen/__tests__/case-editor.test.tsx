import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CaseEditor } from "../case-editor";
import type { MindMapData } from "@/lib/md-mindmap-convert";

// Mock the bridge
vi.mock("../editor-bridge", () => ({
  createEditorBridge: vi.fn(() => ({
    waitReady: vi.fn(() => Promise.resolve()),
    init: vi.fn(),
    getData: vi.fn(() => Promise.resolve({ data: { text: "Root" }, children: [] })),
    exportXmind: vi.fn(() => Promise.resolve("dGVzdA==")),
    importXmindFile: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    onDirty: vi.fn(),
    onSaveRequested: vi.fn(),
    onError: vi.fn(),
    destroy: vi.fn(),
  })),
}));

const mockData: MindMapData = {
  data: { text: "测试用例" },
  children: [
    {
      data: { text: "登录模块" },
      children: [
        {
          data: { text: "tc-001 P0 正常登录" },
          children: [
            { data: { text: "前置条件：用户已注册" }, children: [] },
            { data: { text: "预期：跳转首页" }, children: [] },
          ],
        },
      ],
    },
  ],
};

describe("CaseEditor", () => {
  it("renders toolbar buttons when data is provided", () => {
    render(
      <CaseEditor
        data={mockData}
        fileName="test.md"
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    expect(screen.getByText("保存")).toBeDefined();
    expect(screen.getByText("下载 XMind")).toBeDefined();
    expect(screen.getByText("导入")).toBeDefined();
  });

  it("renders filename in toolbar", () => {
    render(
      <CaseEditor
        data={mockData}
        fileName="test.md"
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    expect(screen.getByText("test.md")).toBeDefined();
  });

  it("disables save/download/knowledge when data is null", () => {
    render(
      <CaseEditor
        data={null}
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    const saveBtn = screen.getByText("保存").closest("button");
    const downloadBtn = screen.getByText("下载 XMind").closest("button");
    expect(saveBtn?.disabled).toBe(true);
    expect(downloadBtn?.disabled).toBe(true);
  });

  it("shows empty state upload prompt when data is null", async () => {
    render(
      <CaseEditor
        data={null}
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("导入用例开始编辑")).toBeDefined();
    });
    expect(screen.getByText(/拖拽/)).toBeDefined();
  });

  it("renders iframe element", () => {
    render(
      <CaseEditor
        data={mockData}
        fileName="test.md"
        onSave={vi.fn()}
        onExportToKnowledge={vi.fn()}
      />
    );
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("/editor/mind-map.html");
  });
});
