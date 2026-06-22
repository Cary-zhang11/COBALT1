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
- 本次不包含外部 XMind 导入和 Excel 支持（后续迭代）

---

## 一、整体架构

```
┌──────────────────────────────────────────────────────┐
│                 Next.js 主应用 (React)                │
│                                                      │
│  ┌─────────────────────┐   ┌──────────────────────┐ │
│  │   CaseEditor 页面    │   │  postMessage 桥接层   │ │
│  │  (工具栏 + 容器)     │◄─►│  (typed protocol)    │ │
│  └─────────────────────┘   └──────────┬───────────┘ │
│                                        │             │
│  ┌─────────────────────┐              │             │
│  │ md-mindmap-convert  │              │             │
│  │ (MD ↔ 脑图数据互转)  │              │             │
│  └─────────────────────┘              │             │
│                                        │             │
│  ┌─────────────────────┐   ┌──────────▼───────────┐ │
│  │ API Routes          │   │  <iframe>             │ │
│  │ GET usecase-file    │   │  simple-mind-map      │ │
│  │ POST save-usecase   │   │  (独立 HTML 页面)      │ │
│  └─────────────────────┘   │                       │ │
│                            │  - 脑图渲染             │ │
│                            │  - 节点编辑             │ │
│                            │  - 自定义节点            │ │
│                            │  - 快捷键/撤销重做       │ │
│                            │  - XMind 导出           │ │
│                            └───────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 改动文件清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `components/usecase-gen/case-editor.tsx` | 重写 | 工具栏 + iframe 容器，替换原有树+表单模式 |
| `components/usecase-gen/editor-bridge.ts` | 新增 | postMessage 协议封装（Promise 风格 API） |
| `lib/md-mindmap-convert.ts` | 新增 | `UsecaseModule[]` ↔ 脑图 JSON 双向转换 |
| `lib/parse-testcase-md.ts` | 扩展 | 增加 `modulesToMarkdown()` 导出函数 |
| `app/api/tasks/[id]/usecase-file/route.ts` | 新增 | GET：读取任务关联的源文件 |
| `app/api/tasks/[id]/save-usecase/route.ts` | 新增 | POST：保存编辑结果写回源文件 |
| `public/editor/mind-map.html` | 新增 | iframe 独立页面，加载 simple-mind-map |
| `public/editor/mind-map.js` | 新增 | iframe 内初始化逻辑和消息处理 |

**不动**：`generate-wizard.tsx`、`use-output-scanner.ts`、`page.tsx`、知识库 API

---

## 二、编辑和保存流程

### 打开编辑

```
任务详情页 → 点击「编辑用例」
                │
      ┌─────────┴─────────┐
      ▼                   ▼
   有 .xmind 文件       只有 .md 文件
      │                   │
      ▼                   ▼
  GET usecase-file      GET usecase-file
  服务端解压 content    返回 Markdown 文本
      │                   │
      ▼                   ▼
  iframe 内 parseXmind  md-mindmap-convert
  直接渲染脑图           转为脑图 JSON
      │                   │
      └────────┬──────────┘
               ▼
      postMessage init → iframe 渲染
```

### 编辑过程

全部在 iframe 内完成，主应用不干预：

- 节点增删改、拖拽移动 → simple-mind-map 内置
- 任意层级自由编辑，不预设语义结构（不限定哪层是「前置条件」「步骤」等）
- 撤销/重做/快捷键 → simple-mind-map 内置
- iframe 内维护完整数据状态，修改时上报 dirty 标记

### 保存

```
用户点击「保存」
      │
      ▼
postMessage getData → iframe 返回当前脑图 JSON
      │
      ├─ 源文件是 MD ──→ md-mindmap-convert 逆向转 Markdown
      │                  POST /api/tasks/[id]/save-usecase
      │                  服务端 fs.writeFile 覆盖原文件
      │
      └─ 源文件是 XMind ──→ iframe 内 transformToXmind() → base64
                            POST /api/tasks/[id]/save-usecase
                            服务端解码 → fs.writeFile 覆盖原 .xmind
