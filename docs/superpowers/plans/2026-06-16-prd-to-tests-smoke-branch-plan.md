# PRD→测试用例：增加开发冒烟用例并行分支 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `prd-to-tests-new` 技能中新增一条后台并行分支，通过 `Agent` + `run_in_background: true` 启动子 agent 执行三方分析→红蓝对抗→冒烟用例生成，与主线全面用例并行产出。

**Architecture:** Step 1 文档解析完成后，主 agent 启动后台子 agent 跑冒烟分支，然后立即继续主线 Step 2-5。后台子 agent 复用 `prd-to-tests-smoke/references/` 下 4 个规则文件，独立完成并写入 3 份文件到 `{TASK_OUTPUT_DIR}`。前端结果页 2 个过滤条件追加 `.xlsx` 以展示 Excel 下载。

**Tech Stack:** Markdown (skill 规则), TypeScript/React (前端过滤条件)

---

### Task 1: SKILL.md — 扩展预加载清单

**Files:**
- Modify: `.claude/skills/prd-to-tests-new/SKILL.md:18-22`

- [ ] **Step 1: 预加载清单从 3 个文件扩展到 7 个**

找到「强制使用规则」中的预加载清单，将原来的 3 个 reference 文件 + 新增 4 个跨 skill 引用。改前：

```markdown
2. 读取全部参考文件（以下 3 个文件，缺一不可）
   - `references/test_dimensions.md` — 8 个测试维度的详细定义、覆盖范围、拆分规则、裁剪规则
   - `references/generation_rules.md` — 用例编写规范（模块划分/分组/校验链/模板/防漏等全部规则）
   - `references/output_template.md` — 输出文档结构模板、冒烟清单选取规则、完整性自检清单
```

改后：

```markdown
2. 读取全部参考文件（以下 7 个文件，缺一不可）
   - `references/test_dimensions.md` — 8 个测试维度的详细定义、覆盖范围、拆分规则、裁剪规则
   - `references/generation_rules.md` — 用例编写规范（模块划分/分组/校验链/模板/防漏等全部规则）
   - `references/output_template.md` — 输出文档结构模板、完整性自检清单
   - `../prd-to-tests-smoke/references/three_party_analysis.md` — 三方分析 + 红蓝对抗规则（冒烟分支）
   - `../prd-to-tests-smoke/references/step02_decomposition.md` — P0 功能点拆分规则（冒烟分支）
   - `../prd-to-tests-smoke/references/smoke_test_generation.md` — 冒烟用例生成规则（冒烟分支）
   - `../prd-to-tests-smoke/references/step05_output.md` — 输出格式与校验规则（冒烟分支）
```

> 注意 `output_template.md` 的描述中删除了「冒烟清单选取规则」（该章节本次会被移除）。

- [ ] **Step 2: 更新规则章节对应表，追加冒烟分支行**

找到 `| Step 5 输出校验 |` 行后面，追加一行：

```markdown
| Step 6 冒烟分支 | `../prd-to-tests-smoke/references/` 下 4 个文件 | 三方分析 → 红蓝对抗 → 冒烟用例生成 |
```

- [ ] **Step 3: 验证文件存在**

运行命令确认 4 个跨 skill 引用文件存在：

```bash
ls -la .claude/skills/prd-to-tests-smoke/references/three_party_analysis.md \
      .claude/skills/prd-to-tests-smoke/references/step02_decomposition.md \
      .claude/skills/prd-to-tests-smoke/references/smoke_test_generation.md \
      .claude/skills/prd-to-tests-smoke/references/step05_output.md
```

预期：4 个文件全部存在。

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/prd-to-tests-new/SKILL.md
git commit -m "feat: extend preload list with 4 smoke branch reference files
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: SKILL.md — 扩展进度标记表

**Files:**
- Modify: `.claude/skills/prd-to-tests-new/SKILL.md:48-56`

- [ ] **Step 1: 进度标记表追加 3 行冒烟标记**

找到 `| Step 5 后半: 导出 |` 行，在它后面追加 3 行：

