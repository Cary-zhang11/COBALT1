"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface TaskLogEvent {
  sequence: number;
  type: string;
  output: string | null;
  input: string | null;
  createdAt: string;
}

interface PausedEvent {
  status: string;
  reason?: string;
  toolName?: string;
  toolInput?: unknown;
}

interface UseTaskEventsOptions {
  taskId: string;
  enabled?: boolean;
  onComplete?: (status: string) => void;
  onPaused?: (data: PausedEvent) => void;
}

export function useTaskEvents({
  taskId,
  enabled = true,
  onComplete,
  onPaused,
}: UseTaskEventsOptions) {
  const [logs, setLogs] = useState<TaskLogEvent[]>([]);
  const [status, setStatus] = useState<string>("connecting");
  const [pausedData, setPausedData] = useState<PausedEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!taskId || !enabled) return;

    const es = new EventSource(`/api/tasks/${taskId}/events`);
    eventSourceRef.current = es;
    setStatus("connected");

    es.addEventListener("log", (e) => {
      const data = JSON.parse(e.data) as TaskLogEvent;
      setLogs((prev) => [...prev, data]);
    });

    es.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      setStatus(data.status);
      onComplete?.(data.status);
      es.close();
    });

    es.addEventListener("paused", (e) => {
      const data = JSON.parse(e.data) as PausedEvent;
      setStatus("paused");
      setPausedData(data);
      onPaused?.(data);
    });

    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus("disconnected");
      } else {
        setStatus("error");
        es.close();
      }
    });
  }, [taskId, enabled, onComplete, onPaused]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  return { logs, status, pausedData, disconnect };
}
