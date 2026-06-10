# 用例向导 Step 2 — 筛选与分页 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Step 2 的业务知识和历史用例卡片增加搜索、业务类型筛选、5 条分页"加载更多"功能。

**Architecture:** 在 wizard 内为左右两个卡片各维护 search/businessType/page 状态，Query key 加入这些参数，API 传 `pageSize=5`，翻页追加数据不覆盖。

**Tech Stack:** React 18, TypeScript, TanStack React Query

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `components/usecase-gen/generate-wizard.tsx` | 修改 | 新增筛选状态、修改 Query、替换 Step 2 JSX |

---

### Task 1: 新增筛选状态变量

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`

- [ ] **Step 1: 在选勾状态后添加筛选状态**

在 `selectedHistoryIds` 声明之后添加：

```typescript
// 左侧 — 业务知识筛选
const [kbSearch, setKbSearch] = useState("");
const [kbBusinessType, setKbBusinessType] = useState("");
const [kbPage, setKbPage] = useState(1);

// 右侧 — 历史用例筛选
const [historySearch, setHistorySearch] = useState("");
const [historyBusinessType, setHistoryBusinessType] = useState("");
const [historyPage, setHistoryPage] = useState(1);
```

- [ ] **Step 2: 确认文件保存无语法错误**

```bash
npx tsc --noEmit components/usecase-gen/generate-wizard.tsx 2>&1 | head -5
```

Expected: 无新错误。

- [ ] **Step 3: 提交**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat: add filter state variables for wizard step 2

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 修改 Query — 加筛选参数和分页

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`

- [ ] **Step 1: 替换业务知识 query**

找到 `const { data: knowledgeData } = useQuery({...})`，替换为：

```typescript
const { data: knowledgeData } = useQuery({
  queryKey: ["knowledge", { type: "knowledge", search: kbSearch, businessType: kbBusinessType, page: kbPage }],
  queryFn: () => {
    const params = new URLSearchParams();
    params.set("type", "knowledge");
    params.set("pageSize", "5");
    params.set("page", String(kbPage));
    if (kbSearch) params.set("search", kbSearch);
    if (kbBusinessType) params.set("businessType", kbBusinessType);
    return fetch(`/api/knowledge?${params}`).then((r) => r.json());
  },
});
```

- [ ] **Step 2: 替换手动上传历史 query**

找到 `const { data: uploadedHistoryData } = useQuery({...})`，替换为：

```typescript
const { data: uploadedHistoryData } = useQuery({
  queryKey: ["knowledge", { type: "history_uploaded", search: historySearch, businessType: historyBusinessType, page: historyPage }],
  queryFn: () => {
    const params = new URLSearchParams();
    params.set("type", "history_uploaded");
    params.set("pageSize", "5");
    params.set("page", String(historyPage));
    if (historySearch) params.set("search", historySearch);
    if (historyBusinessType) params.set("businessType", historyBusinessType);
    return fetch(`/api/knowledge?${params}`).then((r) => r.json());
  },
});
```

- [ ] **Step 3: 替换平台生成历史 query**

找到 `const { data: platformHistoryData } = useQuery({...})`，替换为：

```typescript
const { data: platformHistoryData } = useQuery({
  queryKey: ["knowledge-history", { search: historySearch, businessType: historyBusinessType, page: historyPage }],
  queryFn: () => {
    const params = new URLSearchParams();
    params.set("pageSize", "5");
    params.set("page", String(historyPage));
    if (historySearch) params.set("search", historySearch);
    if (historyBusinessType) params.set("businessType", historyBusinessType);
    return fetch(`/api/knowledge/history?${params}`).then((r) => r.json());
  },
});
```

- [ ] **Step 4: 切换主 Tab 或子 Tab 时重置筛选**

找到 mainTab / historySubTab 切换按钮的 onClick，确保重置筛选。在两个 setMainTab 和 setHistorySubTab 的回调中加入：

