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
type ErrorCallback = (error: string) => void;

// Module-level flag: persists across StrictMode double-mount so the second
// bridge instance can resolve waitReady immediately when the iframe has
// already sent its one-time "ready" message.
let globalReadyReceived = false;

/** Mark iframe as ready from outside (e.g. onLoad) — for when postMessage arrives before listener is set up */
export function markGlobalReady() {
  globalReadyReceived = true;
}

/** Reset the global ready flag — exposed for testing only */
export function resetGlobalReadyState() {
  globalReadyReceived = false;
}

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
    console.log("[Bridge] received:", msg.type, msg.payload ? JSON.stringify(msg.payload).slice(0, 200) : "");

    switch (msg.type) {
      case "ready":
        globalReadyReceived = true;
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
    if (type === "ready" && globalReadyReceived) {
      console.log("[Bridge] waitFor(" + type + "): globalReady already true, resolve immediately");
      return Promise.resolve();
    }
    console.log("[Bridge] waitFor(" + type + "), timeout=" + timeoutMs + "ms");
    return new Promise((resolve, reject) => {
      const id = `${type}:${msgId++}`;
      pendingResolvers.set(id, resolve);
      if (timeoutMs > 0) {
        setTimeout(() => {
          if (pendingResolvers.has(id)) {
            pendingResolvers.delete(id);
            console.error("[Bridge] waitFor(" + type + ") TIMEOUT after " + timeoutMs + "ms");
            reject(new Error(`${type} 通信超时`));
          }
        }, timeoutMs);
      }
    });
  }

  function post(msg: Record<string, unknown>) {
    console.log("[Bridge] post:", msg.type, msg.payload ? JSON.stringify(msg.payload as object).slice(0, 200) : "");
    iframeRef.contentWindow?.postMessage(msg, window.location.origin);
  }

  window.addEventListener("message", handler);

  return {
    waitReady: (timeoutMs?: number) => waitFor("ready", timeoutMs),

    init: (data: MindMapData | null, fileName: string) => {
      post({ type: "init", payload: { data, fileName } });
    },

    getData: (): Promise<MindMapData> => {
      post({ type: "getData" });
      return waitFor("data") as Promise<MindMapData>;
    },

    exportXmind: (): Promise<string> => {
      post({ type: "exportXmind" });
      return waitFor("xmindBlob") as Promise<string>;
    },

    importXmindFile: (base64: string) => {
      post({ type: "importXmind", payload: { base64 } });
    },

    importXmindUrl: (url: string) => {
      post({ type: "importXmindUrl", payload: { url } });
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
