# Wizard 步骤重组 + 解析器修复 实现计划

> **For agentic workers:** 按 task 顺序执行，每步完成后运行关联测试验证。Steps 使用 checkbox (`- [ ]`) 语法跟踪进度。

**Goal:** 重构用例生成向导步骤结构（Step 0 精简、Step 1 改为「关联用例」），修复 scanner 稳定性卡死和 parser 章节匹配两个 bug。

**Architecture:** 4 个独立改动的文件，改动顺序为 parser → scanner → ExecutionPanel → GenerateWizard（后两者有接口依赖）。所有改动不涉及 API 路由、不涉及数据模型变更。

**Tech Stack:** Next.js 14, React 18, TypeScript, Vitest, Testing Library

---

## 文件结构

| 文件 | 职责 | 改动类型 |
|------|------|---------|
| `lib/parse-testcase-md.ts` | md 文件 → tree/summary 解析 | 修复：章节匹配改为关键词 |
| `lib/__tests__/parse-testcase-md.test.ts` | parser 单元测试 | 新增：不同章节编号的测试用例 |
| `hooks/use-output-scanner.ts` | 轮询 output 文件并判定完成 | 修复：去掉 status 条件 |
| `components/usecase-gen/shared/execution-panel.tsx` | 右侧 sidebar 三种模式 | 适配：configSummary 接口简化 |
| `components/usecase-gen/shared/__tests__/execution-panel.test.tsx` | sidebar 单元测试 | 更新：移除 capabilities/dimensions |
| `components/usecase-gen/generate-wizard.tsx` | 向导主组件 | 重构：步骤重组 + state 清理 |
| `components/usecase-gen/__tests__/generate-wizard.test.tsx` | 向导单元测试 | 更新：匹配新步骤名和文案 |

---

### Task 1: parseTestcaseMarkdown — 章节关键词匹配

**Files:**
- Modify: `lib/parse-testcase-md.ts` (重构 extractSection → extractSectionByKeyword)
- Modify: `lib/__tests__/parse-testcase-md.test.ts` (新增关键词匹配测试)

- [ ] **Step 1: 在 parser 中添加 extractSectionByKeyword 函数，替换原有调用**

在 `lib/parse-testcase-md.ts` 中，在原有 `extractSection` 函数后添加 `extractSectionByKeyword`，然后修改 `parseTestcaseMarkdown` 中的两处调用。

首先，添加新函数（放在原有 `extractSection` 函数后面）：

```ts
/**
 * Extract a section by keyword matching instead of hardcoded section numbers.
 * Matches any "## N、keyword" or "## N. keyword" header regardless of the number.
 */
function extractSectionByKeyword(
  markdown: string,
  startKeyword: string,
  endKeyword?: string
): string {
  const startPattern = new RegExp(
    `^##\\s+[一二三四五六七八九十\\d]+[、.]\\s*${startKeyword}`,
    "m"
  );
  const startMatch = markdown.match(startPattern);
  if (!startMatch || startMatch.index === undefined) return "";

  const from = startMatch.index;
  let to = markdown.length;

  if (endKeyword) {
    const endPattern = new RegExp(
      `^##\\s+[一二三四五六七八九十\\d]+[、.]\\s*${endKeyword}`,
      "m"
    );
    const rest = markdown.slice(from + 1);
    const endMatch = rest.match(endPattern);
    if (endMatch && endMatch.index !== undefined) {
      to = from + 1 + endMatch.index;
    }
  }

  return markdown.slice(from, to);
}
```

然后修改 `parseTestcaseMarkdown` 中的调用（约 250-263 行）：

```ts
// 旧
const casesSection = extractSection(
  markdown,
  "## 一、测试用例",
  "## 四、"
);

// 新
const casesSection = extractSectionByKeyword(
  markdown,
  "测试用例",
  "冒烟测试清单"
);
```

```ts
// 旧
const reportSection = extractSection(
  markdown,
  "## 六、完整性检查报告"
);

// 新
const reportSection = extractSectionByKeyword(
  markdown,
  "完整性检查报告"
);
```

- [ ] **Step 2: 添加测试用例 — 不同章节编号**

在 `lib/__tests__/parse-testcase-md.test.ts` 末尾添加两个测试：

```ts
it("matches 测试用例 section with different numbering (## 五、)", () => {
  const md = `# Doc

## 五、完整性检查报告

### 3. 用例数量统计（按功能模块）

- 模块A：3个，占比100%
- **合计**：3个

### 4. 优先级统计
- P0：3个，占比100%
- **合计**：3个，占比100%
`;

  const result = parseTestcaseMarkdown(md);
  // Even without cases section, summary should be extracted correctly
  expect(result.summary.totalCases).toBe(3);
});

