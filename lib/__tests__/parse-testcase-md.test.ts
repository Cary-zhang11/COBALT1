import { describe, it, expect } from "vitest";
import { parseTestcaseMarkdown, modulesToMarkdown } from "@/lib/parse-testcase-md";

const SAMPLE_MD = `# 卖车页面改版 — 测试用例文档

> **需求来源**: test.docx
> **PRD版本**: v1.0
> **生成日期**: 2026-05-28

---

## 一、测试用例

### 1.1 可配置项

#### 1.1.1 头图

##### 1.1.1.1 静态图片

- tc-001-p0：静态图片正常展示
  - 后端返回静态图片，进入卖车页面
    - 头图通顶展示
    - 图片正常渲染无裂图

- tc-002-p1：静态图片加载失败
  - 后端返回链接不可访问【主动补充】
    - 展示默认占位图
    - 页面不白屏

### 1.2 固定写死

#### 1.2.1 我的订单

- tc-003-p0：入口固定展示
  - 进入卖车页面
    - 入口固定展示
    - 样式与预期一致

---

## 二、网络相关

### 2.1 弱网场景

- tc-004-p1：弱网-页面加载
  - 弱网环境进入页面【主动补充】
    - 页面不白屏
    - 网络恢复后正常加载

---

## 六、完整性检查报告

### 3. 用例数量统计（按功能模块）

- 可配置项-头图：2个，占比50%
- 固定写死-我的订单：1个，占比25%
- 网络相关：1个，占比25%
- **合计**：4个

### 4. 优先级统计
- P0：2个，占比50%
- P1：2个，占比50%
- **合计**：4个，占比100%
`;

describe("parseTestcaseMarkdown", () => {
  it("parses modules and cases from structured markdown", () => {
    const result = parseTestcaseMarkdown(SAMPLE_MD);

    expect(result.tree).not.toBeNull();
    expect(result.tree!.length).toBeGreaterThanOrEqual(2);

    // First module
    const mod1 = result.tree!.find((m) => m.name.includes("可配置项"));
    expect(mod1).toBeDefined();
    expect(mod1!.cases.length).toBe(2);

    const tc001 = mod1!.cases.find((c) => c.id === "tc-001");
    expect(tc001).toBeDefined();
    expect(tc001!.priority).toBe("P0");
    expect(tc001!.title).toBe("静态图片正常展示");
    expect(tc001!.precondition).toContain("后端返回静态图片");
    expect(tc001!.expected).toContain("头图通顶展示");
    expect(tc001!.expected).toContain("图片正常渲染无裂图");

    const tc002 = mod1!.cases.find((c) => c.id === "tc-002");
    expect(tc002!.priority).toBe("P1");
    expect(tc002!.tags).toBe("");

    // Second module
    const mod2 = result.tree!.find((m) => m.name.includes("固定写死"));
    expect(mod2).toBeDefined();
    expect(mod2!.cases.length).toBe(1);

    // Network section
    const mod3 = result.tree!.find((m) => m.name.includes("弱网"));
    expect(mod3).toBeDefined();
  });

  it("extracts summary from 完整性检查报告", () => {
    const result = parseTestcaseMarkdown(SAMPLE_MD);

    expect(result.summary.totalCases).toBe(4);
    expect(result.summary.modules).toBeGreaterThanOrEqual(2);
  });

  it("extracts meta information", () => {
    const result = parseTestcaseMarkdown(SAMPLE_MD);

    expect(result.meta.sourceDoc).toBe("test.docx");
    expect(result.meta.prdVersion).toBe("v1.0");
    expect(result.meta.generatedAt).toBe("2026-05-28");
  });

  it("returns null tree for empty input", () => {
    const result = parseTestcaseMarkdown("");
    expect(result.tree).toBeNull();
  });

  it("returns null tree for input without test cases", () => {
    const result = parseTestcaseMarkdown("# Just a title\n\nNo cases here.");
    expect(result.tree).toBeNull();
  });

  it("handles cases with multi-line preconditions and expectations", () => {
    const md = `## 一、测试用例

### 1.1 测试模块

- tc-001-p1：复杂用例
  - 第一条前置条件
  - 第二条前置条件
    - 第一条预期
    - 第二条预期
    - 第三条预期
`;

    const result = parseTestcaseMarkdown(md);
    const c = result.tree![0].cases[0];
    expect(c.precondition).toContain("第一条前置条件");
    expect(c.precondition).toContain("第二条前置条件");
    expect(c.expected).toContain("第一条预期");
    expect(c.expected).toContain("第三条预期");
  });

  it("falls back to 默认模块 when no ### header", () => {
    const md = `## 一、测试用例

- tc-001-p0：无模块用例
  - 条件
    - 预期
`;

    const result = parseTestcaseMarkdown(md);
    expect(result.tree![0].name).toBe("默认模块");
    expect(result.tree![0].cases[0].id).toBe("tc-001");
  });

  it("matches summary section regardless of Chinese number prefix", () => {
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
});

describe("modulesToMarkdown", () => {
  it("generates markdown that can be re-parsed", () => {
    const original = parseTestcaseMarkdown(SAMPLE_MD);
    if (!original.tree) throw new Error("parse failed");
    const md = modulesToMarkdown(original.tree);
    const reparsed = parseTestcaseMarkdown(md);
    expect(reparsed.tree).not.toBeNull();
    expect(reparsed.summary.totalCases).toBe(original.summary.totalCases);
  });
});
