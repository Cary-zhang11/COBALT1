# 用例编辑器重新开发 设计文档

> 日期：2026-06-22

---

## 概述

将现有表单式用例编辑升级为基于思维导图的可视化编辑器，支持 MD 和 XMind 两种格式的加载、编辑、保存和导出。

### 背景

- 当前 `CaseEditor` 采用左侧树 + 右侧表单的编辑模式，交互不直观
- 「导出 XMind」按钮长期处于禁用状态
- 保存按钮只是假 toast，没有真正持久化
- 用户期望以 XMind 脑图形式展示和编辑用例

---

## 方案选择

经过多轮对比（simple-mind-map vs mind-elixir vs 自研），最终选择 **方案 D：simple-mind-map + iframe 隔离封装**。

- simple-mind-map（10.2k stars）是功能最完善的开源 Web 脑图库
- 通过 iframe 隔离运行，避免 vanilla JS 库与 React 18 的生命周期冲突
- 主应用通过 postMessage 协议与 iframe 通信
- Excel 支持留到后续迭代

### MindMapData 类型定义

```ts
// simple-mind-map 使用的脑图节点树结构
interface MindMapData {
  data: {
    text: string;              // 节点标题
    [key: string]: unknown;    // 扩展字段（优先级标签等）
  };
  children: MindMapData[];
}
```

---

## 一、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                   Next.js 主应用 (React)                      │
│                                                              │
│  ┌───────────────────────┐   ┌────────────────────────────┐ │
│  │     CaseEditor 页面    │   │    postMessage 桥接层       │ │
│  │  (工具栏 + iframe 容器) │◄─►│   (editor-bridge.ts)       │ │
│  │                       │   │   - Promise 风格 API         │ │
│  │  props:               │   │   - 超时/错误处理            │ │
│  │  - data (MindMapData) │   │   - origin 校验             │ │
│  │  - fileName           │   └─────────────┬──────────────┘ │
│  │  - onSave             │                 │                │
│  │  - onExportToKnowledge│   ┌─────────────▼──────────────┐ │
│  └───────────────────────┘   │   <iframe>                  │ │
│                              │   /editor/mind-map.html     │ │
│  ┌───────────────────────┐   │                             │ │
│  │ md-mindmap-convert.ts │   │   simple-mind-map (CDN)     │ │
│  │ MD ↔ 脑图 JSON 互转    │   │   - 脑图渲染                 │ │
│  └───────────────────────┘   │   - 节点增删改/拖拽           │ │
│                              │   - 撤销/重做/快捷键          │ │
│  ┌───────────────────────┐   │   - XMind 解析/导出          │ │
│  │ parse-testcase-md.ts  │   │   - 自定义节点渲染            │ │
│  │ (已有，扩展 Markdown   │   └─────────────────────────────┘ │
│  │  导出能力)             │                                   │
│  └───────────────────────┘                                   │
└──────────────────────────────────────────────────────────────┘
```

**职责划分**：CaseEditor 是纯编辑组件。数据从父级（向导/历史列表）传入，保存通过回调委托给父级。编辑器不直接调用 API，不关心文件格式。

### 改动文件清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `components/usecase-gen/case-editor.tsx` | 重写 | 工具栏 + iframe 容器 + 空状态导入入口 |
| `components/usecase-gen/editor-bridge.ts` | 新增 | postMessage 协议封装（Promise 风格 API） |
| `lib/md-mindmap-convert.ts` | 新增 | `UsecaseModule[]` ↔ 脑图 JSON 双向转换 |
| `lib/parse-testcase-md.ts` | 扩展 | 增加 `modulesToMarkdown()` 导出函数 |
| `public/editor/mind-map.html` | 新增 | iframe 独立页面 |
| `public/editor/mind-map.js` | 新增 | iframe 内 simple-mind-map 初始化 + 消息处理 |
| `public/vendor/simple-mind-map.umd.min.js` | 新增 | simple-mind-map UMD 本地副本 |

**不动**：`generate-wizard.tsx`、`use-output-scanner.ts`、知识库 API、所有 API 路由

> `page.tsx` 需做适配：将 `usecaseTree` 通过 `modulesToMindMap()` 转换后传入，并提供 `onSave` / `onExportToKnowledge` 回调实现。

### 依赖

- `simple-mind-map`：npm 安装，UMD 包拷贝到 `public/vendor/`，iframe 内通过 `<script>` 引用
- 无新增 npm 依赖

---

## 二、编辑和保存流程

### 数据流概览

```
向导 / 空画布（本次入口 A、C）
         │
         ▼
    CaseEditor (纯编辑组件)
         │
         ├─ 编辑中 ←→ iframe (postMessage)
         │
         └─ 保存时 → onSave({ json, xmindBase64 }) 回调
                       │
                       ▼
                  父级决定写回格式：
                  ├─ MD 源文件 → json 通过 md-mindmap-convert 转 Markdown → 写回
                  └─ XMind 源文件 → xmindBase64 解码 → 写回
