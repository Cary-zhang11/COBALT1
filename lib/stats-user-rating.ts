export function avgUserRating(ratings: number[]): number {
  if (ratings.length === 0) return 0;
  const sum = ratings.reduce((a, b) => a + b, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

export function ratingDistribution(ratings: number[]) {
  return [1, 2, 3, 4, 5].map((stars) => ({
    stars,
    count: ratings.filter((r) => r === stars).length,
  }));
}

export type FeedbackRow = {
  taskId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
};

export function latestFeedbackByTaskId(rows: FeedbackRow[]) {
  const map = new Map<string, FeedbackRow>();
  for (const row of rows) {
    const prev = map.get(row.taskId);
    if (!prev || row.createdAt > prev.createdAt) {
      map.set(row.taskId, row);
    }
  }
  return map;
}