```markdown
| Step 6 冒烟-三方分析 | `冒烟-三方分析` | 三方分析 + 红蓝对抗完成后 |
| Step 6 冒烟-用例生成 | `冒烟-用例生成` | 冒烟用例生成 + 输出校验完成后 |
| Step 6 冒烟-导出 | `冒烟-导出` | Excel 转换完成后 |
```

- [ ] **Step 2: 强制要求数量从 5 改为 8**

找到 `**强制要求**：以上 5 个标记必须全部输出`，将 `5` 改为 `8`。

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/prd-to-tests-new/SKILL.md
git commit -m "feat: add 3 smoke branch progress markers to SKILL.md
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: SKILL.md — 更新输出文档结构描述（去冒烟清单）

**Files:**
- Modify: `.claude/skills/prd-to-tests-new/SKILL.md:270`
- Modify: `.claude/skills/prd-to-tests-new/SKILL.md:298-305`

- [ ] **Step 1: 输出文档结构移除「冒烟清单」**

找到 Step 5 中的 `**输出文档结构：**` 行（约 270 行）：

```markdown
**输出文档结构：**
1. 文档头部 → 2. 测试用例 → 3. 网络相关 → 4. 兼容性 → 5. 埋点（如有）→ 6. 冒烟清单 → 7. 完整性检查报告
```

改为：

```markdown
**输出文档结构：**
1. 文档头部 → 2. 测试用例 → 3. 网络相关 → 4. 兼容性 → 5. 埋点（如有）→ 6. 完整性检查报告
```

- [ ] **Step 2: 约束清单追加冒烟分支约束**

找到「约束清单」的最后一行（`主动补充的用例必须在前置条件行尾标注...`），追加：

```markdown
- 冒烟分支通过 `Agent` + `run_in_background: true` 启动后台子 agent，与主线并行执行
- 冒烟分支任一环节失败不影响主线输出，仅在对应输出中注明失败原因
- 冒烟分支的所有输出文件写入 `{TASK_OUTPUT_DIR}`，与主线同级
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/prd-to-tests-new/SKILL.md
git commit -m "docs: remove smoke checklist from output structure, add smoke branch constraints
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: SKILL.md — 新增 Step 6 章节（核心改动）

**Files:**
- Modify: `.claude/skills/prd-to-tests-new/SKILL.md` — 在 Step 5 末尾（`[WF:done:导出格式]` 之后）插入新章节

- [ ] **Step 1: 找到插入位置**

确认 Step 5 的最后一个进度标记 `[WF:done:导出格式]` 所在行号，在其后的 `---` 分隔线之前插入 Step 6。

- [ ] **Step 2: 插入 Step 6 完整章节**

在 Step 5 的 `---` 结束分隔线之前（即「约束清单」章节之前），插入以下内容：

```markdown
### Step 6: 开发冒烟用例（后台并行分支）

Step 1 完成（`[WF:done:文档解析]`输出后），**立即**通过 `Agent`工具 + `run_in_background: true`启动冒烟分支子任务。子任务启动后主线立即继续 Step 2-5，两条分支真正并行执行。

**子任务 prompt 模板：**