```

### Props 接口

```ts
interface CaseEditorProps {
  data: MindMapData | null;      // null → 空画布，显示导入入口
  fileName?: string;             // 纯展示（工具栏显示）
  onSave: (result: SaveResult) => Promise<void>;     // 保存回调，父级负责持久化
  onExportToKnowledge: (data: MindMapData) => Promise<void>;  // 反哺知识库
}

interface SaveResult {
  json: MindMapData;          // 脑图 JSON，父级通过 md-mindmap-convert 转为 Markdown
  xmindBase64: string;        // XMind zip 文件的 base64，可直接解码写回
}
```

### 三种入口

**入口 A：生成完成后切换 Tab 传入**
```
用例生成完成 → 用户切换到编辑器 Tab
  → 父级将 usecaseTree 通过 modulesToMindMap() 转为 MindMapData
  → <CaseEditor data={mindMapData} fileName="xxx.md" onSave={...} />
```

**入口 B：历史列表进入（后续迭代）**
```
需要增加 page.tsx 导航逻辑，支持 taskId → 加载文件 → 编辑器 Tab。
本次不包含，留到后续迭代。
```

**入口 C：空数据（导入编辑）**
```
<CaseEditor data={null} onSave={...} />
  → 显示导入入口
  → 用户上传 .xmind / .md → 解析 → iframe 渲染
  → 编辑完成后 onSave 回调，父级创建新文件和任务
```

### 编辑过程

全部在 iframe 内完成，主应用不干预：

- 节点增删改、拖拽移动 → simple-mind-map 内置
- 任意层级自由编辑，不预设语义结构
- 撤销/重做/快捷键 → simple-mind-map 内置
- 修改时上报 dirty 标记

### 保存（由父级回调处理）

```
用户点击「保存」或 Ctrl+S（iframe 上报 saveRequested）
  │
  ▼
编辑器内部：
  ① postMessage getData → 获取脑图 JSON
  ② postMessage exportXmind → iframe 内 transformToXmind() → 返回 base64
  ③ 组装 SaveResult { json, xmindBase64 }
  │
  ▼
调用 props.onSave(result)
  │
  ▼
父级处理持久化逻辑：
  ├─ 源文件为 MD  → mindMapToModules(json) → modulesToMarkdown() → Markdown 文本 → 写回文件
  └─ 源文件为 XMind → xmindBase64 → Buffer.from(base64) → 写回 .xmind
```

### 导出

- **下载 .xmind**：iframe 内 `transformToXmind()` 生成 blob → 浏览器触发下载（不经过服务端）
- **反哺知识库**：调用 `props.onExportToKnowledge(data)` → 父级 POST 到知识库 API

---

## 三、postMessage 通信协议

### 主应用 → iframe（指令）

```ts
{ type: "init",     payload: { data: MindMapData | null, fileName: string } }
{ type: "getData" }
{ type: "undo" }
{ type: "redo" }
{ type: "exportXmind" }
{ type: "importXmind", payload: { base64: string } }    // 导入 .xmind 文件
{ type: "triggerSave" }                                  // 外部触发保存（如 Ctrl+S 转换）
```

### iframe → 主应用（事件上报）

```ts
{ type: "ready" }
{ type: "data",      payload: { json: MindMapData } }
{ type: "xmindBlob", payload: { base64: string } }
{ type: "dirty",     payload: boolean }
{ type: "saveRequested" }     // iframe 内 Ctrl+S 触发
{ type: "error",     payload: { message: string } }
```

### editor-bridge.ts 封装

```ts
const bridge = createEditorBridge(iframeRef);

