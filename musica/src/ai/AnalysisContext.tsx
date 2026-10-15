import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as db from "../db/db";
import type { ChordSegment } from "./harmony";

/** What the AI found in a song (lyrics live in the lyrics store). */
export interface AnalysisRecord {
  trackId: string;
  bpm: number;
  key: string;
  chords: ChordSegment[];
  beats: number[];
  analyzedAt: number;
}

interface AnalysisApi {
  get: (trackId: string) => AnalysisRecord | null | undefined;
  ensure: (trackId: string) => void;
  save: (record: AnalysisRecord) => Promise<void>;
  /** Changes the chords by hand (fixing a wrong chord). */
  updateChords: (trackId: string, chords: ChordSegment[]) => Promise<void>;
  remove: (trackId: string) => Promise<void>;
}

const AnalysisContext = createContext<AnalysisApi | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  // undefined = not loaded yet, null = no analysis stored.
  const [records, setRecords] = useState<Map<string, AnalysisRecord | null>>(
    new Map(),
  );
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const loading = useRef(new Set<string>());

  const set = useCallback((trackId: string, record: AnalysisRecord | null) => {
    recordsRef.current = new Map(recordsRef.current).set(trackId, record);
    setRecords(recordsRef.current);
  }, []);

  const ensure = useCallback(
    (trackId: string) => {
      if (recordsRef.current.has(trackId) || loading.current.has(trackId))
        return;
      loading.current.add(trackId);
      db.get<AnalysisRecord>("analysis", trackId)
        .then(
          (stored) => set(trackId, stored ?? null),
          () => set(trackId, null),
        )
        .finally(() => loading.current.delete(trackId));
    },
    [set],
  );

  const api = useMemo<AnalysisApi>(
    () => ({
      get: (trackId) => records.get(trackId),
      ensure,
      save: async (record) => {
        await db.put("analysis", record);
        set(record.trackId, record);
      },
      updateChords: async (trackId, chords) => {
        const current = recordsRef.current.get(trackId);
        if (!current) return;
        const next = { ...current, chords };
        await db.put("analysis", next);
        set(trackId, next);
      },
      remove: async (trackId) => {
        await db.remove("analysis", trackId);
        set(trackId, null);
      },
    }),
    [records, ensure, set],
  );

  return (
    <AnalysisContext.Provider value={api}>{children}</AnalysisContext.Provider>
  );
}

export function useAnalysisStore(): AnalysisApi {
  const value = useContext(AnalysisContext);
  if (!value)
    throw new Error("useAnalysisStore must be used inside AnalysisProvider");
  return value;
}

/** The stored analysis of a track (null when it was never analyzed). */
export function useAnalysis(
  trackId: string | null | undefined,
): AnalysisRecord | null {
  const store = useAnalysisStore();
  useEffect(() => {
    if (trackId) store.ensure(trackId);
  }, [trackId, store.ensure]);
  return trackId ? (store.get(trackId) ?? null) : null;
}
