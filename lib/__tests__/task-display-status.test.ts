import { describe, it, expect } from "vitest";
import { getDisplayStatus, taskHasTestcaseOutput } from "../task-display-status";

describe("taskHasTestcaseOutput", () => {
  it("detects totalCases", () => {
    expect(taskHasTestcaseOutput({ totalCases: 5 })).toBe(true);
  });

  it("detects testcase md in outputFiles", () => {
    expect(
      taskHasTestcaseOutput({ outputFiles: ["foo_测试用例_v1.md"] }),
    ).toBe(true);
  });

  it("detects report tree", () => {
    expect(taskHasTestcaseOutput({ report: { tree: [] } })).toBe(true);
  });

  it("returns false when empty", () => {
    expect(taskHasTestcaseOutput({})).toBe(false);
  });
});

describe("getDisplayStatus", () => {
  it("maps paused with output to completed", () => {
    expect(getDisplayStatus("paused", true)).toBe("completed");
  });

  it("keeps paused without output", () => {
    expect(getDisplayStatus("paused", false)).toBe("paused");
  });

  it("does not change other statuses", () => {
    expect(getDisplayStatus("running", true)).toBe("running");
  });
});