it("matches summary section regardless of Chinese number prefix", () => {
  // The existing SAMPLE_MD uses ## 六、完整性检查报告
  // This test verifies the fallback when section numbering varies
  const md = `## 一、测试用例

### 1.1 模块A

- tc-001-p0：测试用例
  - 前置
    - 预期

## 三、冒烟测试清单

- tc-001-p0：用例标题 | 描述

## 五、完整性检查报告

### 3. 用例数量统计（按功能模块）

- 模块A：1个，占比100%
- **合计**：**1个**

### 4. 优先级统计
- P0：1个，占比100%
- **合计**：1个，占比100%
`;

  const result = parseTestcaseMarkdown(md);
  expect(result.tree).not.toBeNull();
  expect(result.summary.totalCases).toBe(1);
  // 冒烟测试清单 section should NOT be parsed as cases
  const cases = result.tree!.flatMap((m) => m.cases);
  expect(cases.length).toBe(1);
});
```

- [ ] **Step 3: 运行测试验证**

```bash
npx vitest run lib/__tests__/parse-testcase-md.test.ts
```

预期：所有测试通过（包括已有的 7 个 + 新增的 2 个）。

- [ ] **Step 4: Commit**

```bash
git add lib/parse-testcase-md.ts lib/__tests__/parse-testcase-md.test.ts
git commit -m "fix(parser): use keyword-based section matching instead of hardcoded numbers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: useOutputScanner — 去掉 status 依赖

**Files:**
- Modify: `hooks/use-output-scanner.ts:172`

- [ ] **Step 1: 修改稳定性检查条件**

在 `hooks/use-output-scanner.ts` 第 172 行，去掉 `status !== "running"` 条件：

```diff
- if (newStableCount >= 2 && status !== "running") {
+ if (newStableCount >= 2) {
```

仅此一行改动。

- [ ] **Step 2: 验证逻辑正确性**

确认进入此分支的前提条件（第 129-136 行）不变：
- `report.tree` 存在
- `newFoundFiles.length > 0`
- `mdFiles.length > 0`（文件名包含「测试用例」的 .md 文件）
- `currentCases > 0`
- `newStableCount >= 2`（totalCases 连续两次轮询不变）

错误处理不受影响（第 88-96 行：status === "failed" / "cancelled" 仍正确截断）。

- [ ] **Step 3: Commit**

