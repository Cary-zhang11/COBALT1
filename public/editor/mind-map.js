(function () {
  "use strict";

  var MindMap = window.simpleMindMap;
  var xmind = MindMap.xmind;

  // --- State ---
  var mindMap = null;
  var originalSnapshot = null;
  var dirty = false;

  // --- Init ---
  function createMindMap() {
    mindMap = new MindMap({
      el: document.getElementById("mindMapContainer"),
      data: { data: { text: "" }, children: [] },
      layout: "logicalStructure",
      theme: "classic4",
      readonly: false,
      enableFreeDrag: true,
      mousewheelAction: "zoom",
    });
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

  function snapshot() {
    if (!mindMap) return;
    originalSnapshot = JSON.stringify(mindMap.getData());
    dirty = false;
    post({ type: "dirty", payload: false });
  }

  // --- Save handler (Ctrl+S) ---
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      post({ type: "saveRequested" });
    }
  });

  // --- PostMessage sender ---
  function post(msg) {
    window.parent.postMessage(msg, window.location.origin);
  }

  // --- Message handler ---
  window.addEventListener("message", function (e) {
    if (e.origin !== window.location.origin) return;

    var msg = e.data;
    if (!msg || !msg.type) return;

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
      case "undo":
        if (mindMap) mindMap.execCommand("BACK");
        break;
      case "redo":
        if (mindMap) mindMap.execCommand("FORWARD");
        break;
    }
  });

  // --- Init handler ---
  function handleInit(payload) {
    if (!payload) return;
    if (mindMap) {
      mindMap.destroy();
      mindMap = null;
    }
    createMindMap();

    if (payload.data && payload.data.data) {
      mindMap.setFullData(payload.data);
    } else {
      mindMap.setData({ data: { text: "测试用例" }, children: [] });
    }

    if (payload.data) {
      // Listen for data changes
      mindMap.on("data_change", updateDirty);
      mindMap.on("view_theme_change_config", function () {
        // Re-snapshot after theme change to avoid false dirty
        if (!dirty && mindMap) {
          originalSnapshot = JSON.stringify(mindMap.getData());
        }
      });
    }

    // Post-ready THEN snapshot (so init data isn't counted as dirty)
    post({ type: "ready" });
    snapshot();
  }

  // --- XMind import (base64 → parse) ---
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

      var data = await xmind.parseXmindFile(file);
      mindMap.setFullData(data);
      snapshot();
      post({ type: "ready" });
    } catch (err) {
      post({ type: "error", payload: { message: "文件格式损坏，无法加载" } });
    }
  }

  // --- XMind export (mind map data → base64 blob) ---
  async function handleExportXmind() {
    try {
      var data = mindMap.getData();
      var blob = await xmind.transformToXmind(data, "export");
      var reader = new FileReader();
      reader.onload = function () {
        var full = reader.result;
        var base64 = full.slice(full.indexOf(",") + 1);
        post({ type: "xmindBlob", payload: { base64: base64 } });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      post({ type: "error", payload: { message: "导出 XMind 失败" } });
    }
  }

  // --- Boot ---
  createMindMap();
  post({ type: "ready" });
})();
