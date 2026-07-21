"use client";

import { useState, useEffect } from "react";
import { Star, Edit3 } from "lucide-react";

interface RatingPanelProps {
  taskId: string | null;
  sectioned?: boolean;
}

export function RatingPanel({ taskId, sectioned }: RatingPanelProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 回显已有评价
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    fetch(`/api/tasks/${taskId}/feedback`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data: { rating: number | null; comment: string | null }) => {
        if (cancelled) return;
        if (data.rating != null) {
          setRating(data.rating);
          if (data.comment) setComment(data.comment);
          setSubmitted(true);
        }
      })
      .catch(() => {
        // GET 失败 — 降级，保持空白交互状态
      });
    return () => { cancelled = true; };
  }, [taskId]);

  if (!taskId) return null;

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const body: { rating: number; comment?: string } = { rating };
      const trimmed = comment.trim();
      if (trimmed) body.comment = trimmed;

      const res = await fetch(`/api/tasks/${taskId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // 重新 GET 确认服务端数据
        try {
          const confirmRes = await fetch(`/api/tasks/${taskId}/feedback`);
          if (confirmRes.ok) {
            const confirmed = await confirmRes.json();
            setRating(confirmed.rating);
            if (confirmed.comment) setComment(confirmed.comment);
            setSubmitted(true);
          } else {
            setSubmitted(true);
          }
        } catch {
          setSubmitted(true);
        }
      } else {
        const data = await res.json();
        setError(data.error || "提交失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const inner = (
    <>
      {!sectioned && (
        <h3 className="font-semibold text-sm mb-3">本次生成评价</h3>
      )}
      {submitted ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <Star className="w-4 h-4 fill-emerald-500 text-emerald-500" />
              已提交 · {rating} 分
            </div>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              title="重新编辑评价"
            >
              <Edit3 className="w-3 h-3" />
              编辑
            </button>
          </div>
          {comment.trim() && (
            <p className="text-xs text-muted-foreground">{comment.trim()}</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground whitespace-nowrap">整体满意度</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} 星`}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  className="transition-colors"
                >
                  <Star
                    className={`w-5 h-5 ${
                      n <= (hovered || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={rating === 0 || submitting}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-40 transition-opacity"
            >
              {submitting ? "提交中..." : "提交评价"}
            </button>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="补充说明（可选）"
            rows={2}
            className="w-full mt-3 border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </>
  );

  if (sectioned) {
    return (
      <div data-rating>
        {inner}
      </div>
    );
  }

  return (
    <div id="step3-rating" className="bg-card rounded-xl shadow-sm p-5" data-rating>
      {inner}
    </div>
  );
}
