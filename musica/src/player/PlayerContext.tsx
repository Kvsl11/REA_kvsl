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
import * as Q from "./queue";

const VOLUME_STORAGE_KEY = "sonora.volume";

interface PlayerApi {
  state: Q.QueueState;
  track: Track | null;
  playing: boolean;
  /** Seconds. */
  position: number;
  /** Seconds; falls back to the API duration until the audio reports its own. */
  duration: number;
  volume: number;
  muted: boolean;
  error: string | null;
  playList: (tracks: Track[], startIndex: number) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playNext: (track: Track) => void;
  enqueue: (track: Track) => void;
  jumpTo: (index: number) => void;
  removeAt: (index: number) => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

function readVolume(): number {
  try {
    const stored = Number(localStorage.getItem(VOLUME_STORAGE_KEY));
    return stored >= 0 &&
      stored <= 1 &&
      localStorage.getItem(VOLUME_STORAGE_KEY) !== null
      ? stored
      : 0.8;
  } catch {
    return 0.8;
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "auto";
  }

  const [state, setState] = useState<Q.QueueState>(Q.emptyQueue);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [volume, setVolumeState] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every explicit play request so replaying the same track
  // (repeat-one, or clicking the playing row) restarts it.
  const [playToken, setPlayToken] = useState(0);

  const track = Q.currentTrack(state);
  const stateRef = useRef(state);
  stateRef.current = state;

  const advance = useCallback((auto: boolean) => {
    const nextState = Q.next(stateRef.current, auto);
    if (nextState === null) {
      setPlaying(false);
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    setState(nextState);
    setPlayToken((token) => token + 1);
  }, []);

  // Load and start the current track whenever it (or the play token) changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (audio.src !== track.audioUrl) audio.src = track.audioUrl;
    audio.currentTime = 0;
    setPosition(0);
    setMediaDuration(0);
    setError(null);
    audio.play().then(
      () => setPlaying(true),
      (cause: unknown) => {
        // Autoplay blocked or the request was superseded by another track.
        if (cause instanceof DOMException && cause.name === "AbortError")
          return;
        setPlaying(false);
      },
    );
    // Keyed on id + token only: re-running for other track fields would restart playback.
  }, [track?.id, playToken]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPosition(audio.currentTime);
    const onDuration = () =>
      setMediaDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => advance(true);
    const onError = () => {
      setPlaying(false);
      setError("Não foi possível tocar esta música.");
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [advance]);

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
        if (!audio || !track) return;
        if (audio.paused) {
          audio.play().catch(() => setPlaying(false));
        } else {
          audio.pause();
        }
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
      seek: (seconds) => {
        if (!audio) return;
        audio.currentTime = seconds;
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
    };
  }, [
    state,
    track,
    playing,
    position,
    mediaDuration,
    volume,
    muted,
    error,
    advance,
  ]);

  // Lock-screen / headset controls where the browser supports them.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;
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
  }, [track, api]);

  return (
    <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider");
  return value;
}
