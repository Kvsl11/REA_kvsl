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
import { useLibrary } from "../library/LibraryContext";
import { useLocal } from "../local/LocalContext";
import { usePlayer } from "../player/PlayerContext";
import * as S from "./session";

interface StartOptions {
  name: string;
  venue: string;
  mode: S.ShowMode;
  setlistId: string | null;
  setlistName: string;
  tracks: Track[];
}

interface ShowApi {
  loaded: boolean;
  /** The show being recorded, if any. */
  active: S.ShowSession | null;
  /** Every show, newest first (including the active one). */
  sessions: S.ShowSession[];
  start: (options: StartOptions) => S.ShowSession;
  /** Starts setlist song `index` (and plays it in playback mode). */
  playPlanned: (index: number) => void;
  /** Starts the next expected setlist song, or finishes the current one at the end. */
  next: () => void;
  finishSong: () => void;
  toggleBreak: () => void;
  end: () => S.ShowSession | null;
  update: (
    id: string,
    patch: Partial<Pick<S.ShowSession, "name" | "venue" | "notes">>,
  ) => void;
  remove: (id: string) => Promise<void>;
  error: string | null;
}

const ShowContext = createContext<ShowApi | null>(null);

function newShowId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ShowProvider({ children }: { children: ReactNode }) {
  const player = usePlayer();
  const library = useLibrary();
  const local = useLocal();
  const [sessions, setSessions] = useState<S.ShowSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Source of truth for synchronous reads: several changes can happen in
  // the same tick (a player "end" followed by "start"), before React renders.
  const sessionsRef = useRef(sessions);
  const commit = useCallback((next: S.ShowSession[]) => {
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  const active = sessions.find((session) => session.endedAt === null) ?? null;
  const activeShow = () =>
    sessionsRef.current.find((session) => session.endedAt === null) ?? null;

  const save = useCallback((session: S.ShowSession) => {
    db.put("shows", session).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, []);

  /** Applies a change to one show, saves it, and returns the new version. */
  const change = useCallback(
    (id: string, update: (session: S.ShowSession) => S.ShowSession) => {
      const current = sessionsRef.current.find((session) => session.id === id);
      if (!current) return null;
      const updated = update(current);
      if (updated === current) return current;
      commit(
        sessionsRef.current.map((session) =>
          session.id === id ? updated : session,
        ),
      );
      save(updated);
      return updated;
    },
    [commit, save],
  );

  useEffect(() => {
    let cancelled = false;
    db.getAll<S.ShowSession>("shows").then(
      (stored) => {
        if (cancelled) return;
        // Shows created before loading finished stay on top.
        const known = new Set(sessionsRef.current.map((session) => session.id));
        commit(
          [
            ...sessionsRef.current,
            ...stored.filter((session) => !known.has(session.id)),
          ].sort((a, b) => b.startedAt - a.startedAt),
        );
        setLoaded(true);
      },
      (cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [commit]);

  // Playback mode: the show follows the player.
  useEffect(
    () =>
      player.subscribe((event) => {
        const show = activeShow();
        if (!show || show.mode !== "playback") return;
        if (event.type === "start") {
          change(show.id, (session) =>
            S.startSong(
              session,
              {
                trackId: event.track.id,
                title: event.track.title,
                artist: event.track.artist,
                seconds: event.track.duration,
              },
              event.at,
            ),
          );
        } else if (event.type === "end") {
          const current = S.currentEntry(show);
          if (current?.trackId === event.track.id) {
            change(show.id, (session) => S.finishSong(session, event.at));
          }
        }
      }),
    [player, change],
  );

  /** The setlist's playable tracks, in setlist order. */
  const setlistTracks = useCallback(
    (show: S.ShowSession): Track[] => {
      const playlist = library.playlists.find(
        (item) => item.id === show.setlistId,
      );
      const tracks = local.resolveAll(playlist?.tracks ?? []);
      // The setlist may have been edited since the show started: follow the
      // recorded order and keep only what can still be played.
      const byId = new Map(tracks.map((track) => [track.id, track]));
      return show.planned
        .map((song) => byId.get(song.trackId))
        .filter((track): track is Track => track !== undefined);
    },
    [library.playlists, local],
  );

  const api = useMemo<ShowApi>(() => {
    const playIndex = (show: S.ShowSession, index: number) => {
      const song = show.planned[index];
      if (!song) return;
      const tracks = setlistTracks(show);
      const at = tracks.findIndex((track) => track.id === song.trackId);
      if (at >= 0) {
        player.playList(tracks, at);
      } else {
        // Not playable any more (deleted file): record it as live.
        change(show.id, (session) =>
          S.startPlanned(session, index, Date.now()),
        );
      }
    };

    return {
      loaded,
      active,
      sessions,
      error,
      start: (options) => {
        const now = Date.now();
        // Only one show at a time: close a forgotten one first.
        const previous = activeShow();
        if (previous) change(previous.id, (session) => S.endShow(session, now));
        const session = S.createShow({ ...options, id: newShowId() }, now);
        commit([session, ...sessionsRef.current]);
        save(session);
        if (options.mode === "playback" && options.tracks.length > 0) {
          player.playList(options.tracks, 0);
        }
        return session;
      },
      playPlanned: (index) => {
        const show = activeShow();
        if (!show) return;
        if (show.mode === "playback") playIndex(show, index);
        else
          change(show.id, (session) =>
            S.startPlanned(session, index, Date.now()),
          );
      },
      next: () => {
        const show = activeShow();
        if (!show) return;
        const index = S.nextPlannedIndex(show);
        if (index < 0) {
          if (show.mode === "playback") player.pause();
          change(show.id, (session) => S.finishSong(session, Date.now()));
          return;
        }
        if (show.mode === "playback") playIndex(show, index);
        else
          change(show.id, (session) =>
            S.startPlanned(session, index, Date.now()),
          );
      },
      finishSong: () => {
        const show = activeShow();
        if (!show) return;
        if (show.mode === "playback") player.pause();
        change(show.id, (session) => S.finishSong(session, Date.now()));
      },
      toggleBreak: () => {
        const show = activeShow();
        if (!show) return;
        if (S.currentBreak(show)) {
          change(show.id, (session) => S.endBreak(session, Date.now()));
        } else {
          if (show.mode === "playback") player.pause();
          change(show.id, (session) => S.startBreak(session, Date.now()));
        }
      },
      end: () => {
        const show = activeShow();
        if (!show) return null;
        if (show.mode === "playback") player.pause();
        return change(show.id, (session) => S.endShow(session, Date.now()));
      },
      update: (id, patch) =>
        change(id, (session) => ({
          ...session,
          ...patch,
          updatedAt: Date.now(),
        })),
      remove: async (id) => {
        await db.remove("shows", id);
        commit(sessionsRef.current.filter((session) => session.id !== id));
      },
    };
  }, [
    loaded,
    active,
    sessions,
    error,
    change,
    commit,
    save,
    player,
    setlistTracks,
  ]);

  return <ShowContext.Provider value={api}>{children}</ShowContext.Provider>;
}

export function useShow(): ShowApi {
  const value = useContext(ShowContext);
  if (!value) throw new Error("useShow must be used inside ShowProvider");
  return value;
}
