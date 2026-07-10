"use client";

import { useState, useEffect, useMemo } from "react";
import { Check, Edit3, Zap, Clock, Info } from "lucide-react";

interface EfficiencyComparisonProps {
  taskId: string | null;
  initialData?: UsabilityData | null;
}

export interface UsabilityData {
  usabilityRate: number | null;
  reviewDuration: number | null;
  manualDuration: number | null;
  aiDurationMinutes: number | null;
}

function computeMetrics(
  manualDuration: number | null,
  reviewDuration: number | null,
  aiDurationMinutes: number | null,
  includeAi: boolean,
) {
  if (manualDuration == null || reviewDuration == null) {
    return { saved: null, percent: null };
  }
  const cost = reviewDuration + (includeAi && aiDurationMinutes ? aiDurationMinutes : 0);
  const saved = manualDuration - cost;
  const percent = manualDuration > 0
    ? Math.round((saved / manualDuration) * 100)
    : null;
  return { saved, percent };
}

export function EfficiencyComparison({ taskId, initialData }: EfficiencyComparisonProps) {
  const [data, setData] = useState<UsabilityData | null>(initialData ?? null);
  const [editing, setEditing] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [reviewInput, setReviewInput] = useState("");
  const [rateInput, setRateInput] = useState("");
  const [includeAi, setIncludeAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Sync initialData into local state when it arrives
  useEffect(() => {
    if (!initialData) return;
    setData(initialData);
    setManualInput(initialData.manualDuration != null ? String(initialData.manualDuration) : "");
    setReviewInput(initialData.reviewDuration != null ? String(initialData.reviewDuration) : "");
    setRateInput(initialData.usabilityRate != null ? String(initialData.usabilityRate) : "");
    const hasValue =
      initialData.manualDuration != null ||
      initialData.reviewDuration != null ||
      initialData.usabilityRate != null;
    if (!hasValue) {
      setEditing(true);
    }
  }, [initialData]);

  // Fallback: fetch if no initialData provided
  useEffect(() => {
    if (!taskId || initialData) return;
    let cancelled = false;
    fetch(`/api/tasks/${taskId}/usability`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d: UsabilityData) => {
        if (cancelled) return;
        setData(d);
        setManualInput(d.manualDuration != null ? String(d.manualDuration) : "");
        setReviewInput(d.reviewDuration != null ? String(d.reviewDuration) : "");
        setRateInput(d.usabilityRate != null ? String(d.usabilityRate) : "");
        const hasValue =
          d.manualDuration != null ||
          d.reviewDuration != null ||
          d.usabilityRate != null;
        if (!hasValue) {
          setEditing(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [taskId, initialData]);

  const metrics = useMemo(
    () =>
      computeMetrics(
        data?.manualDuration ?? null,
        data?.reviewDuration ?? null,
        data?.aiDurationMinutes ?? null,
        includeAi,
      ),
    [data, includeAi],
  );

  if (!taskId) return null;

  const hasAnyValue =
    data != null &&
    (data.manualDuration != null ||
      data.reviewDuration != null ||
      data.usabilityRate != null);

  const handleEnterEdit = () => {
    setError("");
    setEditing(true);
  };

  const handleCancel = () => {
    setError("");
    setEditing(false);
    if (data) {
      setManualInput(data.manualDuration != null ? String(data.manualDuration) : "");
      setReviewInput(data.reviewDuration != null ? String(data.reviewDuration) : "");
      setRateInput(data.usabilityRate != null ? String(data.usabilityRate) : "");
    }
  };

  const handleSave = async () => {
    setError("");
    const payload: {
      manualDuration?: number;
      reviewDuration?: number;
      usabilityRate?: number;
    } = {};

    if (manualInput !== "") {
      const n = parseInt(manualInput, 10);
      if (isNaN(n) || n < 0) {
        setError("人工编写耗时请输入非负整数（分钟）");
        return;
      }
      payload.manualDuration = n;
    }
    if (reviewInput !== "") {
      const n = parseInt(reviewInput, 10);
      if (isNaN(n) || n < 0) {
        setError("用例复核耗时请输入非负整数（分钟）");
        return;
      }
      payload.reviewDuration = n;
    }
    if (rateInput !== "") {
      const n = parseInt(rateInput, 10);
      if (isNaN(n) || n < 0 || n > 100) {
        setError("可用率请输入 0-100 的整数");
        return;
      }
      payload.usabilityRate = n;
    }
    if (Object.keys(payload).length === 0) {
      setError("请至少填写一项");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/usability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "保存失败");
        return;
      }
      const updated: UsabilityData = await res.json();
      setData(updated);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-semibold">用例复核</p>
        {saved && (
          <span className="text-[11px] text-emerald-600 inline-flex items-center gap-0.5">
            <Check className="w-3 h-3" />
            已保存
          </span>
        )}
      </div>
      {!editing && hasAnyValue && (
        <button
          type="button"
          onClick={handleEnterEdit}
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
        >
          <Edit3 className="w-3 h-3" />
          编辑
        </button>
      )}
    </div>
  );

  if (editing || !hasAnyValue) {
    return (
      <div>
        {header}
        <div className="space-y-2">
          <div className="grid grid-cols-[5rem_1fr_2rem] gap-1.5 items-center">
            <label className="text-[11px] text-muted-foreground">人工编写</label>
            <input
              type="number"
              min={0}
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="预估耗时"
              className="min-w-0 border border-border rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="text-[11px] text-muted-foreground">分钟</span>
          </div>
          <div className="grid grid-cols-[5rem_1fr_2rem] gap-1.5 items-center">
            <label className="text-[11px] text-muted-foreground">用例复核</label>
            <input
              type="number"
              min={0}
              value={reviewInput}
              onChange={(e) => setReviewInput(e.target.value)}
              placeholder="复核耗时"
              className="min-w-0 border border-border rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="text-[11px] text-muted-foreground">分钟</span>
          </div>
          <div className="grid grid-cols-[5rem_1fr_2rem] gap-1.5 items-center">
            <label className="text-[11px] text-muted-foreground">用例可用率</label>
            <input
              type="number"
              min={0}
              max={100}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder="0-100"
              className="min-w-0 border border-border rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="text-[11px] text-muted-foreground">%</span>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-end gap-2">
          {hasAnyValue && (
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs px-2.5 py-1 rounded-lg text-muted-foreground hover:bg-muted/50"
            >
              取消
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-40"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
      </div>
    );
  }

  const savedValue = metrics.saved;
  const percentValue = metrics.percent;
  const savedPositive = savedValue != null && savedValue >= 0;
  const savedColor = savedPositive ? "text-emerald-600" : "text-red-500";
  const savedBg = savedPositive
    ? "bg-emerald-50 border-emerald-100"
    : "bg-red-50 border-red-100";
  const hasAi = data?.aiDurationMinutes != null && data.aiDurationMinutes > 0;

  return (
    <div>
      {header}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground mb-0.5">人工编写</p>
          <p className="text-base font-semibold tabular-nums leading-tight">
            {data?.manualDuration != null ? (
              <>
                {data.manualDuration}
                <span className="text-[10px] font-normal text-muted-foreground ml-0.5">分</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground/60">未填</span>
            )}
          </p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2">
          <p className="text-[10px] text-primary/80 mb-0.5 flex items-center gap-0.5">
            用例复核
            {includeAi && hasAi && (
              <span className="text-[10px] text-muted-foreground">+AI</span>
            )}
          </p>
          <p className="text-base font-semibold tabular-nums leading-tight text-primary">
            {data?.reviewDuration != null ? (
              <>
                {includeAi && hasAi
                  ? data.reviewDuration + (data.aiDurationMinutes || 0)
                  : data.reviewDuration}
                <span className="text-[10px] font-normal ml-0.5">分</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground/60">未填</span>
            )}
          </p>
        </div>
      </div>

      {savedValue != null && (
        <div className={`mt-2 rounded-lg border px-2.5 py-1.5 ${savedBg}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-medium inline-flex items-center gap-1 ${savedColor}`}>
              <Zap className="w-3.5 h-3.5" />
              节省 {Math.abs(savedValue)} 分钟
            </span>
            {percentValue != null && (
              <span className={`text-xs tabular-nums font-medium ${savedColor}`}>
                {savedPositive ? "↑" : "↓"} {Math.abs(percentValue)}%
              </span>
            )}
          </div>
        </div>
      )}

      {data?.usabilityRate != null && (
        <div className="mt-1.5 flex items-center gap-1 text-xs">
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-muted-foreground">可用率</span>
          <span className="font-medium tabular-nums text-foreground/80">
            {data.usabilityRate}%
          </span>
        </div>
      )}

      {hasAi && (
        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeAi}
            onChange={(e) => setIncludeAi(e.target.checked)}
            className="accent-primary w-3 h-3"
          />
          <Clock className="w-3 h-3" />
          <span>计入 AI 生成耗时 ({data!.aiDurationMinutes} 分钟)</span>
          <span
            title="勾选后，节省时间的计算中会额外扣除 AI 生成耗时；默认不计入，因为 AI 生成期间人可以并行做其他事。"
            className="text-muted-foreground/60 cursor-help"
          >
            <Info className="w-3 h-3" />
          </span>
        </label>
      )}
    </div>
  );
}
