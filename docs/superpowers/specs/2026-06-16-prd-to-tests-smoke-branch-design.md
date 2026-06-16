# PRD→测试用例：增加开发冒烟用例并行分支

> **创建日期**: 2026-06-16
> **状态**: 设计中
> **影响范围**: `.claude/skills/prd-to-tests-new/`

---

## 一、目标

在 `prd-to-tests-new` 技能中增加一条独立并行分支，产出高质量开发冒烟用例（三方分析报告 + 精简冒烟用例 + Excel），与现有全面用例生成流程共享输入解析、并行执行、互不阻塞。

## 二、背景

当前 `prd-to-tests-new` 的「冒烟测试清单」章节实际上将所有用例（P0-P3 + 兼容性）全部列入，是回归测试清单而非真正的开发冒烟用例。开发人员在提测前需要一个精简、可快速执行（5-20 条、每步 ≤5 步）的冒烟用例集来快速验证核心流程是否可用。

`prd-to-tests-smoke` 技能已有成熟的三方分析 + 红蓝对抗 + 冒烟用例生成规则，将其作为并行分支引入 `prd-to-tests-new`，以最少改动实现完整冒烟产出。

> **关于现有「五、冒烟测试清单」章节**：保留不动。该章节本质是回归测试清单（全部用例），与新产出的开发冒烟用例（P0 精简集）定位不同，各有价值。

## 三、整体架构

```
Step 0-1: 规则预加载 + 文档解析
    │
    ├── [现有主线] Step 2-5: 全面用例生成
    │       需求分析 → 用例生成 → 质量校验 → XMind 导出
    │       进度标记: [WF:done:需求分析] [WF:done:用例生成]
    │                [WF:done:质量校验] [WF:done:导出格式]
    │
    └── [新增分支] 开发冒烟用例生成
            三方分析 → 红蓝对抗 → P0功能拆分 → 冒烟用例生成
            → 输出校验 → Excel 转换
            进度标记: [WF:done:冒烟-三方分析] [WF:done:冒烟-用例生成]
                     [WF:done:冒烟-导出]
```

**关键设计：**
- 两条分支共享 Step 1 的解析结果（`_source.md` + `_images/`），各自独立推进
- 冒烟分支直接复用 `prd-to-tests-smoke/references/` 下已有的 4 个规则文件，不重复编写
- 冒烟分支复用 `prd-to-tests-smoke/scripts/md2excel.py` 做 Excel 转换
- 新增 3 个进度标记，与主线标记交错输出

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

**新增 Step 6 章节：开发冒烟用例（并行分支）**

```
### Step 6: 开发冒烟用例（并行分支）

Step 1 完成（`[WF:done:文档解析]`）后，与主线 Step 2-5 同时启动。
execute rules from `../prd-to-tests-smoke/references/`。

#### 6.1 三方多维度分析

按 `three_party_analysis.md` 第一阶段执行：
- 产品专家：业务逻辑链、用户场景覆盖、功能边界与优先级、需求缺陷
- 架构师：技术架构评估、性能与扩展性、安全与稳定性、接口完整性
- 测试专家：核心测试要点、风险点清单、边界情况、安全隐患

#### 6.2 红蓝对抗

按 `three_party_analysis.md` 第二阶段执行：
- QA → 产品：挑战业务逻辑歧义、被滥用可能、用户误解风险
- QA → 架构：质疑高并发/宕机/极端情况下的系统表现
- 架构 → 产品：评估技术实现成本、指出过度设计或不可行环节
- 至少发现 3 个真实问题

输出进度标记：`[WF:done:冒烟-三方分析]`

#### 6.3 P0 功能拆分

按 `step02_decomposition.md` 执行，仅拆分 P0 功能点。
- 功能模块拆分 + 业务流程拆分 + 数据变更点识别
- 关联影响分析 + 对抗性验证
- 问题映射表（三方分析问题 → P0 功能点 → 覆盖状态）

#### 6.4 冒烟用例生成

按 `smoke_test_generation.md` 执行：
- 数量：5-20 条，全部 P0
- 每步 ≤5 步，前置条件开发本地可快速准备
- 三方分析中的关键风险均有对应冒烟用例

输出进度标记：`[WF:done:冒烟-用例生成]`

#### 6.5 输出校验

按 `step05_output.md` 执行校验：
- 三方分析报告校验（三视角完整、红蓝对抗 ≥3 问题、结论含冒烟范围建议）
- 冒烟用例文档校验（编号无重复、字段齐全、步骤 ≤5、覆盖率检查）
- 双文档一致性检查（三方关联可追溯、术语统一）

#### 6.6 写入文件

将三方分析报告写入 `{TASK_OUTPUT_DIR}/{需求名称}_三方分析.md`，冒烟用例写入 `{TASK_OUTPUT_DIR}/{需求名称}_开发冒烟用例.md`。

#### 6.7 Excel 转换

```bash
python "{SKILL_DIR}/../prd-to-tests-smoke/scripts/md2excel.py" "{TASK_OUTPUT_DIR}/{需求名称}_开发冒烟用例.md" "{TASK_OUTPUT_DIR}/{需求名称}_开发冒烟用例.xlsx"
```

输出进度标记：`[WF:done:冒烟-导出]`
```

### 5.2 `prd-to-tests-new/references/output_template.md`（小幅改动）

文件清单表格新增 3 行冒烟分支产出：

| 文件 | 说明 |
|------|------|
| `{需求名称}_三方分析.md` | 冒烟分支：三方分析报告（新增） |
| `{需求名称}_开发冒烟用例.md` | 冒烟分支：开发冒烟用例（新增） |
| `{需求名称}_开发冒烟用例.xlsx` | 冒烟分支：Excel 格式冒烟用例（新增） |

## 六、不改的文件

| 文件 | 原因 |
|------|------|
| `prd-to-tests-new/references/generation_rules.md` | 主线用例生成规则不变 |
| `prd-to-tests-new/references/test_dimensions.md` | 测试维度定义不变 |
| `prd-to-tests-smoke/references/*` | 直接复用，不修改 |
| `prd-to-tests-new/scripts/md2xmind.py` | 主线 XMind 脚本不变 |
| `prd-to-tests-smoke/scripts/md2excel.py` | 直接复用，不修改 |
| `prd-to-tests-new/workflow_flowchart.md` | 流程图可后续更新，非本次必须 |

## 七、行为约束

- 冒烟分支与主线并行执行，互不等待
- 冒烟分支的 3 个进度标记可与主线标记交错输出，不要求严格顺序
- 冒烟分支任一环节失败（如图片识别失败、Excel 转换失败），不影响主线输出，仅在对应输出中注明失败原因
- 所有输出文件统一使用 `{TASK_OUTPUT_DIR}` 路径，不写入沙箱外

## 八、风险与边界

- **跨 skill 文件引用**：冒烟分支依赖 `prd-to-tests-smoke/references/` 下的规则文件。若 smoke skill 后续规则变更，本分支行为随之变化。这既是风险也是优势（规则自动保持同步）。
- **不与主线共享状态**：冒烟分支独立执行三方分析，不依赖主线 Step 2-4 的分析结果。
- **进度标记不冲突**：新增 3 个标记使用 `冒烟-` 前缀，与现有标记明确区分。
