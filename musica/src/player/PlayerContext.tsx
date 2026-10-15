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
import { useLocal } from "../local/LocalContext";
import * as Q from "./queue";

const VOLUME_STORAGE_KEY = "sonora.volume";

/**
 * What the player reports to listeners (play history, show recording):
 * - start: a track began loading because the user or the queue chose it;
 * - listen: `seconds` of real playback happened (seeking doesn't count);
 * - end: the current track stopped being current; `completed` when it
 *   played to its end rather than being skipped or replaced.
 */
export type PlayerEvent =
  | { type: "start"; track: Track; at: number }
  | { type: "listen"; track: Track; seconds: number }
  | { type: "end"; track: Track; at: number; completed: boolean };

type Listener = (event: PlayerEvent) => void;

interface PlayerApi {
  state: Q.QueueState;
  track: Track | null;
  playing: boolean;
  loading: boolean;
  /** Seconds. */
  position: number;
  /** Seconds; falls back to the stored duration until the audio reports its own. */
  duration: number;
  volume: number;
  muted: boolean;
  error: string | null;
  playList: (tracks: Track[], startIndex: number) => void;
  togglePlay: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  /** Exact playback position right now (position updates only ~4×/s). */
  getTime: () => number;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playNext: (track: Track) => void;
  enqueue: (track: Track) => void;
  jumpTo: (index: number) => void;
  removeAt: (index: number) => void;
  subscribe: (listener: Listener) => () => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    const stored = Number(raw);
    return raw !== null && stored >= 0 && stored <= 1 ? stored : 0.8;
  } catch {
    return 0.8;
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const local = useLocal();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "auto";
  }

  const [state, setState] = useState<Q.QueueState>(Q.emptyQueue);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [volume, setVolumeState] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every explicit play request so replaying the same track
  // (repeat-one, or clicking the playing row) restarts it.
  const [playToken, setPlayToken] = useState(0);

  const rawTrack = Q.currentTrack(state);
  // Imported tracks may have been edited since they were queued.
  const track = rawTrack ? local.resolve(rawTrack) : null;

  const stateRef = useRef(state);
  stateRef.current = state;
  const trackRef = useRef<Track | null>(track);
  trackRef.current = track;

  const listeners = useRef(new Set<Listener>());
  const emit = useCallback((event: PlayerEvent) => {
    for (const listener of listeners.current) {
      try {
        listener(event);
      } catch (cause) {
        console.error(cause);
      }
    }
  }, []);

  /** The track the listeners currently consider "started", if any. */
  const announced = useRef<Track | null>(null);
  const endAnnounced = useCallback(
    (completed: boolean) => {
      const previous = announced.current;
      if (!previous) return;
      announced.current = null;
      emit({ type: "end", track: previous, at: Date.now(), completed });
    },
    [emit],
  );

  const advance = useCallback(
    (auto: boolean) => {
      endAnnounced(auto);
      const nextState = Q.next(stateRef.current, auto);
      if (nextState === null) {
        setPlaying(false);
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        return;
      }
      setState(nextState);
      setPlayToken((token) => token + 1);
    },
    [endAnnounced],
  );

  // Load and start the current track whenever it (or the play token) changes.
  const loadId = useRef(0);
  /** Playback position at the previous timeupdate, to measure real listening. */
  const lastTime = useRef(0);
  const getAudioUrl = local.getAudioUrl;
  useEffect(() => {
    const audio = audioRef.current;
    const current = trackRef.current;
    if (!audio || !current) return;
    const id = ++loadId.current;

    // Whatever was announced before is over: skipped or replaced.
    endAnnounced(false);
    announced.current = current;
    emit({ type: "start", track: current, at: Date.now() });

    audio.pause();
    setPosition(0);
    setMediaDuration(0);
    setError(null);
    setLoading(true);
    lastTime.current = 0;

    const source =
      current.source === "local"
        ? getAudioUrl(current.id)
        : Promise.resolve(current.audioUrl);
    source
      .then((url) => {
        if (id !== loadId.current) return;
        if (audio.src !== url) audio.src = url;
        audio.currentTime = 0;
        return audio.play().then(() => {
          if (id === loadId.current) setPlaying(true);
        });
      })
      .catch((cause: unknown) => {
        if (id !== loadId.current) return;
        // A newer load interrupted this one: not an error.
        if (cause instanceof DOMException && cause.name === "AbortError")
          return;
        setPlaying(false);
        if (cause instanceof DOMException && cause.name === "NotAllowedError")
          return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível tocar esta música.",
        );
      })
      .finally(() => {
        if (id === loadId.current) setLoading(false);
      });
    // Keyed on id + token only: re-running for edited metadata would restart playback.
  }, [rawTrack?.id, playToken, getAudioUrl, emit, endAnnounced]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setPosition(audio.currentTime);
      const delta = audio.currentTime - lastTime.current;
      lastTime.current = audio.currentTime;
      // Normal playback advances ~0.25 s per event; bigger jumps are seeks.
      const current = announced.current;
      if (current && !audio.paused && delta > 0 && delta < 2) {
        emit({ type: "listen", track: current, seconds: delta });
      }
    };
    const onSeeked = () => {
      lastTime.current = audio.currentTime;
    };
    const onDuration = () =>
      setMediaDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => advance(true);
    const onError = () => {
      if (!audio.getAttribute("src")) return;
      setPlaying(false);
      setLoading(false);
      setError("Não foi possível tocar esta música.");
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [advance, emit]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    } catch {
      // Volume just won't be remembered.
    }
  }, [volume, muted]);

  const api = useMemo<PlayerApi>(() => {
    const audio = audioRef.current;
    return {
      state,
      track,
      playing,
      loading,
      position,
      duration: mediaDuration || track?.duration || 0,
      volume,
      muted,
      error,
      playList: (tracks, startIndex) => {
        setState((current) => Q.playList(current, tracks, startIndex));
        setPlayToken((token) => token + 1);
      },
      togglePlay: () => {
        if (!audio || !trackRef.current) return;
        if (audio.paused) {
          // After the queue ran out the current track is no longer announced.
          if (!announced.current) {
            setPlayToken((token) => token + 1);
            return;
          }
          audio.play().catch(() => setPlaying(false));
        } else {
          audio.pause();
        }
      },
      pause: () => audio?.pause(),
      stop: () => {
        endAnnounced(false);
        loadId.current++;
        audio?.pause();
        audio?.removeAttribute("src");
        audio?.load();
        setPlaying(false);
        setLoading(false);
        setPosition(0);
        setState((current) => ({
          ...current,
          queue: [],
          original: [],
          index: -1,
        }));
      },
      next: () => advance(false),
      previous: () => {
        // Like most players: past 3 s, "previous" restarts the current track.
        if (audio && audio.currentTime > 3) {
          audio.currentTime = 0;
          return;
        }
        const prev = Q.previous(stateRef.current);
        if (prev.index === stateRef.current.index) {
          if (audio) audio.currentTime = 0;
          return;
        }
        setState(prev);
        setPlayToken((token) => token + 1);
      },
      getTime: () => audio?.currentTime ?? 0,
      seek: (seconds) => {
        if (!audio) return;
        audio.currentTime = seconds;
        lastTime.current = seconds;
        setPosition(seconds);
      },
      setVolume: (value) => {
        setVolumeState(Math.min(Math.max(value, 0), 1));
        setMuted(false);
      },
      toggleMute: () => setMuted((value) => !value),
      toggleShuffle: () => setState((current) => Q.toggleShuffle(current)),
      cycleRepeat: () => setState((current) => Q.cycleRepeat(current)),
      playNext: (item) => {
        const wasEmpty = stateRef.current.index < 0;
        setState((current) => Q.playNext(current, item));
        if (wasEmpty) setPlayToken((token) => token + 1);
      },
      enqueue: (item) => {
        const wasEmpty = stateRef.current.index < 0;
        setState((current) => Q.enqueue(current, item));
        if (wasEmpty) setPlayToken((token) => token + 1);
      },
      jumpTo: (index) => {
        setState((current) => Q.jumpTo(current, index));
        setPlayToken((token) => token + 1);
      },
      removeAt: (index) => setState((current) => Q.removeAt(current, index)),
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    };
  }, [
    state,
    track,
    playing,
    loading,
    position,
    mediaDuration,
    volume,
    muted,
    error,
    advance,
    endAnnounced,
  ]);

  // Lock-screen / headset controls where the browser supports them.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.cover ? [{ src: track.cover, sizes: "300x300" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => api.togglePlay());
      navigator.mediaSession.setActionHandler("pause", () => api.togglePlay());
      navigator.mediaSession.setActionHandler("nexttrack", () => api.next());
      navigator.mediaSession.setActionHandler("previoustrack", () =>
        api.previous(),
      );
    } catch {
      // Media Session is optional.
    }
  }, [track, api]);

  // Space toggles playback, unless the user is typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, [contenteditable='true']",
        )
      )
        return;
      event.preventDefault();
      api.togglePlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  return (
    <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider");
  return value;
}
