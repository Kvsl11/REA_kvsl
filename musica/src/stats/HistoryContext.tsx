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
import { usePlayer } from "../player/PlayerContext";
import { useShow } from "../show/ShowContext";
import { newPlay, statsSource, type PlayRecord } from "./plays";

/** How often an in-progress play is saved, in seconds listened. */
const SAVE_EVERY_SECONDS = 10;
const RECENT_KEY = "sonora.recent.v1";
const RECENT_LIMIT = 20;

function loadRecent(): Track[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as Track[]) : [];
  } catch {
    return [];
  }
}

interface HistoryApi {
  loaded: boolean;
  /** Everyday listening, newest first. */
  plays: PlayRecord[];
  /** What statistics count: listening plus show performances. */
  statsPlays: PlayRecord[];
  /** Last distinct tracks played, newest first, ready to play again. */
  recentTracks: Track[];
  clearHistory: () => Promise<void>;
}

const HistoryContext = createContext<HistoryApi | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const player = usePlayer();
  const show = useShow();
  const [plays, setPlays] = useState<PlayRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [recentTracks, setRecentTracks] = useState<Track[]>(loadRecent);
  const showIdRef = useRef<string | null>(null);
  showIdRef.current = show.active?.mode === "playback" ? show.active.id : null;

  useEffect(() => {
    let cancelled = false;
    db.getAll<PlayRecord>("plays").then(
      (stored) => {
        if (cancelled) return;
        setPlays((current) => {
          const known = new Set(current.map((play) => play.id));
          return [
            ...current,
            ...stored.filter((play) => !known.has(play.id)),
          ].sort((a, b) => b.startedAt - a.startedAt);
        });
        setLoaded(true);
      },
      () => {
        if (!cancelled) setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const current = useRef<{ play: PlayRecord; unsaved: number } | null>(null);

  const persist = useCallback((play: PlayRecord) => {
    // Plays shorter than a second (instant skips) aren't worth keeping.
    if (play.seconds < 1) return;
    const snapshot = { ...play };
    db.put("plays", snapshot).catch(() => {
      // History is best-effort; playback must never fail because of it.
    });
    setPlays((list) => {
      const index = list.findIndex((item) => item.id === snapshot.id);
      if (index < 0) return [snapshot, ...list];
      const next = [...list];
      next[index] = snapshot;
      return next;
    });
  }, []);

  useEffect(
    () =>
      player.subscribe((event) => {
        if (event.type === "start") {
          // Imported covers are data URLs; they're looked up again when shown.
          const slim =
            event.track.source === "local"
              ? { ...event.track, cover: "" }
              : event.track;
          setRecentTracks((list) =>
            [slim, ...list.filter((track) => track.id !== slim.id)].slice(
              0,
              RECENT_LIMIT,
            ),
          );
          if (current.current) persist(current.current.play);
          current.current = {
            play: newPlay(event.track, event.at, showIdRef.current),
            unsaved: 0,
          };
          return;
        }
        const entry = current.current;
        if (!entry || entry.play.trackId !== event.track.id) return;
        if (event.type === "listen") {
          entry.play.seconds += event.seconds;
          entry.play.endedAt = Date.now();
          entry.unsaved += event.seconds;
          if (entry.unsaved >= SAVE_EVERY_SECONDS) {
            entry.unsaved = 0;
            persist(entry.play);
          }
        } else {
          entry.play.endedAt = event.at;
          entry.play.completed = event.completed;
          persist(entry.play);
          current.current = null;
        }
      }),
    [player, persist],
  );

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentTracks));
    } catch {
      // Only a convenience list.
    }
  }, [recentTracks]);

  // Closing the tab mid-song still keeps what was heard.
  useEffect(() => {
    const flush = () => {
      if (current.current) persist(current.current.play);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persist]);

  const clearHistory = useCallback(async () => {
    await db.clear("plays");
    current.current = null;
    setPlays([]);
    setRecentTracks([]);
  }, []);

  // Refreshed whenever plays or shows change; "now" only matters for a live show.
  const statsPlays = useMemo(
    () => statsSource(plays, show.sessions, Date.now()),
    [plays, show.sessions],
  );

  const api = useMemo<HistoryApi>(
    () => ({
      loaded,
      plays: plays.filter((play) => play.showId === null),
      statsPlays,
      recentTracks,
      clearHistory,
    }),
    [loaded, plays, statsPlays, recentTracks, clearHistory],
  );

  return (
    <HistoryContext.Provider value={api}>{children}</HistoryContext.Provider>
  );
}

export function useHistory(): HistoryApi {
  const value = useContext(HistoryContext);
  if (!value) throw new Error("useHistory must be used inside HistoryProvider");
  return value;
}