```
你是测试专家，负责对以下 PRD 需求执行三方分析 + 红蓝对抗 + 生成开发冒烟用例。

## 输入文件
- PRD 解析结果：{TASK_OUTPUT_DIR}/{需求名称}_source.md
- PRD 图片目录：{TASK_OUTPUT_DIR}/{需求名称}_images/
- 输出目录：{TASK_OUTPUT_DIR}

## 执行规则
按以下顺序读取并执行规则文件：
1. ../prd-to-tests-smoke/references/three_party_analysis.md — 先执行第一阶段（三方独立分析），再执行第二阶段（红蓝对抗），最后执行第三阶段（结论汇总）
2. ../prd-to-tests-smoke/references/step02_decomposition.md — 仅拆分 P0 功能点
3. ../prd-to-tests-smoke/references/smoke_test_generation.md — 生成冒烟用例
4. ../prd-to-tests-smoke/references/step05_output.md — 输出校验

## 产出物
1. {TASK_OUTPUT_DIR}/{需求名称}_三方分析.md
2. {TASK_OUTPUT_DIR}/{需求名称}_开发冒烟用例.md
3. {TASK_OUTPUT_DIR}/{需求名称}_开发冒烟用例.xlsx（Excel 转换）

## 进度标记
每个阶段完成后输出对应标记：
- 三方分析 + 红蓝对抗完成 → [WF:done:冒烟-三方分析]
- 冒烟用例生成 + 校验完成 → [WF:done:冒烟-用例生成]
- Excel 转换完成 → [WF:done:冒烟-导出]

## 约束
- 冒烟用例 5-20 条，全部 P0，每步 ≤5 步
- 前置条件开发本地可快速准备
- 三方分析中关键风险必须有对应冒烟用例覆盖
- 任一环节失败不影响主线，仅在输出中注明失败原因
```

**Excel 转换命令：**

冒烟用例 Markdown 写入完成后，执行：

```bash
python "{SKILL_DIR}/../prd-to-tests-smoke/scripts/md2excel.py" "{TASK_OUTPUT_DIR}/{需求名称}_开发冒烟用例.md" "{TASK_OUTPUT_DIR}/{需求名称}_开发冒烟用例.xlsx"
```

**等待与汇总：** 主线 Step 5 末尾，使用 `TaskOutput`工具等待冒烟分支子任务完成（`block: true`），然后汇总最终交付物清单（主线 2 份 + 冒烟 3 份 = 共 5 份文件）。

```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/prd-to-tests-new/SKILL.md
git commit -m "feat: add Step 6 — parallel smoke branch via background sub-agent
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: output_template.md — 文件清单+3，删除冒烟清单章节

**Files:**
- Modify: `.claude/skills/prd-to-tests-new/references/output_template.md:30-34`（文件清单表）
- Modify: `.claude/skills/prd-to-tests-new/references/output_template.md:154-162`（删除）
- Modify: `.claude/skills/prd-to-tests-new/references/output_template.md:165`（重编号）
- Modify: `.claude/skills/prd-to-tests-new/references/output_template.md:270-279`（删除冒烟清单选取规则）

- [ ] **Step 1: 文件清单表格追加 3 行**

找到 `| {需求名称}_测试用例.md | 最终输出的测试用例文档 |` 行，在后面追加：

```markdown
| `{需求名称}_三方分析.md` | 冒烟分支：三方分析报告 |
| `{需求名称}_开发冒烟用例.md` | 冒烟分支：开发冒烟用例 |
| `{需求名称}_开发冒烟用例.xlsx` | 冒烟分支：Excel 格式冒烟用例 |
```

- [ ] **Step 2: 删除「五、冒烟测试清单」章节**

删除第 154-162 行（含前后 `---` 分隔线）：

```
---
## 五、冒烟测试清单

> 以下用例列表为冒烟测试必须执行的用例，也作为版本回归测试的基础清单。

- tc-001-p0：{模块} | {标题} | 自动化: 是
- tc-002-p0：{模块} | {标题} | 自动化: 是

---
```

- [ ] **Step 3: 重编号「六、完整性检查报告」→「五、完整性检查报告」**

找到 `## 六、完整性检查报告`，改为 `## 五、完整性检查报告`。

- [ ] **Step 4: 删除「冒烟清单选取规则」章节**

删除 lines 270-279（含前后 `---` 分隔线）：

