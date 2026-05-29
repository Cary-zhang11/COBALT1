"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface RatingPanelProps {
  taskId: string | null;
}

export function RatingPanel({ taskId }: RatingPanelProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!taskId) return null;

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        setSubmitted(true);
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

  return (
    <div className="bg-card rounded-xl shadow-sm p-5" data-rating>
      <h3 className="font-semibold text-sm mb-3">评价</h3>
      {submitted ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <Star className="w-4 h-4 fill-emerald-500 text-emerald-500" />
          已提交 · {rating} 分
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">整体质量</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
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
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-40 transition-opacity"
          >
            {submitting ? "提交中..." : "提交评价"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}
