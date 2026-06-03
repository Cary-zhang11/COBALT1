import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "../dashboard";

const mockStats = {
  kpi: {
    totalCases: 100,
    monthlyActiveUsers: 5,
    avgQualityScore: 85,
    avgDuration: 120000,
    avgUserRating: 4.2,
  },
  dailyTrend: [{ date: "2026-06-01", count: 3, avgScore: 80 }],
  categoryDistribution: [{ category: "功能", count: 2 }],
  dimensionCoverage: [{ name: "边界", covered: 1, total: 2 }],
  topUsers: [{ userName: "Alice", count: 3 }],
  userRatingDistribution: [
    { stars: 1, count: 0 },
    { stars: 2, count: 0 },
    { stars: 3, count: 1 },
    { stars: 4, count: 2 },
    { stars: 5, count: 1 },
  ],
  kpiTrend: {
    totalCases: { current: 12, previous: 10, changePercent: 20 },
    monthlyActiveUsers: { current: 3, previous: 2, changePercent: 50 },
    avgQualityScore: { current: 85, previous: 80, changePercent: 6 },
    avgDuration: { current: 110000, previous: 120000, changePercent: -8 },
    avgUserRating: { current: 4, previous: 4, changePercent: 0 },
  },
  userRatingRate: { percent: 67, ratedCount: 2, completedCount: 3 },
  recentRecords: [
    {
      time: "2026/6/1",
      user: "Alice",
      req: "登录功能",
      count: 10,
      score: 90,
      tokens: 1000,
      category: "功能",
      userRating: 5,
      userComment: "很好",
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    })
  );
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("Dashboard", () => {
  it("renders user rating KPI and chart, no efficiency block", async () => {
    renderWithClient(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("用户平均评分")).toBeDefined();
      expect(screen.getByText("用户评价分布")).toBeDefined();
      expect(screen.getByText("AI 平均质量分")).toBeDefined();
      expect(screen.getByText("AI质量分")).toBeDefined();
      expect(screen.getByText("5 星")).toBeDefined();
    });
    expect(screen.queryByText("生成效率统计")).toBeNull();
  });

  it("renders user rating column in recent records", async () => {
    renderWithClient(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("用户评价")).toBeDefined();
      expect(screen.getByText("很好")).toBeDefined();
    });
  });

  it("renders rating rate footer on distribution chart", async () => {
    renderWithClient(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText(/评价率 67%/)).toBeDefined();
    });
  });

  it("filters recent records by search and select", async () => {
    renderWithClient(<Dashboard />);
    await waitFor(() => expect(screen.getByText("登录功能")).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText("搜索需求…"), {
      target: { value: "不存在的需求" },
    });
    expect(screen.getByText("无匹配记录")).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("搜索需求…"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("筛选记录"), { target: { value: "unrated" } });
    expect(screen.getByText("无匹配记录")).toBeDefined();

    fireEvent.change(screen.getByLabelText("筛选记录"), { target: { value: "rated" } });
    expect(screen.getByText("登录功能")).toBeDefined();
  });

  it("shows placeholder when rating has no comment", async () => {
    const noCommentStats = {
      ...mockStats,
      recentRecords: [
        {
          ...mockStats.recentRecords[0],
          userRating: 4,
          userComment: null,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => noCommentStats })
    );
    renderWithClient(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("无补充说明")).toBeDefined();
    });
  });
});