```

### 导出

- **下载 .xmind**：iframe 内 `transformToXmind()` 生成 blob → 浏览器触发下载（不经过服务端）
- **反哺知识库**：POST 用例 JSON 到现有 `/api/knowledge` 接口

---

## 三、postMessage 通信协议

iframe 与主应用之间通过 `postMessage` 通信，所有消息带 `type` 字段。

### 主应用 → iframe（指令）

```
{ type: "init",    payload: { data: mindMapData, sourceType: "md"|"xmind", fileName: string } }
{ type: "getData" }
{ type: "undo" }
{ type: "redo" }
{ type: "exportXmind" }
```

### iframe → 主应用（事件上报）

```
{ type: "ready" }                              // iframe 初始化完成
{ type: "data",    payload: { json: object } }  // 返回当前脑图数据
{ type: "xmindBlob", payload: { base64: string } } // 导出 XMind 的 base64
{ type: "dirty",   payload: boolean }           // 有未保存修改
{ type: "error",   payload: { message: string } }
```

### 封装方式

`editor-bridge.ts` 封装为 Promise 风格的 API：

```ts
const bridge = createEditorBridge(iframeRef);

await bridge.waitReady();              // 等待 iframe 就绪
bridge.init(data, "md", "xxx.md");     // 加载数据
const result = await bridge.getData(); // 获取当前数据
bridge.onDirty((dirty) => { ... });    // 监听未保存状态
```

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
- 用户自由组织层级结构，不限定哪一级必须是前置条件/步骤/预期

### 核心接口（`lib/md-mindmap-convert.ts`）

```ts
// UsecaseModule[] → 脑图 JSON
function modulesToMindMap(tree: UsecaseModule[], rootTitle: string): MindMapData

// 脑图 JSON → UsecaseModule[]
function mindMapToModules(data: MindMapData): UsecaseModule[]

// UsecaseModule[] → Markdown 文本（写回文件用）
function modulesToMarkdown(tree: UsecaseModule[]): string

