---
name: prd-to-tests-smoke
description: 将业务需求文档（PRD）通过三方多维度分析，产出结构化分析报告和开发冒烟用例。当用户要求"三方分析"、"多维度分析"、"方案评审"、"开发冒烟用例"、"冒烟测试"、"生成测试用例"、"需求分析转测试"时使用本技能。即使提供的是 Word (.docx) 格式的需求文档或文本描述，只要涉及需求分析、评审或生成开发自测用例的场景都应触发。
---

# PRD → 三方分析 + 开发冒烟用例

## 角色定位
三方专家团队：产品专家（关注业务完整性）、架构师（关注技术可行性）、测试专家（关注风险与漏洞）。通过多角色独立审视和红蓝对抗，深度剖析 PRD 需求，产出分析报告和精简的开发冒烟用例。

## 核心流程

```
[输入解析] → [三方多维度分析] → [红蓝对抗] → [功能拆分] → [冒烟用例生成] → [输出报告与Excel]
```

### 阶段0：规则预加载

执行任何步骤前，**必须通读本 `SKILL.md` 全文及 `references/` 目录下全部 `.md` 文件一次**，不可跳过。

**规则文件清单（按顺序读取）：**
1. `references/step01_input.md` — Step 1: 输入解析与需求提取
2. `references/three_party_analysis.md` — Step 2: 三方多维度分析
3. `references/step02_decomposition.md` — Step 3: 功能点拆分（聚焦冒烟范围）
4. `references/smoke_test_generation.md` — Step 4: 开发冒烟用例生成
5. `references/step05_output.md` — Step 5: 输出格式与完整性校验

### 阶段1：输入解析

读取用户提供的 `.docx` PRD 文件，使用 `scripts/docx2text.py` 将其转换为带结构标记的 Markdown 文本。若用户直接提供了文本内容，则跳过转换步骤。

执行 `references/step01_input.md` 中的规则。

### 阶段2：三方多维度分析

三个专家角色独立审视 PRD，分别从业务、架构、测试视角输出专业分析意见。

执行 `references/three_party_analysis.md` 中的规则。

**本阶段产出**：`{项目名称}_三方分析.md`

### 阶段3：红蓝对抗

三个角色互相挑战，暴露真实问题和风险。

执行 `references/three_party_analysis.md` 中"第二阶段：红蓝对抗"的规则。

### 阶段4：功能拆分（聚焦冒烟范围）

基于三方分析结论，将需求拆分为可测试的功能点，**仅关注 P0 级别核心功能**。

执行 `references/step02_decomposition.md` 中的规则，但仅拆分 P0 功能点。

### 阶段5：开发冒烟用例生成

基于 PRD 原始需求和三方分析结论，生成精简的开发冒烟测试用例。

执行 `references/smoke_test_generation.md` 中的规则。

**本阶段产出**：`{项目名称}_开发冒烟用例.md`

### 阶段6：输出与校验

按照 `references/step05_output.md` 定义的格式输出最终文档，并进行完整性校验。

如需 Excel 格式，执行 `scripts/md2excel.py` 将 Markdown 转换为 Excel：

```bash
python scripts/md2excel.py <冒烟用例md文件路径> <输出xlsx路径>
```

**最终交付物**：
1. `{项目名称}_三方分析.md`
2. `{项目名称}_开发冒烟用例.md`
3. `{项目名称}_开发冒烟用例.xlsx`（如用户需要）

---

## 约束清单速查

- [ ] 三方分析必须覆盖产品、架构、测试三个视角
- [ ] 红蓝对抗必须发现至少 3 个真实问题
- [ ] 冒烟用例数量控制在 5-20 条，全部为 P0 优先级
- [ ] 每条冒烟用例步骤不超过 5 步
- [ ] 冒烟用例前置条件必须是开发本地可快速准备的
- [ ] 三方分析中的关键风险必须有对应冒烟用例覆盖
- [ ] 禁止在输出中出现测试设计方法论术语（等价类、边界值、场景法等）
- [ ] 预期结果原子化：多个校验条件必须拆分为独立子条目
- [ ] PRD 中存在歧义或矛盾定义时，必须在三方分析中标注并在最终文档汇总
- [ ] 输出文件为 `.md` 格式，使用标准 Markdown 语法

---

## 执行指令

当你命中本 skill 后，按以下顺序执行：

1. **预加载**：依次读取 `references/step01_input.md`、`references/three_party_analysis.md`、`references/step02_decomposition.md`、`references/smoke_test_generation.md`、`references/step05_output.md`。
2. **输入解析**：将 `.docx` 转为 Markdown，按 `references/step01_input.md` 执行。
3. **三方分析**：按 `references/three_party_analysis.md` 执行第一、二阶段，产出分析报告。
4. **功能拆分**：按 `references/step02_decomposition.md` 执行，仅拆分 P0 功能点。
5. **冒烟用例生成**：按 `references/smoke_test_generation.md` 执行，结合三方结论生成冒烟用例。
6. **输出校验**：按 `references/step05_output.md` 执行，校验两份产出文档。
7. **Excel 转换**（可选）：如用户需要 Excel，执行 `scripts/md2excel.py` 转换。
