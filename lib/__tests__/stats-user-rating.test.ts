import { describe, it, expect } from "vitest";
import {
  avgUserRating,
  ratingDistribution,
  latestFeedbackByTaskId,
} from "../stats-user-rating";

describe("stats-user-rating", () => {
  it("avgUserRating returns rounded mean", () => {
    expect(avgUserRating([5, 4, 3])).toBe(4);
    expect(avgUserRating([])).toBe(0);
  });

  it("ratingDistribution counts 1-5 stars", () => {
    expect(ratingDistribution([5, 5, 3])).toEqual([
      { stars: 1, count: 0 },
      { stars: 2, count: 0 },
      { stars: 3, count: 1 },
      { stars: 4, count: 0 },
      { stars: 5, count: 2 },
    ]);
  });

  it("latestFeedbackByTaskId keeps newest per task", () => {
    const map = latestFeedbackByTaskId([
      { taskId: "a", rating: 3, comment: null, createdAt: new Date("2026-01-01") },
      { taskId: "a", rating: 5, comment: "ok", createdAt: new Date("2026-01-02") },
    ]);
    expect(map.get("a")?.rating).toBe(5);
    expect(map.get("a")?.comment).toBe("ok");
  });
});
