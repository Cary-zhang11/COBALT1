(function () {
  "use strict";
  var _t0 = performance.now();
  console.log("[mind-map] script start, simpleMindMap=", typeof window.simpleMindMap);

  if (!window.simpleMindMap) {
    console.error("[mind-map] simpleMindMap not loaded!");
    window.parent.postMessage(
      { type: "error", payload: { message: "脑图核心库加载失败，请检查网络连接后刷新页面" } },
      window.location.origin
    );
    return;
  }

  // simple-mind-map UMD may export constructor directly or as { default: Constructor }
  var smm = window.simpleMindMap;
  var MindMap = typeof smm === "function" ? smm : (smm.default || smm);
  var xmind = smm.xmind || (smm.default && smm.default.xmind);

  // --- State ---
  var mindMap = null;
  var originalSnapshot = null;
  var dirty = false;
  var resizeObserver = null;

  // --- PostMessage to parent ---
  function post(msg) {
    window.parent.postMessage(msg, window.location.origin);
  }

  // --- Dirty tracking ---
  function updateDirty() {
    if (!mindMap) return;
    var current = JSON.stringify(mindMap.getData());
    var changed = current !== originalSnapshot;
    if (changed !== dirty) {
      dirty = changed;
      post({ type: "dirty", payload: dirty });
    }
  }

  // Reset baseline snapshot — call after load/save to mark current state as clean.
  function snapshot() {
    if (!mindMap) return;
    originalSnapshot = JSON.stringify(mindMap.getData());
    if (dirty) {
      dirty = false;
      post({ type: "dirty", payload: false });
    }
  }

  function expandAllNodes(node) {
    if (!node) return;
    if (node.data) node.data.expand = true;
    if (node.children && node.children.length > 0) {
      for (var i = 0; i < node.children.length; i++) {
        expandAllNodes(node.children[i]);
      }
    }
  }

  function bindListeners() {
    if (!mindMap) return;
    mindMap.on("data_change", updateDirty);
    // Theme change updates the internal data but should not flag dirty.
    mindMap.on("view_theme_change_config", function () {
      if (!dirty && mindMap) {
        originalSnapshot = JSON.stringify(mindMap.getData());
      }
    });
  }

  function fitViewSoon() {
    if (mindMap && mindMap.view && mindMap.view.fit) {
      setTimeout(function () { mindMap.view.fit(); }, 100);
    }
  }

  function observeResize() {
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    if (!window.ResizeObserver) return;
    resizeObserver = new ResizeObserver(function () {
      if (mindMap && mindMap.view && mindMap.view.fit) {
        mindMap.view.fit();
      }
    });
    resizeObserver.observe(document.getElementById("mindMapContainer"));
  }

  function createMindMap(initialData) {
    console.log("[mind-map] createMindMap, hasData=", !!(initialData && initialData.data));
    mindMap = new MindMap({
      el: document.getElementById("mindMapContainer"),
      data: initialData || { data: { text: "" }, children: [] },
      layout: "logicalStructure",
      theme: "classic",
      readonly: false,
      enableFreeDrag: true,
      mousewheelAction: "zoom",
    });
    // Dirty tracking is wired here so every code path (boot / init / import)
    // gets identical event-binding semantics.
    bindListeners();
    snapshot();
    // Re-snapshot after async layout/render settles, otherwise the very first
    // data_change after render fires a false-positive dirty.
    setTimeout(snapshot, 500);
    fitViewSoon();
    observeResize();
  }

  // --- Save shortcut (Ctrl/Cmd + S) ---
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      post({ type: "saveRequested" });
    }
  });

  // --- Init handler (load from in-memory JSON tree) ---
  function handleInit(payload) {
    try {
      if (!payload) return;
      if (mindMap) {
        mindMap.destroy();
        mindMap = null;
      }
      var hasData =
        payload.data &&
        payload.data.data &&
        payload.data.children &&
        payload.data.children.length > 0;
      if (hasData) {
        expandAllNodes(payload.data);
        createMindMap(payload.data);
      } else {
        createMindMap();
      }
      post({ type: "ready" });
    } catch (err) {
      console.error("[mind-map] handleInit error:", err);
      post({
        type: "error",
        payload: { message: "脑图初始化失败: " + (err && err.message ? err.message : String(err)) },
      });
    }
  }

  // --- XMind import (base64 zip → parse → setData) ---
  async function handleImportXmind(payload) {
    if (!payload || !payload.base64) {
      post({ type: "error", payload: { message: "导入数据为空" } });
      return;
    }
    try {
      var binaryStr = atob(payload.base64);
      var bytes = new Uint8Array(binaryStr.length);
      for (var i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      var blob = new Blob([bytes.buffer], { type: "application/x-zip-compressed" });
      var file = new File([blob], "imported.xmind", { type: "application/x-zip-compressed" });

      if (!xmind || typeof xmind.parseXmindFile !== "function") {
        post({ type: "error", payload: { message: "脑图库未导出 xmind 解析器" } });
        return;
      }

      var data = await xmind.parseXmindFile(file);
      // simple-mind-map@0.14: setFullData expects { root, layout, ... };
      // parseXmindFile returns a plain node tree, so use setData.
      mindMap.setData(data);
      snapshot();
      setTimeout(snapshot, 500);
      fitViewSoon();
      post({ type: "ready" });
    } catch (err) {
      console.error("[mind-map] importXmind error:", err);
      post({
        type: "error",
        payload: { message: "文件格式损坏，无法加载: " + (err && err.message ? err.message : String(err)) },
      });
    }
  }

  // --- XMind import via URL (iframe 直接 fetch 服务端文件，避免 base64 中转) ---
  async function handleImportXmindUrl(payload) {
    if (!payload || !payload.url) {
      post({ type: "error", payload: { message: "缺少文件 URL" } });
      return;
    }
    try {
      console.log("[mind-map] handleImportXmindUrl, fetching:", payload.url);
      var res = await fetch(payload.url);
      console.log("[mind-map] fetch response: status=", res.status, "ok=", res.ok);
      if (!res.ok) {
        post({ type: "error", payload: { message: "文件加载失败: HTTP " + res.status } });
        return;
      }
      var blob = await res.blob();
      console.log("[mind-map] blob size=", blob.size, "type=", blob.type);
      var file = new File([blob], "imported.xmind", { type: "application/x-zip-compressed" });

      if (!xmind || typeof xmind.parseXmindFile !== "function") {
        post({ type: "error", payload: { message: "脑图库未导出 xmind 解析器" } });
        return;
      }

      var data = await xmind.parseXmindFile(file);
      console.log("[mind-map] parsed xmind data, root=", data && data.data ? data.data.text : "null");
      mindMap.setData(data);
      snapshot();
      setTimeout(snapshot, 500);
      fitViewSoon();
      var importMs = Math.round(performance.now() - _t0);
      console.log("[mind-map] Import from URL complete (+" + importMs + "ms)");
      post({ type: "ready" });
    } catch (err) {
      console.error("[mind-map] importXmindUrl error:", err);
      post({
        type: "error",
        payload: { message: "文件格式损坏，无法加载: " + (err && err.message ? err.message : String(err)) },
      });
    }
  }

  // --- XMind export (delegate to simple-mind-map's built-in transformToXmind) ---
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var full = reader.result;
        resolve(full.slice(full.indexOf(",") + 1));
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function handleExportXmind() {
    try {
      if (!xmind || typeof xmind.transformToXmind !== "function") {
        post({ type: "error", payload: { message: "脑图库未导出 xmind 生成器" } });
        return;
      }
      var data = mindMap.getData();
      // simple-mind-map's transformToXmind internally calls getTextFromHtml,
      // so rich-text node titles (<p>...</p>) are flattened to plain text.
      var rootText = (data && data.data && data.data.text) || "用例";
      var blob = await xmind.transformToXmind(data, rootText);
      var base64 = await blobToBase64(blob);
      post({ type: "xmindBlob", payload: { base64: base64 } });
    } catch (err) {
      console.error("[mind-map] exportXmind error:", err);
      post({
        type: "error",
        payload: { message: "导出 XMind 失败: " + (err && err.message ? err.message : String(err)) },
      });
    }
  }

  // --- Message dispatcher ---
  window.addEventListener("message", function (e) {
    if (e.origin !== window.location.origin) {
      console.log("[mind-map] ignored cross-origin message from:", e.origin);
      return;
    }
    var msg = e.data;
    if (!msg || !msg.type) return;
    console.log("[mind-map] received message:", msg.type);

    switch (msg.type) {
      case "init":
        handleInit(msg.payload);
        break;
      case "getData":
        post({
          type: "data",
          payload: { json: mindMap ? mindMap.getData() : null },
        });
        break;
      case "exportXmind":
        handleExportXmind();
        break;
      case "importXmind":
        handleImportXmind(msg.payload);
        break;
      case "importXmindUrl":
        handleImportXmindUrl(msg.payload);
        break;
      case "undo":
        if (mindMap) mindMap.execCommand("BACK");
        break;
      case "redo":
        if (mindMap) mindMap.execCommand("FORWARD");
        break;
    }
  });

  // --- Boot ---
  try {
    console.log("[mind-map] booting...");
    createMindMap();
    var bootMs = Math.round(performance.now() - _t0);
    console.log("[mind-map] boot complete, posting ready (+" + bootMs + "ms)");
    post({ type: "ready" });
  } catch (err) {
    var bootMsg = "脑图初始化失败: " + (err && err.message ? err.message : String(err));
    console.error("[mind-map]", bootMsg, err);
    post({ type: "error", payload: { message: bootMsg } });
  }
})();
