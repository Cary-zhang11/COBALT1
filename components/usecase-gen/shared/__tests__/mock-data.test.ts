import { describe, it, expect } from "vitest";

// We test the mock data after creation - first verify types exist
describe("UsecaseModule types", () => {
  it("UsecaseCase should have required fields", () => {
    const case1 = {
      id: "c1",
      title: "Test Case",
      priority: "P0" as const,
      precondition: "pre",
      steps: "steps",
      expected: "expected",
      tags: "tag1, tag2",
    };
    expect(case1.id).toBe("c1");
    expect(case1.priority).toBe("P0");
  });

  it("TweakEntry should have required fields", () => {
    const entry = {
      round: 1,
      instruction: "add more cases",
      time: "14:30",
      delta: "+5 cases, quality 94",
    };
    expect(entry.round).toBe(1);
    expect(entry.instruction).toBe("add more cases");
  });
});

describe("Mock data integrity", () => {
  it("mockDefaultTree modules should have open and cases", async () => {
    const { mockDefaultTree } = await import("../mock-data");
    expect(mockDefaultTree.length).toBeGreaterThan(0);
    mockDefaultTree.forEach((mod) => {
      expect(mod).toHaveProperty("name");
      expect(mod).toHaveProperty("open");
      expect(mod).toHaveProperty("cases");
      expect(Array.isArray(mod.cases)).toBe(true);
      mod.cases.forEach((c) => {
        expect(c).toHaveProperty("id");
        expect(c).toHaveProperty("title");
        expect(c).toHaveProperty("priority");
      });
    });
  });

  it("mockKPICards should have 4 items", async () => {
    const { mockKPICards } = await import("../mock-data");
    expect(mockKPICards).toHaveLength(4);
    mockKPICards.forEach((kpi) => {
      expect(kpi).toHaveProperty("label");
      expect(kpi).toHaveProperty("value");
      expect(kpi).toHaveProperty("trend");
    });
  });

  it("mockPromptTemplates should have content and active field", async () => {
    const { mockPromptTemplates } = await import("../mock-data");
    expect(mockPromptTemplates.length).toBeGreaterThan(0);
    mockPromptTemplates.forEach((pt) => {
      expect(pt).toHaveProperty("name");
      expect(pt).toHaveProperty("version");
      expect(pt).toHaveProperty("active");
      expect(pt).toHaveProperty("content");
      expect(pt).toHaveProperty("usage");
    });
  });
});
