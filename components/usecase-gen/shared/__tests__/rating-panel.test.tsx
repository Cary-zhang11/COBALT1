import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatingPanel } from "../rating-panel";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  );
});

describe("RatingPanel", () => {
  it("has step3-rating id and submits comment", async () => {
    render(<RatingPanel taskId="task-1" />);
    expect(document.getElementById("step3-rating")).not.toBeNull();

    await userEvent.click(screen.getByLabelText("4 星"));
    await userEvent.type(screen.getByPlaceholderText("补充说明（可选）"), "很好用");
    await userEvent.click(screen.getByText("提交评价"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/tasks/task-1/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ rating: 4, comment: "很好用" }),
        })
      );
    });
  });
});
