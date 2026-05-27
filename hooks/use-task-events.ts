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

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;

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
  const seenSequencesRef = useRef<Set<number>>(new Set());
  const callbacksRef = useRef({ onComplete, onPaused });
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fatalErrorRef = useRef(false);

  // Keep callbacks fresh without triggering reconnects
  callbacksRef.current = { onComplete, onPaused };

  const connect = useCallback(() => {
    if (!taskId || !enabled) return;
    if (fatalErrorRef.current) return;

    // Clear any pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const es = new EventSource(`/api/tasks/${taskId}/events`);
    eventSourceRef.current = es;

    setStatus((prev) => (prev === "connecting" ? "connecting" : prev));

    es.addEventListener("open", () => {
      reconnectAttemptsRef.current = 0;
      setStatus("connected");
    });

    es.addEventListener("log", (e) => {
      const data = JSON.parse(e.data) as TaskLogEvent;
      if (!seenSequencesRef.current.has(data.sequence)) {
        seenSequencesRef.current.add(data.sequence);
        setLogs((prev) => [...prev, data]);
      }
    });

    es.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      setStatus(data.status);
      callbacksRef.current.onComplete?.(data.status);
      es.close();
    });

    es.addEventListener("paused", (e) => {
      const data = JSON.parse(e.data) as PausedEvent;
      setStatus("paused");
      setPausedData(data);
      callbacksRef.current.onPaused?.(data);
    });

    es.addEventListener("error", (e) => {
      // Server-sent error events carry data (e.g. task not found, db error)
      if (e.data) {
        try {
          const data = JSON.parse(e.data);
          console.error("[SSE] Server error:", data.message);
          setStatus("error");
          fatalErrorRef.current = true;
          es.close();
          return;
        } catch {
          // ignore parse error, fall through to connection-error handling
        }
      }

      // Native connection error (network drop, timeout, server restart)
      if (es.readyState === EventSource.CLOSED) {
        setStatus("disconnected");

        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current),
            30000
          );
          reconnectAttemptsRef.current++;
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setStatus("error");
        }
      } else {
        // CONNECTING or OPEN state transient error
        setStatus("connecting");
      }
    });
  }, [taskId, enabled]);

  useEffect(() => {
    seenSequencesRef.current.clear();
    setLogs([]);
    setStatus("connecting");
    setPausedData(null);
    reconnectAttemptsRef.current = 0;
    fatalErrorRef.current = false;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    fatalErrorRef.current = true;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  return { logs, status, pausedData, disconnect };
}
