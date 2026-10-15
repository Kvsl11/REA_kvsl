import { useCallback, useEffect, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  retry: () => void;
}

/** Runs `load` whenever `key` changes; aborts the previous request. */
export function useAsync<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): AsyncState<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, data, error: null });
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          data: null,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      },
    );
    return () => controller.abort();
    // `load` is recreated each render; `key` captures what it depends on.
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const current = result?.key === key ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    retry,
  };
}
