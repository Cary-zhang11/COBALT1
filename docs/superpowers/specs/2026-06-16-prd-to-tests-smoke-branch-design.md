# PRD→测试用例：增加开发冒烟用例并行分支

> **创建日期**: 2026-06-16
> **状态**: 已确认
> **影响范围**: `.claude/skills/prd-to-tests-new/`

---

## 一、目标

在 `prd-to-tests-new` 技能中增加一条后台并行分支，产出高质量开发冒烟用例（三方分析报告 + 精简冒烟用例 + Excel），与现有全面用例生成流程共享输入解析、真正并行执行、互不阻塞。

## 二、背景

当前 `prd-to-tests-new` 的「冒烟测试清单」章节实际上将所有用例（P0-P3 + 兼容性）全部列入，是回归测试清单而非真正的开发冒烟用例。开发人员在提测前需要一个精简、可快速执行（5-20 条、每步 ≤5 步）的冒烟用例集来快速验证核心流程是否可用。

`prd-to-tests-smoke` 技能已有成熟的三方分析 + 红蓝对抗 + 冒烟用例生成规则，将其作为后台子任务引入 `prd-to-tests-new`，以最少改动实现完整冒烟产出。

## 三、整体架构

```
Step 0-1: 规则预加载 + 文档解析 [WF:done:文档解析]
    │
    ├── [主线] Step 2-5: 全面用例生成（主 agent 继续执行）
    │       需求分析 → 用例生成 → 质量校验 → XMind 导出
    │       进度标记: [WF:done:需求分析] [WF:done:用例生成]
    │                [WF:done:质量校验] [WF:done:导出格式]
    │
    └── [后台分支] 开发冒烟用例生成（Agent + run_in_background: true）
            三方分析 → 红蓝对抗 → P0功能拆分 → 冒烟用例生成
            → 输出校验 → Excel 转换
            进度标记: [WF:done:冒烟-三方分析] [WF:done:冒烟-用例生成]
                     [WF:done:冒烟-导出]
```

**并行实现方式：**

Step 1 完成后，主 agent 使用 `Agent` 工具 + `run_in_background: true` 启动冒烟分支子任务，然后立即继续执行主线 Step 2-5。两条分支真正并行推进。

- 冒烟分支子 agent 收到完整 prompt：包含 PRD 解析结果（`_source.md` 路径 + `_images/` 路径）、输出目录 `{TASK_OUTPUT_DIR}`、以及 `prd-to-tests-smoke/references/` 下的 4 个规则文件指针
- 子 agent 独立完成三方分析 → 红蓝对抗 → P0 拆分 → 冒烟用例生成 → 输出校验 → Excel 转换
- 子 agent 完成后，主 agent 收到 `<task-notification>` 通知，汇总最终结果

**关键设计：**
- 两条分支共享 Step 1 的解析结果（`_source.md` + `_images/`），各自独立推进
- 冒烟分支直接复用 `prd-to-tests-smoke/references/` 下已有的 4 个规则文件，不重复编写
- 冒烟分支复用 `prd-to-tests-smoke/scripts/md2excel.py` 做 Excel 转换
- 新增 3 个进度标记，由后台子 agent 输出

## 四、产出物

单个 PRD 输入 → 共 5 份文件，统一输出到 `{TASK_OUTPUT_DIR}`：

```
{TASK_OUTPUT_DIR}/
├── {需求名称}_测试用例.md          ← 主线：现有全量用例
├── {需求名称}_测试用例.xmind       ← 主线：现有脑图
├── {需求名称}_三方分析.md           ← 新增：冒烟分支
├── {需求名称}_开发冒烟用例.md       ← 新增：冒烟分支
└── {需求名称}_开发冒烟用例.xlsx     ← 新增：冒烟分支
```

## 五、改动清单

### 5.1 `prd-to-tests-new/SKILL.md`（主要改动）

**Step 0 预加载清单扩展：** 新增 4 个跨 skill 引用：

- `../prd-to-tests-smoke/references/three_party_analysis.md` — 三方分析 + 红蓝对抗规则
- `../prd-to-tests-smoke/references/step02_decomposition.md` — P0 功能点拆分规则
- `../prd-to-tests-smoke/references/smoke_test_generation.md` — 冒烟用例生成规则
- `../prd-to-tests-smoke/references/step05_output.md` — 输出格式与校验规则

> `step01_input.md` 不重复加载（主线 Step 1 已完成输入解析）。

**进度标记表扩展：** 在现有 5 个标记基础上新增 3 个：

| 标记 | 插入时机 |
|------|---------|
| `[WF:done:冒烟-三方分析]` | 三方分析 + 红蓝对抗完成 |
| `[WF:done:冒烟-用例生成]` | 冒烟用例生成 + 输出校验完成 |
| `[WF:done:冒烟-导出]` | Excel 转换完成 |

**新增 Step 6 章节：开发冒烟用例（后台并行分支）**