// Markdown 文本 → UsecaseModule[]（复用现有 parseTestcaseMarkdown）
// 已有，在 lib/parse-testcase-md.ts
```

---

## 五、API 路由

### GET `/api/tasks/[id]/usecase-file`

读取任务关联的源文件。

| 返回 | 场景 |
|------|------|
| `{ type: "md", content: "markdown文本" }` | 源文件为 .md |
| `{ type: "xmind", sheets: [...] }` | 源文件为 .xmind，复用 xmind-preview 解析逻辑 |
| `{ error: "file not found" }` (404) | 文件不存在 |

### POST `/api/tasks/[id]/save-usecase`

保存编辑结果写回源文件。

```ts
// 请求体
{
  fileName: string,    // 源文件名 (xxx.md 或 xxx.xmind)
  content: string,     // MD: 原始 Markdown 文本；XMind: base64 编码的 zip
  format: "md" | "xmind"
}
```

- MD 保存：直接 `fs.writeFile` 覆盖
- XMind 保存：`Buffer.from(content, "base64")` 解码 → `fs.writeFile` 覆盖
- 安全校验：`validatePath` 确保文件路径在任务沙箱内

---

## 六、CaseEditor 页面 UI

### 布局

```
┌─────────────────────────────────────────────────────────┐
│  工具栏                                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🔄 撤销 │ 🔄 重做 │ ── │ 💾 保存* │ 📥 下载XMind │  │
│  │ 🔗 反哺知识库  │             文件名: xxx.md       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │                                                  │  │
│  │              <iframe> 脑图画布                    │  │
│  │           (simple-mind-map 全屏占据)              │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  状态栏: ✅ 已保存 · 共 3 模块 28 条用例   最后保存 14:32   │
└─────────────────────────────────────────────────────────┘
```

### 工具栏

| 按钮 | 行为 |
|------|------|
| 🔄 撤销 | postMessage `undo` |
| 🔄 重做 | postMessage `redo` |
| 💾 保存 | 有 unsaved 时文件名旁显示 `*`，点击触发保存流程 |
| 📥 下载 XMind | iframe 内 transformToXmind → 浏览器下载 |
| 🔗 反哺知识库 | POST 用例数据到知识库 API |

### 状态管理

- **加载态**：骨架屏 / spinner，等待 iframe ready
- **编辑态**：正常操作，iframe 上报 dirty → 保存按钮激活 `*`
- **保存中**：保存按钮显示 spinner，禁止重复点击
- **离开拦截**：dirty 为 true 时，页面离开前弹窗确认

### Props 接口（与现有保持一致）

```ts
interface CaseEditorProps {
  usecaseTree: UsecaseModule[] | null;  // AI 生成后传入
}
```

- 有 `usecaseTree` → 直接转脑图数据渲染，源类型为 md
- `usecaseTree` 为 null → 从任务关联文件加载（md 或 xmind）

---

## 七、错误处理

| 场景 | 处理方式 |
|------|----------|
| 源文件不存在 | 提示「文件已被移除或删除」，返回任务详情页 |
| MD 解析失败 | 容错解析（跳过无法识别的行），提示「部分内容解析异常」 |
| XMind 解析失败 | 提示「文件格式损坏」，不加载编辑 |
| iframe 加载超时（>10s） | 显示重试按钮「脑图加载失败，点击重试」 |
| 保存时磁盘满 / 权限不足 | 返回 507/403，客户端提示错误信息，**脑图数据保留不丢失** |
| 保存时网络中断 | 提示「网络异常，请重试」，dirty 标记不变 |
| postMessage 通信超时（>5s）| bridge 层 reject，展示通用错误 + 重试 |
| 脑图数据过大（>5000 节点） | 加载时显示进度，编辑操作加防抖 |

---

## 八、测试策略

### 单元测试

| 文件 | 测试重点 |
|------|----------|
| `md-mindmap-convert.ts` | 正向转换、逆向转换、Markdown 输出；空树、单模块、多模块、特殊字符、深层嵌套 |
| `editor-bridge.ts` | 消息序列化/反序列化、超时逻辑、ready 等待、origin 校验 |

### 集成测试

| 场景 | 验证点 |
|------|--------|
| 打开 MD 源文件 | 解析 → 转换 → iframe 渲染 → dirty 为 false |
| 打开 XMind 源文件 | 解析 → iframe 渲染 → dirty 为 false |
| 编辑 → 保存 MD | MD 内容正确写回、dirty 变 false |
| 编辑 → 保存 XMind | .xmind zip 结构正确 |
| postMessage 通信 | init/getData/dirty 双向消息正常 |

### E2E 测试

| 场景 | 验证点 |
|------|--------|
| 完整编辑流 | 加载 → 增删改节点 → 拖拽排序 → 保存 → 刷新 → 数据一致 |
| 导出下载 | 下载 .xmind → 本地 XMind 软件可打开 |
| 未保存离开 | 弹窗拦截 → 确认离开 / 取消继续编辑 |

---

## 九、Scope 边界

**本次包含**：
- CaseEditor 脑图可视化重写
- MD / XMind 两种源文件格式的加载和保存
- simple-mind-map + iframe 隔离集成
- postMessage 通信协议和 bridge 封装
- MD ↔ 脑图数据双向转换
- 导出下载 XMind
- 反哺知识库
- 撤销/重做/快捷键

**本次不包含**：
- 外部 XMind 文件上传导入（只解析系统已生成的 XMind）
- Excel 格式支持（后续迭代）
- 协同编辑
- 脑图主题/样式自定义
- 用例生成向导改动
- 知识库管理改动