await bridge.waitReady();              // 等待 iframe 就绪
bridge.init(data, fileName);           // 加载数据（data 为 null 即空画布）
const result = await bridge.getData(); // 获取当前脑图 JSON
const base64 = await bridge.exportXmind(); // 导出 XMind base64
bridge.importXmindFile(base64);        // 导入 .xmind 文件
bridge.onDirty((dirty) => { ... });    // 监听未保存状态
bridge.onSaveRequested(() => { ... }); // 监听 iframe 内 Ctrl+S
```

### Dirty 追踪（含 undo 到原始状态）

- init 时 iframe 内保存原始脑图 JSON 快照
- 每次编辑操作后与原始快照做深度对比
- 完全一致 → dirty = false；否则 dirty = true
- undo 回到原始状态时可自动清除 dirty 标记

### 安全

- iframe `src` 指向同源 `/editor/mind-map.html`
- 消息处理时校验 `event.origin`

---

## 四、数据格式转换

### 纯结构映射，不预设语义

```
根节点: "测试用例"
  ├── 模块A
  │   ├── tc-001 P0 登录验证
  │   │   ├── 前置条件：用户已注册
  │   │   ├── 步骤：输入账号密码点击登录
  │   │   └── 预期：成功跳转首页
  │   └── tc-002 P1 密码错误
  └── 模块B
      └── ...
```

- 每个节点就是 **标题 + 子节点**，不做语义区分
- 转换层只做 **Markdown 层级 ↔ 树深度** 的纯结构映射
- 用户自由组织层级结构

### 核心接口（`lib/md-mindmap-convert.ts`）

```ts
// UsecaseModule[] → 脑图 JSON
function modulesToMindMap(tree: UsecaseModule[], rootTitle: string): MindMapData

// 脑图 JSON → UsecaseModule[]
function mindMapToModules(data: MindMapData): UsecaseModule[]

// UsecaseModule[] → Markdown 文本
function modulesToMarkdown(tree: UsecaseModule[]): string

// Markdown 文本 → UsecaseModule[]（复用现有 parseTestcaseMarkdown）
// 已有，在 lib/parse-testcase-md.ts
```

---

## 五、CaseEditor 页面 UI

### 布局

```
┌──────────────────────────────────────────────────────────────┐
│  工具栏                                                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🔄 撤销 │ 🔄 重做 │ ── │ 💾 保存* │ 📥 下载XMind      │  │
│  │ 📂 导入 │ 🔗 反哺知识库    │   文件名: xxx.md          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │               <iframe> 脑图画布                        │  │
│  │            (simple-mind-map 全屏占据)                  │  │
│  │                                                       │  │
│  │    data != null: 正常渲染脑图                          │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  状态栏: ✅ 已保存 · 共 N 节点    最后保存 14:32              │
└──────────────────────────────────────────────────────────────┘
```

### 空数据状态（data = null）

```
┌──────────────────────────────────────────────────────────────┐
│  工具栏（保存/导出/反哺按钮禁用）                               │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │                📂 导入用例开始编辑                      │  │
│  │                                                       │  │
│  │         拖拽 .xmind / .md 文件到此处                    │  │
│  │             或点击选择文件                              │  │
│  │                                                       │  │
│  │          [从剪贴板粘贴 Markdown]                        │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- **上传 .xmind**：主应用读取文件 → FileReader → ArrayBuffer → base64 → `bridge.importXmindFile(base64)` → iframe 内 parseXmindFile 加载
- **上传 .md**：主应用读取文件文本 → `parseTestcaseMarkdown` → `modulesToMindMap` → `bridge.init(data)`
- **粘贴 Markdown**：编辑器整体区域监听 `paste` 事件，检测剪贴板纯文本 → 尝试 `parseTestcaseMarkdown` 解析 → 成功则按合并逻辑导入，失败则忽略
- 导入后 toolbar 全部激活，进入正常编辑态

### 工具栏

| 按钮 | 状态 | 行为 |
|------|------|------|
| 🔄 撤销 | 始终可用 | postMessage `undo` |
| 🔄 重做 | 始终可用 | postMessage `redo` |
| 💾 保存 | data != null 时可用 | 触发 onSave 回调 |
| 📥 下载 XMind | data != null 时可用 | iframe 内 transformToXmind → 浏览器下载 |
| 📂 导入 | 始终可用 | 点击弹出文件选择器（`.xmind`、`.md`），行为见下方 |
| 🔗 反哺知识库 | data != null 时可用 | 触发 onExportToKnowledge 回调 |

### 导入行为

**data 为 null（空画布）**：直接加载，替换空状态为脑图。

