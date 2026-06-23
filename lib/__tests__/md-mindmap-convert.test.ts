import { describe, it, expect } from "vitest";
import { modulesToMindMap, mindMapToModules, modulesToMarkdown } from "@/lib/md-mindmap-convert";
import type { UsecaseModule } from "@/lib/parse-testcase-md";

const sampleModules: UsecaseModule[] = [
  {
    name: "登录模块", open: true, cases: [
      { id: "tc-001", title: "正常登录", priority: "P0", precondition: "用户已注册", steps: "输入账号密码", expected: "跳转首页", tags: "" },
      { id: "tc-002", title: "密码错误", priority: "P1", precondition: "", steps: "", expected: "提示错误", tags: "" },
    ],
  },
  {
    name: "注册模块", open: false, cases: [
      { id: "tc-003", title: "正常注册", priority: "P0", precondition: "", steps: "", expected: "注册成功", tags: "" },
    ],
  },
];

describe("modulesToMindMap", () => {
  it("converts empty tree", () => {
    const result = modulesToMindMap([], "测试用例");
    expect(result.data.text).toBe("测试用例");
    expect(result.children).toEqual([]);
  });

  it("converts modules to mind map tree", () => {
    const result = modulesToMindMap(sampleModules, "测试用例");
    expect(result.data.text).toBe("测试用例");
    expect(result.children).toHaveLength(2);

    const mod1 = result.children[0];
    expect(mod1.data.text).toBe("登录模块");
    expect(mod1.children).toHaveLength(2);

    const case1 = mod1.children[0];
    expect(case1.data.text).toBe("tc-001 P0 正常登录");
    expect(case1.children).toHaveLength(3);
    expect(case1.children[0].data.text).toBe("前置条件：用户已注册");
    expect(case1.children[1].data.text).toBe("步骤：输入账号密码");
    expect(case1.children[2].data.text).toBe("预期：跳转首页");
  });

  it("skips empty fields in case node children", () => {
    const modules: UsecaseModule[] = [
      { name: "M1", open: true, cases: [
        { id: "tc-001", title: "T1", priority: "P0", precondition: "", steps: "", expected: "E1", tags: "" },
      ]},
    ];
    const result = modulesToMindMap(modules, "Root");
    const caseNode = result.children[0].children[0];
    expect(caseNode.children).toHaveLength(1);
    expect(caseNode.children[0].data.text).toBe("预期：E1");
  });
});

describe("mindMapToModules", () => {
  it("converts mind map back to modules", () => {
    const mindMap = modulesToMindMap(sampleModules, "测试用例");
    const modules = mindMapToModules(mindMap);

    expect(modules).toHaveLength(2);
    expect(modules[0].name).toBe("登录模块");
    expect(modules[0].cases).toHaveLength(2);
    expect(modules[0].cases[0].id).toBe("tc-001");
    expect(modules[0].cases[0].priority).toBe("P0");
    expect(modules[0].cases[0].title).toBe("正常登录");
    expect(modules[0].cases[0].precondition).toBe("用户已注册");
    expect(modules[0].cases[0].steps).toBe("输入账号密码");
    expect(modules[0].cases[0].expected).toBe("跳转首页");
  });

  it("handles root-only mind map", () => {
    const mindMap = { data: { text: "空" }, children: [] };
    const result = mindMapToModules(mindMap);
    expect(result).toEqual([]);
  });

  it("round-trips: modules → mindMap → modules", () => {
    const result = mindMapToModules(modulesToMindMap(sampleModules, "Root"));
    expect(result).toEqual(sampleModules.map(m => ({ ...m, open: true })));
  });
});

describe("modulesToMarkdown", () => {
  it("generates markdown from modules", () => {
    const md = modulesToMarkdown(sampleModules);
    expect(md).toContain("## 一、测试用例");
    expect(md).toContain("### 1.1 登录模块");
    expect(md).toContain("- tc-001-p0：正常登录");
    expect(md).toContain("  - 用户已注册");
    expect(md).toContain("    - 跳转首页");
    expect(md).toContain("- tc-002-p1：密码错误");
    expect(md).toContain("    - 提示错误");
    expect(md).toContain("### 1.2 注册模块");
    expect(md).toContain("- tc-003-p0：正常注册");
  });

  it("generates empty markdown for empty tree", () => {
    const md = modulesToMarkdown([]);
    expect(md).toContain("## 一、测试用例");
  });
});
