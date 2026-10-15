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
import type { Track } from "../api/types";
import * as db from "../db/db";
import { isLrc, lrcToPlain, parseLrc, type LyricLine } from "./lrc";
import { findLyrics, LyricsLookupError } from "./lrclib";

export type LyricsSource = "lrclib" | "manual" | "arquivo" | "sincronizada";

export interface LyricsRecord {
  trackId: string;
  /** LRC text with timestamps, or "" when only plain text is known. */
  synced: string;
  plain: string;
  instrumental: boolean;
  source: LyricsSource;
  lrclibId: number | null;
  /** User adjustment: positive shows each line earlier. */
  offsetMs: number;
  updatedAt: number;
}

export type LyricsStatus =
  | "loading"
  | "searching"
  | "ready"
  | "missing"
  | "error";

interface Entry {
  status: LyricsStatus;
  record: LyricsRecord | null;
  error: string | null;
}

interface LyricsApi {
  entry: (trackId: string) => Entry | undefined;
  /** Loads stored lyrics (once) and, if none and allowed, looks them up online. */
  ensure: (track: Track, autoFetch: boolean) => void;
  lookup: (track: Track) => void;
  save: (
    trackId: string,
    lyrics: Pick<LyricsRecord, "synced" | "plain" | "source"> &
      Partial<Pick<LyricsRecord, "instrumental" | "lrclibId" | "offsetMs">>,
  ) => Promise<void>;
  setOffset: (trackId: string, offsetMs: number) => Promise<void>;
  remove: (trackId: string) => Promise<void>;
}

const LyricsContext = createContext<LyricsApi | null>(null);

export function LyricsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  /** Lookups already attempted this session, so a miss isn't retried on every render. */
  const tried = useRef(new Set<string>());

  const set = useCallback((trackId: string, entry: Entry) => {
    entriesRef.current = new Map(entriesRef.current).set(trackId, entry);
    setEntries(entriesRef.current);
  }, []);

  const persist = useCallback(
    async (record: LyricsRecord) => {
      await db.put("lyrics", record);
      set(record.trackId, { status: "ready", record, error: null });
    },
    [set],
  );

  const lookup = useCallback(
    (track: Track) => {
      tried.current.add(track.id);
      const previous = entriesRef.current.get(track.id)?.record ?? null;
      set(track.id, { status: "searching", record: previous, error: null });
      findLyrics(track).then(
        (found) => {
          if (!found) {
            set(track.id, {
              status: previous ? "ready" : "missing",
              record: previous,
              error: null,
            });
            return;
          }
          void persist({
            trackId: track.id,
            synced: found.synced,
            plain: found.plain || lrcToPlain(found.synced),
            instrumental: found.instrumental,
            source: "lrclib",
            lrclibId: found.id,
            offsetMs: previous?.offsetMs ?? 0,
            updatedAt: Date.now(),
          });
        },
        (cause: unknown) => {
          set(track.id, {
            status: previous ? "ready" : "error",
            record: previous,
            error:
              cause instanceof LyricsLookupError
                ? cause.message
                : "Não foi possível buscar a letra.",
          });
        },
      );
    },
    [persist, set],
  );

  const ensure = useCallback(
    (track: Track, autoFetch: boolean) => {
      const current = entriesRef.current.get(track.id);
      if (current && current.status !== "missing") return;
      if (current?.status === "missing") {
        if (autoFetch && !tried.current.has(track.id) && navigator.onLine)
          lookup(track);
        return;
      }
      set(track.id, { status: "loading", record: null, error: null });
      db.get<LyricsRecord>("lyrics", track.id).then(
        (stored) => {
          if (stored) {
            set(track.id, { status: "ready", record: stored, error: null });
          } else if (
            autoFetch &&
            !tried.current.has(track.id) &&
            navigator.onLine
          ) {
            lookup(track);
          } else {
            set(track.id, { status: "missing", record: null, error: null });
          }
        },
        () => set(track.id, { status: "missing", record: null, error: null }),
      );
    },
    [lookup, set],
  );

  const api = useMemo<LyricsApi>(
    () => ({
      entry: (trackId) => entries.get(trackId),
      ensure,
      lookup,
      save: async (trackId, lyrics) => {
        const previous = entriesRef.current.get(trackId)?.record;
        await persist({
          trackId,
          synced: lyrics.synced.trim(),
          plain: lyrics.plain.trim() || lrcToPlain(lyrics.synced),
          instrumental: lyrics.instrumental ?? false,
          source: lyrics.source,
          lrclibId: lyrics.lrclibId ?? null,
          offsetMs: lyrics.offsetMs ?? previous?.offsetMs ?? 0,
          updatedAt: Date.now(),
        });
      },
      setOffset: async (trackId, offsetMs) => {
        const previous = entriesRef.current.get(trackId)?.record;
        if (!previous) return;
        await persist({
          ...previous,
          offsetMs: Math.round(offsetMs),
          updatedAt: Date.now(),
        });
      },
      remove: async (trackId) => {
        await db.remove("lyrics", trackId);
        tried.current.add(trackId);
        set(trackId, { status: "missing", record: null, error: null });
      },
    }),
    [entries, ensure, lookup, persist, set],
  );

  return (
    <LyricsContext.Provider value={api}>{children}</LyricsContext.Provider>
  );
}

export function useLyricsStore(): LyricsApi {
  const value = useContext(LyricsContext);
  if (!value)
    throw new Error("useLyricsStore must be used inside LyricsProvider");
  return value;
}

export interface TrackLyrics {
  status: LyricsStatus;
  record: LyricsRecord | null;
  /** Timed lines (empty when the lyrics aren't synced). */
  lines: LyricLine[];
  /** File offset plus the user's adjustment. */
  offsetMs: number;
  plain: string;
  error: string | null;
}

/** Lyrics for a track, loading them (and fetching online if `autoFetch`). */
export function useTrackLyrics(
  track: Track | null,
  autoFetch = true,
): TrackLyrics {
  const store = useLyricsStore();
  useEffect(() => {
    if (track) store.ensure(track, autoFetch);
    // Re-run per track; the store dedupes repeated calls.
  }, [track?.id, autoFetch, store.ensure]);

  const entry = track ? store.entry(track.id) : undefined;
  const record = entry?.record ?? null;
  return useMemo(() => {
    const parsed =
      record?.synced && isLrc(record.synced) ? parseLrc(record.synced) : null;
    return {
      status: entry?.status ?? "loading",
      record,
      lines: parsed?.lines ?? [],
      offsetMs: (parsed?.offsetMs ?? 0) + (record?.offsetMs ?? 0),
      plain: record ? record.plain || lrcToPlain(record.synced) : "",
      error: entry?.error ?? null,
    };
  }, [entry, record]);
}