**data 不为 null（已有数据）**：弹窗确认：
- 「替换」→ 丢弃当前数据，加载新文件
- 「合并」→ 去掉新文件的根节点包装，将根节点的所有子节点追加到当前脑图根节点下
- 「取消」→ 不做任何操作

### 状态管理

- **加载态**：骨架屏 / spinner，等待 iframe ready
- **编辑态**：正常操作，dirty 变化 → 保存按钮文件名旁显示 `*`
- **保存中**：保存按钮显示 spinner，禁止重复点击
- **离开拦截**：dirty 为 true 时，页面离开前弹出确认「有未保存修改，是否离开？」
- **空状态**：显示导入入口，保存/导出/反哺按钮禁用

### 键盘快捷键

| 快捷键 | 位置 | 行为 |
|--------|------|------|
| Ctrl+Z | iframe 内 | 撤销 |
| Ctrl+Y | iframe 内 | 重做 |
| Ctrl+S | iframe 内 | 上报 `saveRequested` → 主应用触发 onSave |
| Tab / Enter | iframe 内 | 新增子节点 |
| Delete | iframe 内 | 删除选中节点 |
| F2 | iframe 内 | 重命名节点 |

---

## 六、错误处理

| 场景 | 处理方式 |
|------|----------|
| 导入文件格式不支持 | 提示「仅支持 .xmind 和 .md 文件」 |
| MD 解析失败 | 容错解析（跳过无法识别的行），提示「部分内容解析异常」 |
| XMind 解析失败 | 提示「文件格式损坏，无法加载」 |
| iframe 加载超时（>10s） | 显示重试按钮「脑图加载失败，点击重试」 |
| 保存失败 | props.onSave 内部抛出异常 → 编辑器捕获，提示错误信息，**脑图数据保留不丢失**，dirty 不变 |
| postMessage 通信超时（>5s）| bridge 层 reject，展示通用错误 + 重试入口 |
| 脑图数据过大（>5000 节点） | 加载时显示进度，编辑操作加防抖 |
| 用户离开未保存 | `beforeunload` + React Router 拦截，弹窗确认 |

---

## 七、测试策略

### 单元测试

| 文件 | 测试重点 |
|------|----------|
| `md-mindmap-convert.ts` | 正向/逆向转换、Markdown 输出；空树、单模块、多模块、特殊字符、深层嵌套 |
| `editor-bridge.ts` | 消息序列化/反序列化、超时逻辑、ready 等待、origin 校验 |

### 集成测试

| 场景 | 验证点 |
|------|--------|
| 加载脑图数据 | 传入 data → iframe 渲染 → dirty 为 false |
| 空数据导入 MD | 上传 .md → 解析 → iframe 渲染 → 可编辑 |
| 空数据导入 XMind | 上传 .xmind → iframe 渲染 → 可编辑 |
| 编辑 → 保存 | 修改节点 → dirty 为 true → 保存回调被调用 → dirty 变 false |
| undo 到原始 | 多次编辑 + 全部 undo → dirty 自动变 false |
| 粘贴 Markdown | 剪贴板文本 → 解析 → iframe 渲染 |
| postMessage 通信 | init/getData/dirty/exportXmind 双向消息正常 |

### E2E 测试

| 场景 | 验证点 |
|------|--------|
| 完整编辑流 | 加载 → 增删改节点 → 拖拽排序 → 保存 → 重新加载 → 数据一致 |
| 导出下载 | 下载 .xmind → 本地 XMind 软件可打开 |
| 未保存离开 | 弹窗拦截 → 确认离开 / 取消继续编辑 |
| 空状态导入 | 上传文件 → 正常编辑 → 保存 |

---

## 八、Scope 边界

**本次包含**：
- CaseEditor 脑图可视化重写
- simple-mind-map + iframe 隔离集成
- postMessage 通信协议和 bridge 封装
- MD ↔ 脑图 JSON 双向转换
- 空数据导入入口（上传 .xmind / .md / 粘贴 Markdown）
- 导出下载 XMind
- 反哺知识库回调
- 撤销/重做/快捷键
- dirty 追踪（含 undo 到原始状态自动清除）

**本次不包含**：
- Excel 格式支持（后续迭代）
- 协同编辑
- 脑图主题/样式自定义
- 用例生成向导改动
- 知识库管理改动
- 父级调用方的 API 路由（编辑器本身不调用 API）
