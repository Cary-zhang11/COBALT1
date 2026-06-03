import { describe, it, expect } from "vitest";
import { buildTaskListWhere } from "../task-list-query";

describe("buildTaskListWhere", () => {
  const userId = "user-1";

  it("filters completed display status with paused+output", () => {
    const where = buildTaskListWhere({ userId, displayStatus: "completed" });
    expect(where.OR).toBeDefined();
  });

  it("filters paused display status excluding output", () => {
    const where = buildTaskListWhere({ userId, displayStatus: "paused" });
    expect(where.status).toBe("paused");
    expect(where.NOT).toBeDefined();
  });

  it("filters active as running or pending", () => {
    const where = buildTaskListWhere({ userId, displayStatus: "active" });
    expect(where.status).toEqual({ in: ["running", "pending"] });
  });

  it("applies search on input", () => {
    const where = buildTaskListWhere({ userId, search: "登录" });
    expect(where.input).toEqual({ contains: "登录", mode: "insensitive" });
  });
});