```
### Step 6: 开发冒烟用例（后台并行分支）

Step 1 完成（`[WF:done:文档解析]`）后，立即通过 `Agent` 工具
+ `run_in_background: true` 启动冒烟分支子任务，与主线 Step 2-5
并行推进。

子任务 prompt 需包含以下完整上下文：
- PRD 解析结果路径：`{TASK_OUTPUT_DIR}/{需求名称}_source.md`
- 图片目录路径：`{TASK_OUTPUT_DIR}/{需求名称}_images/`
- 输出目录：`{TASK_OUTPUT_DIR}`
- 执行规则：按顺序执行以下 4 个 reference 文件中的全部阶段
  - `../prd-to-tests-smoke/references/three_party_analysis.md`
  - `../prd-to-tests-smoke/references/step02_decomposition.md`
  - `../prd-to-tests-smoke/references/smoke_test_generation.md`
  - `../prd-to-tests-smoke/references/step05_output.md`

冒烟分支执行流程：

1. 三方多维度分析（产品/架构/测试三视角独立审视）
2. 红蓝对抗（QA→产品、QA→架构、架构→产品，≥3 个真实问题）
3. P0 功能拆分（含问题映射表）
4. 冒烟用例生成（5-20 条，全部 P0，每步 ≤5 步）
5. 输出校验（格式/覆盖率/一致性）
6. 写入 `{TASK_OUTPUT_DIR}/{需求名称}_三方分析.md`
7. 写入 `{TASK_OUTPUT_DIR}/{需求名称}_开发冒烟用例.md`
8. md2excel.py 转换 → `{TASK_OUTPUT_DIR}/{需求名称}_开发冒烟用例.xlsx`

主线 Step 5 末尾，等待冒烟分支子任务完成后，汇总最终交付物清单。
```

### 5.2 `prd-to-tests-new/references/output_template.md`（小幅改动）

**改动 1：文件清单表格新增 3 行冒烟分支产出：**

| 文件 | 说明 |
|------|------|
| `{需求名称}_三方分析.md` | 冒烟分支：三方分析报告（新增） |
| `{需求名称}_开发冒烟用例.md` | 冒烟分支：开发冒烟用例（新增） |
| `{需求名称}_开发冒烟用例.xlsx` | 冒烟分支：Excel 格式冒烟用例（新增） |

**改动 2：删除「五、冒烟测试清单」章节。** 该章节（全量用例列表）直接移除，不做任何替换或引导。后续章节编号顺延（「六、完整性检查报告」→「五、完整性检查报告」）。

### 5.3 `components/usecase-gen/generate-wizard.tsx`（小幅改动）

`step3OutputCount` 过滤条件追加 `.xlsx`：

```
// 行 754 附近，改前：
(f.name.endsWith(".md") || f.name.endsWith(".xmind"))
// 改后：
(f.name.endsWith(".md") || f.name.endsWith(".xmind") || f.name.endsWith(".xlsx"))
```

### 5.4 `components/usecase-gen/shared/output-files.tsx`（小幅改动）

`isDisplayable()` 追加 `.xlsx`：

```
// 行 21 附近，改前：
return name.endsWith(".md") || name.endsWith(".xmind");
// 改后：
return name.endsWith(".md") || name.endsWith(".xmind") || name.endsWith(".xlsx");
```

## 六、结果页兼容性

### 6.1 `_source.md` 为何不显示

`_source.md` 并非没有被下载 API 扫到，而是被用例向导的展示层**主动过滤**：

- `generate-wizard.tsx` `step3OutputCount` 过滤：`!f.name.includes("_source")`
- `output-files.tsx` `isDisplayable()` 过滤：`!name.includes("_source")`

这是合理设计——`_source.md` 是 docx2text 中间产物，非用户交付物。

### 6.2 `.xlsx` 文件当前不可见

`OutputFiles` 组件的 `isDisplayable()` 和 `step3OutputCount` 只允许 `.md` / `.xmind`，`.xlsx` 被过滤。需要修改：

| 文件 | 改动 |
|------|------|
| `output-files.tsx:21` `isDisplayable()` | `... \|\| name.endsWith(".xlsx")` |
| `generate-wizard.tsx:754` `step3OutputCount` | `... \|\| f.name.endsWith(".xlsx")` |

> `isPreviewable()` 不用改——`.xlsx` 不可预览只可下载，现有逻辑正确。

### 6.3 冒烟文件展示矩阵

| 文件 | 下载 API | step3OutputCount | OutputFiles |
|------|:---:|:---:|:---:|
| `_三方分析.md` | ✅ | ✅ | ✅ |
| `_开发冒烟用例.md` | ✅ | ✅ | ✅ |
| `_开发冒烟用例.xlsx` | ✅ | ✅（修后） | ✅（修后） |

## 七、不改的文件

| 文件 | 原因 |
|------|------|
| `prd-to-tests-new/references/generation_rules.md` | 主线用例生成规则不变 |
| `prd-to-tests-new/references/test_dimensions.md` | 测试维度定义不变 |
| `prd-to-tests-smoke/references/*` | 直接复用，不修改 |
| `prd-to-tests-new/scripts/md2xmind.py` | 主线 XMind 脚本不变 |
| `prd-to-tests-smoke/scripts/md2excel.py` | 直接复用，不修改 |
| `prd-to-tests-new/workflow_flowchart.md` | 流程图可后续更新，非本次必须 |
| `app/tasks/[id]/result/page.tsx` | `_source` 过滤是设计意图，不修改 |
| `app/api/tasks/[id]/download/route.ts` | 递归扫描，无需改动 |

## 八、行为约束

- 冒烟分支通过 `Agent` + `run_in_background: true` 启动，与主线真正并行执行
- 主线 Step 5 末尾等待冒烟分支完成后汇总结果
- 冒烟分支任一环节失败（如图片识别失败、Excel 转换失败），不影响主线输出，仅在对应输出中注明失败原因
- 所有输出文件统一使用 `{TASK_OUTPUT_DIR}` 路径，不写入沙箱外

## 九、风险与边界

- **跨 skill 文件引用**：冒烟分支依赖 `prd-to-tests-smoke/references/` 下的规则文件。若 smoke skill 后续规则变更，本分支行为随之变化。这既是风险也是优势（规则自动保持同步）。
- **不与主线共享状态**：冒烟分支独立执行三方分析，不依赖主线 Step 2-4 的分析结果。
- **进度标记不冲突**：新增 3 个标记使用 `冒烟-` 前缀，与现有标记明确区分。