```
---
---
## 冒烟清单选取规则

冒烟清单包含以下优先级的所有用例：
- 全部 P0（核心阻断）
- 全部 P1（重要功能）
- 全部 P2（次要功能）
- 全部 P3（体验优化）
- 全部兼容性用例（无论优先级）

即：所有用例都纳入冒烟清单。冒烟清单与回归测试清单一致。

---
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/prd-to-tests-new/references/output_template.md
git commit -m "docs: add smoke output files to file list, remove old smoke checklist section
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: generate-wizard.tsx — step3OutputCount 追加 .xlsx

**Files:**
- Modify: `components/usecase-gen/generate-wizard.tsx:748-756`

- [ ] **Step 1: 过滤条件追加 .xlsx**

找到约 754 行的 `step3OutputCount` 中的 filter 条件。改前：

```typescript
(f.name.endsWith(".md") || f.name.endsWith(".xmind"))
```

改后：

```typescript
(f.name.endsWith(".md") || f.name.endsWith(".xmind") || f.name.endsWith(".xlsx"))
```

完整上下文（确认匹配准确）：

```typescript
const step3OutputCount = useMemo(
    () =>
      mergedOutputFiles.filter(
        (f) =>
          !f.name.includes("_source") &&
          !f.name.includes("archive/") &&
          (f.name.endsWith(".md") || f.name.endsWith(".xmind") || f.name.endsWith(".xlsx"))
      ).length,
    [mergedOutputFiles]
  );
```

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/generate-wizard.tsx
git commit -m "feat: include .xlsx files in wizard step3 output count
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: output-files.tsx — isDisplayable 追加 .xlsx

**Files:**
- Modify: `components/usecase-gen/shared/output-files.tsx:18-22`

- [ ] **Step 1: isDisplayable 函数追加 .xlsx**

找到 `isDisplayable` 函数（约 18-22 行）。改前：

```typescript
function isDisplayable(name: string): boolean {
  if (name.includes("_source")) return false;
  if (name.includes("archive/")) return false;
  return name.endsWith(".md") || name.endsWith(".xmind");
}
```

改后：

```typescript
function isDisplayable(name: string): boolean {
  if (name.includes("_source")) return false;
  if (name.includes("archive/")) return false;
  return name.endsWith(".md") || name.endsWith(".xmind") || name.endsWith(".xlsx");
}
```

> 不用改 `isPreviewable()` — `.xlsx` 不可预览，只可下载，现有逻辑正确。

- [ ] **Step 2: Commit**

```bash
git add components/usecase-gen/shared/output-files.tsx
git commit -m "feat: display .xlsx files in OutputFiles download list
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 端到端验证

- [ ] **Step 1: 确认所有改动文件存在且语法正确**

```bash
# 确认 SKILL.md 无格式问题
head -5 .claude/skills/prd-to-tests-new/SKILL.md

# 确认 output_template.md 章节编号连续（一、测试用例 → 二、网络相关 → 三、兼容性 → 四、埋点测试 → 五、完整性检查报告）
grep "^## [一二三四五六七八九]" .claude/skills/prd-to-tests-new/references/output_template.md

# 确认前端文件通过 TypeScript 编译
npx tsc --noEmit --pretty components/usecase-gen/generate-wizard.tsx components/usecase-gen/shared/output-files.tsx 2>&1 | head -20
```

预期输出：
- SKILL.md 头 5 行正常显示
- output_template.md 章节：一、二、三、四、五（连续，无跳跃，无「冒烟」字样）
- TypeScript 编译无错误

- [ ] **Step 2: 确认跨 skill 脚本可调用**

```bash
python .claude/skills/prd-to-tests-smoke/scripts/md2excel.py --help 2>&1 || echo "脚本存在但无 --help（预期行为）"
```

预期：脚本文件存在且可被 Python 解析（报错信息非 "No such file" 即可）。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: end-to-end verification of smoke branch integration
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 更新流程图（可选）

**Files:**
- Create/Modify: `.claude/skills/prd-to-tests-new/workflow_flowchart.md`

- [ ] **Step 1: 追加冒烟分支节点**

在 `workflow_flowchart.md` 中追加冒烟并行分支的 mermaid 节点描述。（如该文件为 PNG 则跳过此步骤，仅做备注。）

- [ ] **Step 2: Commit 或跳过**

```bash
# 如果文件有改动：
git add .claude/skills/prd-to-tests-new/workflow_flowchart.md
git commit -m "docs: update workflow flowchart with smoke branch
Co-Authored-By: Claude <noreply@anthropic.com>"
# 否则跳过此 commit
```
