interface MindMapData {
  data: { text: string; [key: string]: unknown };
  children: MindMapData[];
}

interface InitPayload {
  data: MindMapData | null;
  fileName: string;
}

type MessageHandler = (e: MessageEvent) => void;
type DirtyCallback = (dirty: boolean) => void;
type SaveRequestedCallback = () => void;
type ErrorCallback = (message: string) => void;

export function createEditorBridge(iframeRef: HTMLIFrameElement) {
  const pendingResolvers = new Map<string, (value: unknown) => void>();
  let msgId = 0;
  let dirtyCb: DirtyCallback | null = null;
  let saveCb: SaveRequestedCallback | null = null;
  let errorCb: ErrorCallback | null = null;

  const handler: MessageHandler = (e) => {
    if (e.origin !== window.location.origin) return;
    const msg = e.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "ready":
        resolveAll("ready", null);
        break;
      case "data":
        resolveAll("data", msg.payload?.json ?? null);
        break;
      case "xmindBlob":
        resolveAll("xmindBlob", msg.payload?.base64 ?? "");
        break;
      case "dirty":
        dirtyCb?.(msg.payload === true);
        break;
      case "saveRequested":
        saveCb?.();
        break;
      case "error":
        errorCb?.(msg.payload?.message ?? "未知错误");
        break;
    }
  };

  function resolveAll(type: string, value: unknown) {
    for (const [k, resolve] of pendingResolvers) {
      if (k.startsWith(type + ":")) {
        resolve(value);
        pendingResolvers.delete(k);
      }
    }
  }

  function waitFor(type: string, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `${type}:${msgId++}`;
      pendingResolvers.set(id, resolve);
      if (timeoutMs > 0) {
        setTimeout(() => {
          if (pendingResolvers.has(id)) {
            pendingResolvers.delete(id);
            reject(new Error(`${type} 通信超时`));
          }
        }, timeoutMs);
      }
    });
  }

  function post(msg: Record<string, unknown>) {
    iframeRef.contentWindow?.postMessage(msg, window.location.origin);
  }

  window.addEventListener("message", handler);

  return {
    waitReady: (timeoutMs?: number) => waitFor("ready", timeoutMs),

    init: (data: MindMapData | null, fileName: string) => {
      post({ type: "init", payload: { data, fileName } });
    },

    getData: () => {
      post({ type: "getData" });
      return waitFor("data");
    },

    exportXmind: () => {
      post({ type: "exportXmind" });
      return waitFor("xmindBlob");
    },

    importXmindFile: (base64: string) => {
      post({ type: "importXmind", payload: { base64 } });
    },

    undo: () => post({ type: "undo" }),
    redo: () => post({ type: "redo" }),

    onDirty: (cb: DirtyCallback) => { dirtyCb = cb; },
    onSaveRequested: (cb: SaveRequestedCallback) => { saveCb = cb; },
    onError: (cb: ErrorCallback) => { errorCb = cb; },

    destroy: () => {
      window.removeEventListener("message", handler);
      pendingResolvers.clear();
    },
  };
}

export type EditorBridge = ReturnType<typeof createEditorBridge>;
