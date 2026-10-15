import type { Track } from "../api/types";

export type RepeatMode = "off" | "all" | "one";

export interface QueueState {
  /** Tracks in play order (shuffled when shuffle is on). */
  queue: Track[];
  /** The list as the user started it, restored when shuffle is turned off. */
  original: Track[];
  /** Index into `queue`, or -1 when nothing is loaded. */
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export const emptyQueue: QueueState = {
  queue: [],
  original: [],
  index: -1,
  shuffle: false,
  repeat: "off",
};

export function currentTrack(state: QueueState): Track | null {
  return state.queue[state.index] ?? null;
}

/** Fisher–Yates shuffle that keeps `first` at the front. */
function shuffled(
  tracks: Track[],
  first: Track | null,
  random: () => number,
): Track[] {
  const rest = first ? tracks.filter((track) => track !== first) : [...tracks];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return first ? [first, ...rest] : rest;
}

export function playList(
  state: QueueState,
  tracks: Track[],
  startIndex: number,
  random: () => number = Math.random,
): QueueState {
  if (tracks.length === 0) return state;
  const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
  if (!state.shuffle) {
    return { ...state, queue: [...tracks], original: [...tracks], index };
  }
  const first = tracks[index]!;
  return {
    ...state,
    queue: shuffled(tracks, first, random),
    original: [...tracks],
    index: 0,
  };
}

/**
 * Index after the current track finishes or "next" is pressed.
 * `auto` is true when the track ended on its own: only then does
 * repeat-one replay the same track.
 */
export function next(state: QueueState, auto: boolean): QueueState | null {
  if (state.index < 0) return null;
  if (auto && state.repeat === "one") return state;
  const nextIndex = state.index + 1;
  if (nextIndex < state.queue.length) return { ...state, index: nextIndex };
  if (state.repeat === "off") return null;
  return { ...state, index: 0 };
}

export function previous(state: QueueState): QueueState {
  if (state.index <= 0) {
    return state.repeat === "all" && state.queue.length > 0
      ? { ...state, index: state.queue.length - 1 }
      : state;
  }
  return { ...state, index: state.index - 1 };
}

export function toggleShuffle(
  state: QueueState,
  random: () => number = Math.random,
): QueueState {
  const current = currentTrack(state);
  if (state.shuffle) {
    const index = current ? state.original.indexOf(current) : -1;
    return {
      ...state,
      shuffle: false,
      queue: [...state.original],
      index: index >= 0 ? index : state.index,
    };
  }
  return {
    ...state,
    shuffle: true,
    queue: shuffled(state.queue, current, random),
    index: current ? 0 : -1,
  };
}

export function cycleRepeat(state: QueueState): QueueState {
  const order: RepeatMode[] = ["off", "all", "one"];
  const repeat = order[(order.indexOf(state.repeat) + 1) % order.length]!;
  return { ...state, repeat };
}

/** "Tocar em seguida": inserts right after the current track. */
export function playNext(state: QueueState, track: Track): QueueState {
  if (state.index < 0) return playList(state, [track], 0);
  const at = state.index + 1;
  const queue = [...state.queue.slice(0, at), track, ...state.queue.slice(at)];
  const current = currentTrack(state);
  const originalAt = current
    ? state.original.indexOf(current) + 1
    : state.original.length;
  const original = [
    ...state.original.slice(0, originalAt),
    track,
    ...state.original.slice(originalAt),
  ];
  return { ...state, queue, original };
}

/** "Adicionar à fila": appends to the end. */
export function enqueue(state: QueueState, track: Track): QueueState {
  if (state.index < 0) return playList(state, [track], 0);
  return {
    ...state,
    queue: [...state.queue, track],
    original: [...state.original, track],
  };
}

export function jumpTo(state: QueueState, index: number): QueueState {
  if (index < 0 || index >= state.queue.length) return state;
  return { ...state, index };
}

export function removeAt(state: QueueState, index: number): QueueState {
  // The playing track stays; only upcoming or past entries can be removed.
  if (index === state.index || index < 0 || index >= state.queue.length)
    return state;
  const removed = state.queue[index]!;
  const queue = state.queue.filter((_, i) => i !== index);
  const originalIndex = state.original.indexOf(removed);
  const original =
    originalIndex >= 0
      ? state.original.filter((_, i) => i !== originalIndex)
      : state.original;
  return {
    ...state,
    queue,
    original,
    index: index < state.index ? state.index - 1 : state.index,
  };
}