```bash
git add hooks/use-output-scanner.ts
git commit -m "fix(scanner): remove status dependency from stability check

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ExecutionPanel — configSummary 接口简化

**Files:**
- Modify: `components/usecase-gen/shared/execution-panel.tsx:21-26,108-110`
- Modify: `components/usecase-gen/shared/__tests__/execution-panel.test.tsx:4-9,28`

- [ ] **Step 1: 更新 ExecutionPanel 接口和渲染**

在 `execution-panel.tsx` 中：

**接口定义** (约 21-26 行) — 删除 `capabilities` 和 `dimensions`：

```ts
configSummary: {
  source: string;
  fewShot: string;
};
```

**Config Preview 渲染** (约 107-113 行) — 删除「已选能力」和「覆盖维度」两行：

```tsx
{[
  ["物料来源", configSummary.source],
  ["few-shot", configSummary.fewShot],
  ["输出格式", "XMind + Markdown"],
].map(([label, value]) => (
  <div
    key={label as string}
    className="flex items-center justify-between text-xs"
  >
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium max-w-[100px] truncate">
      {value}
    </span>
  </div>
))}
```

- [ ] **Step 2: 更新测试文件**

在 `execution-panel.test.tsx` 中，更新 `defaultConfig` 并修复引用 `capabilities`/`dimensions` 的测试：

**更新 defaultConfig** (约 4-9 行)：

```ts
const defaultConfig = {
  source: "文本输入",
  fewShot: "1 份",
};
```

**更新 Mode 1 测试**（约 28 行），`screen.getByText("3/4")` 已失效，改为验证新的显示内容：

```ts
it("renders config summary on Step 0", () => {
  render(
    <ExecutionPanel
      taskId={null} generating={false} wizStep={0} hasResult={false}
      configSummary={defaultConfig} foundFiles={[]}
      onDownloadFile={noop} onScrollToAITweak={noop}
      onScrollToRating={noop} onNavigateToEditor={noop}
      onReconfigure={noop}
    />
  );
  expect(screen.getByText("当前配置预览")).toBeDefined();
  expect(screen.getByText("文本输入")).toBeDefined();
  expect(screen.getByText("1 份")).toBeDefined();  // fewShot value, replaces "3/4"
});
```

- [ ] **Step 3: 运行测试验证**

```bash
npx vitest run components/usecase-gen/shared/__tests__/execution-panel.test.tsx
```

预期：9 个测试全部通过。

- [ ] **Step 4: Commit**

```bash
git add components/usecase-gen/shared/execution-panel.tsx components/usecase-gen/shared/__tests__/execution-panel.test.tsx
git commit -m "refactor(execution-panel): remove capabilities/dimensions from configSummary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: GenerateWizard — 步骤重组

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx`
- Modify: `components/usecase-gen/__tests__/generate-wizard.test.tsx`

这是最大的改动。分 6 个小步骤：

- [ ] **Step 1: 更新 STEPS 数组和 import**

```diff
- const STEPS = ["输入物料", "选择平台能力", "生成并预览"];
+ const STEPS = ["输入物料", "关联用例", "生成并预览"];
```

```diff
- import {
-   mockRecentReqs, mockFewShotExamples, mockCapabilities,
-   mockDimensions, mockQuickActions,
- } from "./shared/mock-data";
+ import { mockRecentReqs, mockFewShotExamples } from "./shared/mock-data";
```

- [ ] **Step 2: 删除 capabilities/dimensions 相关 state**

```diff
- const capabilitiesRef = useRef(mockCapabilities.map((c) => ({ ...c })));
- const dimensionsRef = useRef(mockDimensions.map((d) => ({ ...d })));
  const fewShotRef = useRef(mockFewShotExamples.map((f) => ({ ...f })));
- const [capabilities, setCapabilities] = useState(capabilitiesRef.current);
- const [dimensions, setDimensions] = useState(dimensionsRef.current);
  const [fewShot, setFewShot] = useState(fewShotRef.current);
