import { describe, it, expect } from "vitest";
import { parseUsecaseOutput } from "../parse-usecase-output";

describe("parseUsecaseOutput", () => {
  it("returns null tree for null input", () => {
    const result = parseUsecaseOutput(null);
    expect(result.tree).toBeNull();
    expect(result.rawOutput).toBe("");
  });

  it("returns null tree for empty string", () => {
    const result = parseUsecaseOutput("");
    expect(result.tree).toBeNull();
    expect(result.rawOutput).toBe("");
  });

  it("returns null tree for whitespace-only string", () => {
    const result = parseUsecaseOutput("   \n  ");
    expect(result.tree).toBeNull();
  });

  it("parses valid JSON with modules and summary", () => {
    const input = JSON.stringify({
      modules: [
        {
          name: "登录模块",
          cases: [
            { id: "c1", title: "正常登录", priority: "P0", precondition: "已注册", steps: "1. 打开页面", expected: "成功", tags: "功能" },
          ],
        },
      ],
      summary: { totalCases: 1, qualityScore: 95, modules: 1 },
    });
    const result = parseUsecaseOutput(input);
    expect(result.tree).not.toBeNull();
    expect(result.tree).toHaveLength(1);
    expect(result.tree![0].name).toBe("登录模块");
    expect(result.tree![0].open).toBe(true);
    expect(result.tree![0].cases).toHaveLength(1);
    expect(result.tree![0].cases[0].title).toBe("正常登录");
    expect(result.summary?.totalCases).toBe(1);
    expect(result.summary?.qualityScore).toBe(95);
  });

  it("first module open by default, rest closed", () => {
    const input = JSON.stringify({
      modules: [
        { name: "A", cases: [{ id: "c1", title: "t1", priority: "P1", precondition: "", steps: "", expected: "", tags: "" }] },
        { name: "B", cases: [{ id: "c2", title: "t2", priority: "P2", precondition: "", steps: "", expected: "", tags: "" }] },
      ],
    });
    const result = parseUsecaseOutput(input);
    expect(result.tree![0].open).toBe(true);
    expect(result.tree![1].open).toBe(false);
  });

  it("defaults missing priority to P2", () => {
    const input = JSON.stringify({
      modules: [{ name: "X", cases: [{ id: "c1", title: "t1", precondition: "", steps: "", expected: "", tags: "" }] }],
    });
    const result = parseUsecaseOutput(input);
    expect(result.tree![0].cases[0].priority).toBe("P2");
  });

  it("extracts JSON from markdown code block", () => {
    const json = JSON.stringify({
      modules: [{ name: "注册", cases: [{ id: "c1", title: "注册", priority: "P1", precondition: "", steps: "", expected: "", tags: "" }] }],
    });
    const input = "Here is the result:\n```json\n" + json + "\n```\nDone!";
    const result = parseUsecaseOutput(input);
    expect(result.tree).not.toBeNull();
    expect(result.tree![0].name).toBe("注册");
  });

  it("extracts JSON from code block without language tag", () => {
    const json = JSON.stringify({
      modules: [{ name: "支付", cases: [{ id: "c1", title: "支付", priority: "P0", precondition: "", steps: "", expected: "", tags: "" }] }],
    });
    const input = "```\n" + json + "\n```";
    const result = parseUsecaseOutput(input);
    expect(result.tree).not.toBeNull();
    expect(result.tree![0].name).toBe("支付");
  });

  it("extracts JSON between first { and last }", () => {
    const json = JSON.stringify({
      modules: [{ name: "搜索", cases: [{ id: "c1", title: "搜索", priority: "P1", precondition: "", steps: "", expected: "", tags: "" }] }],
    });
    const input = "Some text before...\n" + json + "\n...and some after.";
    const result = parseUsecaseOutput(input);
    expect(result.tree).not.toBeNull();
    expect(result.tree![0].name).toBe("搜索");
  });

  it("returns null tree for unparseable garbage", () => {
    const input = "这是一段没有任何JSON的中文描述文本。\n包含多个段落。";
    const result = parseUsecaseOutput(input);
    expect(result.tree).toBeNull();
    expect(result.rawOutput).toBe(input);
  });

  it("supports alias 'tree' field for modules", () => {
    const input = JSON.stringify({
      tree: [{ name: "模块", cases: [{ id: "c1", title: "用例", priority: "P0", precondition: "", steps: "", expected: "", tags: "" }] }],
    });
    const result = parseUsecaseOutput(input);
    expect(result.tree).not.toBeNull();
    expect(result.tree![0].name).toBe("模块");
  });

  it("computes summary from tree if not provided", () => {
    const input = JSON.stringify({
      modules: [
        { name: "A", cases: [{ id: "c1", title: "t1", priority: "P0", precondition: "", steps: "", expected: "", tags: "" }] },
        { name: "B", cases: [{ id: "c2", title: "t2", priority: "P1", precondition: "", steps: "", expected: "", tags: "" }, { id: "c3", title: "t3", priority: "P2", precondition: "", steps: "", expected: "", tags: "" }] },
      ],
    });
    const result = parseUsecaseOutput(input);
    expect(result.summary?.totalCases).toBe(3);
    expect(result.summary?.modules).toBe(2);
    expect(result.summary?.qualityScore).toBe(0);
  });
});
