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
      syncScrollbars();
    });
    resizeObserver.observe(document.getElementById("mindMapContainer"));
  }

  // --- 缩放 ---
  // simple-mind-map 的 mousewheelAction 只能二选一（zoom/move）。
  // 我们把它设为 move，然后在 capture 阶段先拦下 Ctrl+滚轮做缩放。
  var ZOOM_STEP = 0.1;
  var ZOOM_MIN = 0.1;
  var ZOOM_MAX = 4;

  function zoomBy(delta) {
    if (!mindMap) { console.warn("[mind-map] zoomBy: no mindMap"); return; }
    var view = mindMap.view;
    console.log("[mind-map] zoomBy delta=", delta, "view=", !!view, "setScale=", view && typeof view.setScale, "getTransformData=", view && typeof view.getTransformData);
    if (!view || typeof view.setScale !== "function") return;
    var t = typeof view.getTransformData === "function" ? view.getTransformData() : null;
    console.log("[mind-map] zoomBy transform=", t);
    var cur = (t && t.state && typeof t.state.scale === "number") ? t.state.scale : 1;
    var next = cur + delta;
    if (next < ZOOM_MIN) next = ZOOM_MIN;
    if (next > ZOOM_MAX) next = ZOOM_MAX;
    console.log("[mind-map] setScale", cur, "->", next);
    view.setScale(next);
  }

  function resetZoom() {
    if (!mindMap) { console.warn("[mind-map] resetZoom: no mindMap"); return; }
    var view = mindMap.view;
    console.log("[mind-map] resetZoom view=", !!view, "reset=", view && typeof view.reset, "setScale=", view && typeof view.setScale);
    if (!view) return;
    if (typeof view.reset === "function") {
      view.reset();
    } else if (typeof view.setScale === "function") {
      view.setScale(1);
    }
  }

  var wheelZoomBound = false;
  function setupWheelZoom() {
    if (wheelZoomBound) return;
    wheelZoomBound = true;
    var container = document.getElementById("mindMapContainer");
    if (!container) return;
    container.addEventListener("wheel", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (!mindMap || !mindMap.view) return;
      // 拦下浏览器默认缩放和 simple-mind-map 的 move 行为
      e.preventDefault();
      e.stopPropagation();
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    }, { capture: true, passive: false });
  }

  // --- 自定义滚动条：反映虚拟画布的可视范围并支持拖拽 ---
  // 虚拟画布 = 脑图内容外接矩形（画布坐标系，未缩放前）。
  // 视口在虚拟画布中的位置由 transform (translateX, translateY, scale) 决定。
  var scrollbarState = {
    bound: false,
    syncing: false,
    dragging: null, // 'v' | 'h' | null
    dragStart: null,
  };

  function setupScrollbars() {
    if (scrollbarState.bound) {
      syncScrollbars();
      return;
    }
    scrollbarState.bound = true;
    var thumbV = document.getElementById("thumbV");
    var thumbH = document.getElementById("thumbH");
    if (!thumbV || !thumbH) return;

    function beginDrag(axis, e) {
      var t = mindMap && mindMap.view && mindMap.view.getTransformData
        ? mindMap.view.getTransformData()
        : null;
      if (!t || !t.state) return;
      scrollbarState.dragging = axis;
      scrollbarState.dragStart = {
        pageX: e.pageX,
        pageY: e.pageY,
        transformX: t.state.x,
        transformY: t.state.y,
        scale: t.state.scale || 1,
      };
      (axis === "v" ? thumbV : thumbH).classList.add("dragging");
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
      e.preventDefault();
    }

    function onDragMove(e) {
      if (!scrollbarState.dragging || !mindMap || !mindMap.view) return;
      var info = getScrollInfo();
      if (!info) return;
      var start = scrollbarState.dragStart;
      if (scrollbarState.dragging === "v") {
        var dyPx = e.pageY - start.pageY;
        // 拖动条 1px = 内容 (contentH / trackH) px
        var ratio = info.trackH > info.thumbH ? info.contentH / (info.trackH - info.thumbH) : 0;
        var newY = start.transformY - dyPx * ratio;
        if (mindMap.view.translateYTo) mindMap.view.translateYTo(newY);
      } else {
        var dxPx = e.pageX - start.pageX;
        var ratio2 = info.trackW > info.thumbW ? info.contentW / (info.trackW - info.thumbW) : 0;
        var newX = start.transformX - dxPx * ratio2;
        if (mindMap.view.translateXTo) mindMap.view.translateXTo(newX);
      }
    }

    function onDragEnd() {
      if (!scrollbarState.dragging) return;
      (scrollbarState.dragging === "v" ? thumbV : thumbH).classList.remove("dragging");
      scrollbarState.dragging = null;
      scrollbarState.dragStart = null;
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", onDragEnd);
    }

    thumbV.addEventListener("mousedown", function (e) { beginDrag("v", e); });
    thumbH.addEventListener("mousedown", function (e) { beginDrag("h", e); });

    // 在核心库派发的事件上同步滚动条
    mindMap.on("translate", syncScrollbars);
    mindMap.on("scale", syncScrollbars);
    mindMap.on("data_change", function () {
      // 数据变了内容包围盒也可能变，稍后再同步
      setTimeout(syncScrollbars, 50);
    });
    mindMap.on("node_tree_render_end", function () {
      setTimeout(syncScrollbars, 50);
    });
    // 首次同步
    setTimeout(syncScrollbars, 300);
  }

  // 计算当前可视区/内容包围盒/thumb 尺寸
  function getScrollInfo() {
    if (!mindMap || !mindMap.view || !mindMap.renderer) return null;
    var t = mindMap.view.getTransformData();
    if (!t || !t.state) return null;
    var scale = t.state.scale || 1;

    var container = document.getElementById("mindMapContainer");
    if (!container) return null;
    var viewW = container.clientWidth;
    var viewH = container.clientHeight;

    // 内容包围盒（未缩放的画布坐标）
    var rect = null;
    try {
      if (mindMap.renderer.root && mindMap.renderer.root.group) {
        var bbox = mindMap.renderer.root.group.bbox();
        rect = { left: bbox.x, top: bbox.y, width: bbox.width, height: bbox.height };
      }
    } catch (_) { /* 首次渲染前 bbox 可能不可用 */ }
    if (!rect) return null;

    // 缩放后的内容尺寸
    var scaledW = rect.width * scale;
    var scaledH = rect.height * scale;

    // 虚拟画布 = 内容 + 视口余量（允许把内容拖到边缘）
    var margin = 200;
    var virtualW = scaledW + viewW + margin * 2;
    var virtualH = scaledH + viewH + margin * 2;

    var trackV = document.getElementById("scrollbarV");
    var trackH = document.getElementById("scrollbarH");
    var trackH_w = trackH ? trackH.clientWidth : 200;
    var trackV_h = trackV ? trackV.clientHeight : 200;

    var thumbH_w = Math.max(24, trackH_w * (viewW / virtualW));
    var thumbV_h = Math.max(24, trackV_h * (viewH / virtualH));

    // 视口在虚拟画布中的偏移。t.state.x/y 是画布原点在视口中的偏移。
    var contentLeftInView = rect.left * scale + t.state.x;
    var contentTopInView = rect.top * scale + t.state.y;
    var offsetX = margin - contentLeftInView + viewW;
    var offsetY = margin - contentTopInView + viewH;

    var contentW = virtualW - viewW;
    var contentH = virtualH - viewH;

    var thumbLeft = contentW > 0 ? (offsetX / contentW) * (trackH_w - thumbH_w) : 0;
    var thumbTop = contentH > 0 ? (offsetY / contentH) * (trackV_h - thumbV_h) : 0;
    if (thumbLeft < 0) thumbLeft = 0;
    if (thumbTop < 0) thumbTop = 0;
    if (thumbLeft > trackH_w - thumbH_w) thumbLeft = trackH_w - thumbH_w;
    if (thumbTop > trackV_h - thumbV_h) thumbTop = trackV_h - thumbV_h;

    return {
      viewW: viewW, viewH: viewH,
      contentW: contentW, contentH: contentH,
      thumbW: thumbH_w, thumbH: thumbV_h,
      trackW: trackH_w, trackH: trackV_h,
      thumbLeft: thumbLeft, thumbTop: thumbTop,
    };
  }

  function syncScrollbars() {
    if (scrollbarState.syncing) return;
    scrollbarState.syncing = true;
    try {
      var info = getScrollInfo();
      var thumbV = document.getElementById("thumbV");
      var thumbH = document.getElementById("thumbH");
      if (!info || !thumbV || !thumbH) return;
      thumbV.style.height = info.thumbH + "px";
      thumbV.style.top = info.thumbTop + "px";
      thumbH.style.width = info.thumbW + "px";
      thumbH.style.left = info.thumbLeft + "px";
    } finally {
      scrollbarState.syncing = false;
    }
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
      // 滚轮默认平移；Ctrl/Cmd+滚轮由我们自己拦截做缩放
      mousewheelAction: "move",
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
    setupWheelZoom();
    setupScrollbars();
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
      case "zoomIn":
        zoomBy(ZOOM_STEP);
        break;
      case "zoomOut":
        zoomBy(-ZOOM_STEP);
        break;
      case "resetZoom":
        resetZoom();
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