```

- [ ] **Step 3: Step 0 — 删除「最近需求」和「复用历史用例」卡片**

删除当前在 Step 0 末尾（约 362-387 行）的两列卡片 JSX：

```diff
- <div className="grid grid-cols-2 gap-4">
-   <div className="bg-card rounded-xl shadow-sm p-5">
-     <h3 className="font-semibold mb-3 text-sm">最近需求</h3>
-     <div className="space-y-2">
-       {mockRecentReqs.map((req) => (...))}
-     </div>
-   </div>
-   <div className="bg-card rounded-xl shadow-sm p-5">
-     <h3 className="font-semibold mb-3 text-sm">复用历史用例作 few-shot</h3>
-     <div className="space-y-2">
-       {fewShot.map((ex, i) => (...))}
-     </div>
-   </div>
- </div>
```

- [ ] **Step 4: 修改按钮文案**

```diff
- 下一步：选择平台能力
+ 下一步：关联用例
```

- [ ] **Step 5: Step 1 (wizStep === 1) — 替换全部内容**

删除原来的 capabilities + dimensions + params JSX（约 414-441 行），替换为从 Step 0 搬来的最近需求 + few-shot：

```tsx
{/* Step 1: 关联用例 */}
{wizStep === 1 && (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-card rounded-xl shadow-sm p-5">
        <h3 className="font-semibold mb-3 text-sm">最近需求</h3>
        <div className="space-y-2">
          {mockRecentReqs.map((req) => (
            <div key={req.id} onClick={() => setSelectedReq(selectedReq === req.id ? null : req.id)}
              className={`border rounded-lg px-3 py-2 cursor-pointer ${selectedReq === req.id ? "border-cyan-500 bg-cyan-50" : "border-border hover:border-muted-foreground/30"}`}>
              <span className="text-sm font-medium">{req.name}</span>
              <p className="text-xs text-muted-foreground mt-0.5">{req.date} · {req.count}个用例</p>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-card rounded-xl shadow-sm p-5">
        <h3 className="font-semibold mb-3 text-sm">复用历史用例作 few-shot</h3>
        <div className="space-y-2">
          {fewShot.map((ex, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={ex.selected} onChange={() => { const n = [...fewShot]; n[i] = { ...n[i], selected: !ex.selected }; setFewShot(n); }} className="accent-cyan-500 w-3.5 h-3.5" />
              <span className="text-sm">{ex.name}</span>
              <span className="text-xs text-muted-foreground">({ex.count}条)</span>
            </label>
          ))}
        </div>
      </div>
    </div>
    <div className="flex justify-between">
      <button onClick={() => setWizStep(0)}
        className="border border-border text-muted-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:border-muted-foreground/40 flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" />上一步
      </button>
      <button onClick={startGenerate} disabled={generating}
        className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2">
        {generating ? <><Loader2 className="w-4 h-4 animate-spin" />生成中...</> : <><Wand2 className="w-4 h-4" />开始生成</>}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: 更新 configSummary（约 644-655 行）**

删除 capabilities 和 dimensions 字段：

```tsx
configSummary={{
  source: uploadedFiles.length > 0
    ? uploadedFiles.map((f) => f.name).join(", ")
    : selectedReq
    ? "最近需求"
    : requirementText
    ? "文本输入"
    : "未选择",
  fewShot: `${fewShot.filter((f) => f.selected).length} 份`,
}}
```

- [ ] **Step 7: 更新测试文件**

在 `generate-wizard.test.tsx` 中更新步骤名称和相关断言：

```diff
- expect(screen.getByText("选择平台能力")).toBeDefined();
+ expect(screen.getByText("关联用例")).toBeDefined();
```

```diff
- expect(screen.getByText("下一步：选择平台能力")).toBeDefined();
+ expect(screen.getByText("下一步：关联用例")).toBeDefined();
```

```diff
- await userEvent.click(screen.getByText("下一步：选择平台能力"));
+ await userEvent.click(screen.getByText("下一步：关联用例"));
```

（此文案在测试中出现 3 次，全部替换。）

还有 Step 2 导航测试中检查 "知识库与规范增强" 的断言需要改为检查新内容：

```diff
  it("navigates to step 2 when clicking '下一步'", async () => {
    render(<GenerateWizard {...defaultProps} />);
    await userEvent.type(
      screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处..."),
      "测试需求内容"
    );
    const nextBtn = screen.getByText("下一步：关联用例");
    await userEvent.click(nextBtn);
-   expect(screen.getByText("知识库与规范增强")).toBeDefined();
+   expect(screen.getByText("复用历史用例作 few-shot")).toBeDefined();
  });
```

```diff
  it("shows generate button in step 2", async () => {
    render(<GenerateWizard {...defaultProps} />);
    await userEvent.type(
      screen.getByPlaceholderText("将需求描述、用户故事或功能说明粘贴到此处..."),
      "测试需求内容"
    );
-   await userEvent.click(screen.getByText("下一步：选择平台能力"));
+   await userEvent.click(screen.getByText("下一步：关联用例"));
    expect(screen.getByText("开始生成")).toBeDefined();
  });
```

- [ ] **Step 8: 运行 wizard 测试验证**

```bash
npx vitest run components/usecase-gen/__tests__/generate-wizard.test.tsx
```

预期：6 个测试全部通过。

- [ ] **Step 9: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx components/usecase-gen/__tests__/generate-wizard.test.tsx
git commit -m "refactor(wizard): restructure steps - remove capabilities, move history/few-shot to step 1

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 全量回归测试

- [ ] **Step 1: 运行所有相关测试**

```bash
npx vitest run components/usecase-gen/ lib/
```

预期：所有测试通过，无回归。

- [ ] **Step 2: TypeScript 编译检查**

```bash
npx tsc --noEmit
```

预期：无类型错误。

---

### 改动汇总

| 顺序 | Task | 文件数 | 说明 |
|------|------|--------|------|
| 1 | parseTestcaseMd 关键词匹配 | 2 | 修复 qualityScore=0 bug |
| 2 | Scanner 去 status 依赖 | 1 | 修复转圈卡死 bug |
| 3 | ExecutionPanel 接口简化 | 2 | 去掉 capabilities/dimensions |
| 4 | GenerateWizard 步骤重组 | 2 | 主改动：UI 重组 + state 清理 |
| 5 | 全量回归 | - | 验证 |