```typescript
// mainTab 切换
onClick={() => {
  setMainTab(i);
  setBusinessTypeFilter("");
  setKbSearch("");
  setKbBusinessType("");
  setHistorySearch("");
  setHistoryBusinessType("");
}}
```

子 Tab 切换同理。

- [ ] **Step 5: 构建验证**

```bash
npx next build 2>&1 | tail -5
```

Expected: 无新错误。

- [ ] **Step 6: 提交**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat: add search, filter, pagination to wizard step 2 queries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 替换 Step 2 JSX — 搜索框 + 下拉 + 加载更多

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`

- [ ] **Step 1: 替换左侧「业务知识」卡片 JSX**

找到 Step 2 中左侧卡片（`{/* 左侧：业务知识 */}`），替换为：

```typescript
{/* 左侧：业务知识 */}
<div className="bg-card rounded-xl shadow-sm p-5">
  <h3 className="font-semibold mb-1 text-sm">业务知识</h3>
  <p className="text-xs text-muted-foreground mb-3">勾选本次生成需要参考的业务规范文档</p>

  {/* 搜索 + 业务类型筛选 */}
  <div className="flex gap-2 mb-3">
    <input
      type="text"
      placeholder="搜索..."
      value={kbSearch}
      onChange={(e) => { setKbSearch(e.target.value); setKbPage(1); }}
      className="flex-1 border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
    />
    <select
      value={kbBusinessType}
      onChange={(e) => { setKbBusinessType(e.target.value); setKbPage(1); }}
      className="border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
    >
      <option value="">全部</option>
      {BUSINESS_TYPES.map((bt) => (
        <option key={bt} value={bt}>{bt}</option>
      ))}
    </select>
  </div>

  {/* 列表 */}
  <div className="space-y-1.5 max-h-64 overflow-y-auto">
    {!knowledgeData ? (
      <p className="text-xs text-muted-foreground py-4 text-center">加载中...</p>
    ) : ((knowledgeData as { total?: number; items?: { id: string; title: string; businessType: string | null; updatedAt: string }[] }).items?.length || 0) === 0 ? (
      <p className="text-xs text-muted-foreground py-4 text-center">暂无业务知识，可前往知识库上传</p>
    ) : (
      (knowledgeData as { items: { id: string; title: string; businessType: string | null; updatedAt: string }[] }).items.map((item) => (
        <label
          key={item.id}
          className={`flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 transition-colors ${
            selectedKnowledgeIds.has(item.id)
              ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20"
              : "border-border hover:border-muted-foreground/30"
          }`}
        >
          <input
            type="checkbox"
            checked={selectedKnowledgeIds.has(item.id)}
            onChange={() => toggleKnowledge(item.id)}
            className="accent-cyan-500 w-3.5 h-3.5 flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <span className="text-sm truncate block">{item.title}.md</span>
            <span className="text-xs text-muted-foreground">
              {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
              {item.businessType ? ` · ${item.businessType}` : ""}
            </span>
          </div>
        </label>
      ))
    )}
  </div>

  {/* 加载更多 */}
  {((knowledgeData as { total?: number })?.total || 0) > kbPage * 5 && (
    <button
      onClick={() => setKbPage((p) => p + 1)}
      className="mt-2 w-full text-xs text-muted-foreground hover:text-primary py-1 transition-colors"
    >
      共 {(knowledgeData as { total: number }).total} 条，加载更多 →
    </button>
  )}
</div>
```

- [ ] **Step 2: 替换右侧「历史用例范文」卡片 JSX**

找到右侧卡片（`{/* 右侧：历史用例范文 */}`），替换为：

```typescript
{/* 右侧：历史用例范文 */}
<div className="bg-card rounded-xl shadow-sm p-5">
  <h3 className="font-semibold mb-1 text-sm">历史用例范文</h3>
  <p className="text-xs text-muted-foreground mb-3">勾选优秀历史用例作为 few-shot 参考</p>

  {/* 搜索 + 业务类型筛选 */}
  <div className="flex gap-2 mb-3">
    <input
      type="text"
      placeholder="搜索..."
      value={historySearch}
      onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
      className="flex-1 border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
    />
    <select
      value={historyBusinessType}
      onChange={(e) => { setHistoryBusinessType(e.target.value); setHistoryPage(1); }}
      className="border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
    >
      <option value="">全部</option>
      {BUSINESS_TYPES.map((bt) => (
        <option key={bt} value={bt}>{bt}</option>
      ))}
    </select>
  </div>

  {/* 列表 */}
  <div className="space-y-1.5 max-h-64 overflow-y-auto">
    {(!uploadedHistoryData && !platformHistoryData) ? (
      <p className="text-xs text-muted-foreground py-4 text-center">加载中...</p>
    ) : historyOptions.length === 0 ? (
      <p className="text-xs text-muted-foreground py-4 text-center">暂无历史用例</p>
    ) : (
      historyOptions.map((opt) => (
        <label
          key={opt.id}
          className={`flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 transition-colors ${
            selectedHistoryIds.has(opt.id)
              ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20"
              : "border-border hover:border-muted-foreground/30"
          }`}
        >
          <input
            type="checkbox"
            checked={selectedHistoryIds.has(opt.id)}
            onChange={() => toggleHistory(opt.id)}
            className="accent-cyan-500 w-3.5 h-3.5 flex-shrink-0"
          />
          <span className="text-sm truncate">{opt.displayName}</span>
        </label>
      ))
    )}
  </div>

  {/* 加载更多 — 由两个 API 的 total 相加 */}
  {(((uploadedHistoryData as { total?: number })?.total || 0) +
    ((platformHistoryData as { total?: number })?.total || 0)) > historyPage * 5 && (
    <button
      onClick={() => setHistoryPage((p) => p + 1)}
      className="mt-2 w-full text-xs text-muted-foreground hover:text-primary py-1 transition-colors"
    >
      共 {((uploadedHistoryData as { total: number })?.total || 0) + ((platformHistoryData as { total: number })?.total || 0)} 条，加载更多 →
    </button>
  )}
</div>
```

- [ ] **Step 3: 修改 historyPage 控制两个 API 各自翻页**

`historyPage` 控制 `uploadedHistoryData` 和 `platformHistoryData` 两个 query，翻页时各自追加 5 条。`historyOptions` 的 useMemo 合并逻辑不变——页码变化后两个 API 各多返回 5 条，合并列表自然增长。

- [ ] **Step 4: 运行测试**

```bash
npx vitest run components/usecase-gen/__tests__/generate-wizard.test.tsx 2>&1 | tail -5
```

Expected: 所有测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat: add search, filter dropdown, and load-more to wizard step 2 cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 端到端验证

- [ ] **Step 1: 运行全部测试**

```bash
npx vitest run 2>&1 | grep "Tests\|Files"
```

Expected: 全部 PASS。

- [ ] **Step 2: 构建检查**

```bash
npx next build 2>&1 | tail -10
```

Expected: 仅预存 stats/route.ts 错误，无新错误。

- [ ] **Step 3: 手动验证**

启动 `npm run dev`：

| 操作 | 预期 |
|------|------|
| Step 2 左侧搜索"认证" | 业务知识列表过滤，显示匹配项 |
| 左侧选择业务类型"C1C" | 只显示 C1C 的知识 |
| 左侧点"加载更多" | 追加下一页 5 条，总数显示正确 |
| 搜索时页码重置 | 新搜索结果从第 1 页开始 |
| 右侧同理 | 筛选 + 加载更多正常 |
| 勾选跨页保留 | 翻页不丢失已勾选状态 |

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: final verification for wizard step 2 filtering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

*计划版本 v1.0 · 2026-06-02*
