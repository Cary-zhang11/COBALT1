# Wizard 步骤重组 + 解析器修复 设计文档

> 日期：2026-06-01

---

## 概述

重构用例生成向导的步骤结构，并修复生成结果页的卡死 bug。

### 背景

- 当前「最近需求」和「复用历史用例」放在 Step 0 底部，占用空间且逻辑上不属于「输入物料」
- Step 1「选择平台能力」的 capabilities/dimensions/params 都是 mock 占位数据，不参与生成逻辑
- Step 2 生成完成后 scanner 稳定性检查依赖 task status，CLI 未及时 emit pause 时会导致永久转圈
- `parseTestcaseMarkdown` 用硬编码章节编号匹配，AI 输出编号变化时解析部分失效

---

## 架构变更

### 步骤重组

```
当前：  输入物料  →  选择平台能力  →  生成并预览
改为：  输入物料  →  关联用例      →  生成并预览
```

### Step 0「输入物料」

**保留**：
- 文件上传卡片（点击上传 / 拖拽，支持 .docx .pdf .md .txt）
- 文本输入框 + 字数统计（2000 字限制）

**删除**：
- 「最近需求」卡片（mock 数据）
- 「复用历史用例作 few-shot」卡片（mock 数据）

**按钮文案**：「下一步：选择平台能力」→「下一步：关联用例」

**验证**：至少一个文件或文本输入才能进入下一步（不变）

### Step 1「关联用例」（原 Step 1）

**删除**：
- 「知识库与规范增强」capabilities 勾选区
- 「覆盖维度配置」dimensions 切换按钮区
- 「生成参数」只读展示区（输出格式/粒度/优先级）
- 关联 state：`capabilities`、`dimensions`、`capabilitiesRef`、`dimensionsRef`

**移入**（从 Step 0 搬来）：
- 「最近需求」卡片 — 单选，点击选中后高亮。生成时将选中需求的名称合并到 input 中作为附加参考
- 「复用历史用例作 few-shot」卡片 — 多选 checkbox，选中的 few-shot 示例合并到生成上下文

**按钮**：「上一步」+「开始生成」（不变）

**数据**：继续使用 mock 数据（`mockRecentReqs`、`mockFewShotExamples`），后续迭代再接入真实数据

### Step 2「生成并预览」

无 UI 变动。只修复轮询完成判定逻辑。

---

## Bug 修复

### Bug 1：Scanner 稳定性检查卡死

**文件**：`hooks/use-output-scanner.ts` 第 172 行

**根因**：完成条件 `status !== "running"` 依赖 task status 变为非 running。如果 CLI 进程写完文件但迟迟不 emit pause，status 一直保持 running，scanner 永远不会触发 onResult。

**修复**：进入稳定性检查分支的前提已经是 `report.tree` 存在 + `mdFiles.length > 0` + `currentCases > 0`（文件已落盘、解析成功），不需要再看 status。去掉 status 条件，纯靠 totalCases 稳定判定：

```diff
- if (newStableCount >= 2 && status !== "running") {
+ if (newStableCount >= 2) {
    callbacksRef.current.onResult?.(report);
    stop();
    return;
  }
```

### Bug 2：parseTestcaseMarkdown 章节编号硬编码

**文件**：`lib/parse-testcase-md.ts`

**根因**：章节起始/终止标记用硬编码数字匹配（`## 六、完整性检查报告`），AI 输出编号变化时匹配失败。实际文件中 `## 五、完整性检查报告` 无法被 `## 六、` 匹配，导致 qualityScore 始终为 0。

**修复**：重构 `extractSection`，改为接收章节名称关键词而非硬编码标题：

```ts
function extractSectionByKeyword(
  markdown: string,
  startKeyword: string,
  endKeyword?: string
): string {
  const startPattern = new RegExp(`^##\\s+[一二三四五六七八九十\\d]+、${startKeyword}`, "m");
  const startMatch = markdown.match(startPattern);
  if (!startMatch) return "";
  
  const from = startMatch.index!;
  let to = markdown.length;
  
  if (endKeyword) {
    const endPattern = new RegExp(`^##\\s+[一二三四五六七八九十\\d]+、${endKeyword}`, "m");
    const endMatch = markdown.slice(from + 1).match(endPattern);
    if (endMatch) {
      to = from + 1 + endMatch.index!;
    }
  }
  
  return markdown.slice(from, to);
}

// 替换原有调用
const casesSection = extractSectionByKeyword(markdown, "测试用例", "冒烟测试清单");
const reportSection = extractSectionByKeyword(markdown, "完整性检查报告");
```

---

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `components/usecase-gen/generate-wizard.tsx` | 重构 | STEPS 改名；Step 0 删两块；Step 1 删三块+加两块；清理 capabilities/dimensions state；按钮文案更新；configSummary 简化 |
| `components/usecase-gen/shared/execution-panel.tsx` | 适配 | configSummary 接口去掉 capabilities/dimensions/fewShot 字段 |
| `hooks/use-output-scanner.ts` | 修复 | 稳定性检查去掉 status !== "running" 条件 |
| `lib/parse-testcase-md.ts` | 修复 | 章节匹配从硬编码编号改为关键词匹配 |

**不动**：`ai-tweak-panel.tsx`、`rating-panel.tsx`、`output-files.tsx`、`module-overview-table.tsx`、`history-list.tsx`、`use-output-scanner.ts`（除一行外）、所有 API 路由、`page.tsx`

---

## 测试策略

1. **GenerateWizard**：Step 0 渲染验证（最近需求/few-shot 不存在）；Step 1 渲染验证（capabilities/dimensions/params 不存在，最近需求/few-shot 存在）；按钮文案验证；步骤条名称验证
2. **ExecutionPanel**：configSummary 简化后不传 capabilities/dimensions/fewShot，不影响渲染
3. **useOutputScanner**：status 为 running 时 totalCases 稳定 2 轮后也能触发 onResult
4. **parseTestcaseMarkdown**：用不同章节编号的 md 文件验证关键词匹配（如「## 五、完整性检查报告」「## 六、完整性检查报告」均正确匹配）

---

## Scope 边界

**本次包含**：
- Step 0/1 步骤重组和 UI 重排
- 步骤条改名
- capabilities/dimensions/params mock 数据清理
- Scanner 稳定性检查去 status 依赖
- parseTestcaseMarkdown 章节匹配改为关键词

**本次不包含**：
- 最近需求/few-shot 接入真实数据（后续迭代）
- Step 2 结果页 UI 改动
- 历史列表 / 用例编辑 Tab 改动
- API 路由改动
