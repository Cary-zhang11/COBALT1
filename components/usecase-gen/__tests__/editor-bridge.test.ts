import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEditorBridge } from "../editor-bridge";

describe("createEditorBridge", () => {
  let capturedHandler: ((e: MessageEvent) => void) | null = null;
  let originalAddEventListener: typeof window.addEventListener;

  beforeEach(() => {
    originalAddEventListener = window.addEventListener;
    capturedHandler = null;
  });

  afterEach(() => {
    window.addEventListener = originalAddEventListener;
  });

  it("resolves waitReady when iframe posts ready", async () => {
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    const readyPromise = bridge.waitReady();

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "ready" },
        origin: window.location.origin,
      })
    );

    await readyPromise;
  });

  it("waitReady times out after specified ms", async () => {
    window.addEventListener = vi.fn() as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    const result = await Promise.race([
      bridge.waitReady(100).then(() => "resolved").catch(() => "timed_out"),
      new Promise((r) => setTimeout(() => r("timed_out"), 200)),
    ]);

    expect(result).toBe("timed_out");
  });

  it("getData resolves with mind map JSON when iframe responds", async () => {
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    const dataPromise = bridge.getData();
    const testData = { data: { text: "Root" }, children: [] };

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "data", payload: { json: testData } },
        origin: window.location.origin,
      })
    );

    const result = await dataPromise;
    expect(result).toEqual(testData);
  });

  it("exportXmind resolves with base64 string", async () => {
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    const exportPromise = bridge.exportXmind();

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "xmindBlob", payload: { base64: "dGVzdA==" } },
        origin: window.location.origin,
      })
    );

    const result = await exportPromise;
    expect(result).toBe("dGVzdA==");
  });

  it("onDirty callback fires when dirty message received", async () => {
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    const dirtyValues: boolean[] = [];
    bridge.onDirty((d) => dirtyValues.push(d));

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "dirty", payload: true },
        origin: window.location.origin,
      })
    );

    expect(dirtyValues).toEqual([true]);
  });

  it("onSaveRequested callback fires on saveRequested message", async () => {
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    let saved = false;
    bridge.onSaveRequested(() => { saved = true; });

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "saveRequested" },
        origin: window.location.origin,
      })
    );

    expect(saved).toBe(true);
  });

  it("onError callback fires on error message", async () => {
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    let errorMsg = "";
    bridge.onError((msg) => { errorMsg = msg; });

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "error", payload: { message: "something broke" } },
        origin: window.location.origin,
      })
    );

    expect(errorMsg).toBe("something broke");
  });

  it("ignores messages from wrong origin", async () => {
    window.addEventListener = vi.fn((event: string, handler: any) => {
      if (event === "message") capturedHandler = handler;
    }) as any;

    const iframe = document.createElement("iframe");
    const bridge = createEditorBridge(iframe);

    let saved = false;
    bridge.onSaveRequested(() => { saved = true; });

    capturedHandler!(
      new MessageEvent("message", {
        data: { type: "saveRequested" },
        origin: "https://evil.com",
      })
    );

    expect(saved).toBe(false);
  });

  it("init sends init message to iframe", () => {
    const iframe = document.createElement("iframe");
    const postMessageSpy = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: postMessageSpy },
      writable: true,
    });

    const bridge = createEditorBridge(iframe);
    const testData = { data: { text: "Root" }, children: [] };
    bridge.init(testData, "test.md");

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "init", payload: { data: testData, fileName: "test.md" } },
      window.location.origin
    );
  });

  it("undo/redo/importXmind send corresponding messages", () => {
    const iframe = document.createElement("iframe");
    const postMessageSpy = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: postMessageSpy },
      writable: true,
    });

    const bridge = createEditorBridge(iframe);

    bridge.undo();
    expect(postMessageSpy).toHaveBeenCalledWith({ type: "undo" }, window.location.origin);

    bridge.redo();
    expect(postMessageSpy).toHaveBeenCalledWith({ type: "redo" }, window.location.origin);

    bridge.importXmindFile("dGVzdA==");
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "importXmind", payload: { base64: "dGVzdA==" } },
      window.location.origin
    );
  });
});
