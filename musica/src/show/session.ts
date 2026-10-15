import type { Track } from "../api/types";

/**
 * - playback: the app plays the songs (DJ / backing tracks); the show
 *   follows whatever the player plays.
 * - live: a band plays; the musician taps when each song starts.
 */
export type ShowMode = "playback" | "live";

export interface PlannedSong {
  trackId: string;
  title: string;
  artist: string;
  /** Seconds; the recorded track length, used as the expected duration. */
  seconds: number;
}

export interface ShowEntry {
  trackId: string;
  title: string;
  artist: string;
  /** Position in the setlist, or -1 for a song outside it (encore, request). */
  plannedIndex: number;
  plannedSeconds: number;
  startedAt: number;
  endedAt: number | null;
}

export interface ShowBreak {
  startedAt: number;
  endedAt: number | null;
}

export interface ShowSession {
  id: string;
  name: string;
  venue: string;
  setlistId: string | null;
  setlistName: string;
  mode: ShowMode;
  planned: PlannedSong[];
  startedAt: number;
  endedAt: number | null;
  entries: ShowEntry[];
  breaks: ShowBreak[];
  notes: string;
  updatedAt: number;
}

export function plannedFrom(tracks: Track[]): PlannedSong[] {
  return tracks.map((track) => ({
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    seconds: Math.round(track.duration),
  }));
}

export function createShow(
  options: {
    id: string;
    name: string;
    venue?: string;
    setlistId: string | null;
    setlistName: string;
    mode: ShowMode;
    tracks: Track[];
  },
  now: number,
): ShowSession {
  return {
    id: options.id,
    name: options.name.trim() || "Show",
    venue: options.venue?.trim() ?? "",
    setlistId: options.setlistId,
    setlistName: options.setlistName,
    mode: options.mode,
    planned: plannedFrom(options.tracks),
    startedAt: now,
    endedAt: null,
    entries: [],
    breaks: [],
    notes: "",
    updatedAt: now,
  };
}

export function isLive(session: ShowSession): boolean {
  return session.endedAt === null;
}

export function currentEntry(session: ShowSession): ShowEntry | null {
  const last = session.entries.at(-1);
  return last && last.endedAt === null ? last : null;
}

export function currentBreak(session: ShowSession): ShowBreak | null {
  const last = session.breaks.at(-1);
  return last && last.endedAt === null ? last : null;
}

function closeOpen(session: ShowSession, now: number): ShowSession {
  return {
    ...session,
    entries: session.entries.map((entry) =>
      entry.endedAt === null
        ? { ...entry, endedAt: Math.max(now, entry.startedAt) }
        : entry,
    ),
    breaks: session.breaks.map((item) =>
      item.endedAt === null
        ? { ...item, endedAt: Math.max(now, item.startedAt) }
        : item,
    ),
    updatedAt: now,
  };
}

function playedIndexes(session: ShowSession): Set<number> {
  return new Set(
    session.entries
      .map((entry) => entry.plannedIndex)
      .filter((index) => index >= 0),
  );
}

/**
 * The setlist position the show expects next: the first unplayed song
 * after the last one played from the setlist, wrapping to any unplayed
 * song before it. -1 when the whole setlist was played.
 */
export function nextPlannedIndex(session: ShowSession): number {
  const played = playedIndexes(session);
  const lastPlayed = [...session.entries]
    .reverse()
    .find((entry) => entry.plannedIndex >= 0)?.plannedIndex;
  const start = lastPlayed === undefined ? 0 : lastPlayed + 1;
  for (let i = start; i < session.planned.length; i++)
    if (!played.has(i)) return i;
  for (let i = 0; i < start && i < session.planned.length; i++)
    if (!played.has(i)) return i;
  return -1;
}

/** Setlist position for a track the player started (playback mode). */
export function matchPlannedIndex(
  session: ShowSession,
  trackId: string,
): number {
  const expected = nextPlannedIndex(session);
  if (expected >= 0 && session.planned[expected]?.trackId === trackId)
    return expected;
  const played = playedIndexes(session);
  const unplayed = session.planned.findIndex(
    (song, index) => song.trackId === trackId && !played.has(index),
  );
  if (unplayed >= 0) return unplayed;
  // Played again (bis): attribute it to its setlist slot anyway.
  return session.planned.findIndex((song) => song.trackId === trackId);
}

export function startSong(
  session: ShowSession,
  song: { trackId: string; title: string; artist: string; seconds: number },
  now: number,
  plannedIndex = matchPlannedIndex(session, song.trackId),
): ShowSession {
  if (!isLive(session)) return session;
  const closed = closeOpen(session, now);
  return {
    ...closed,
    entries: [
      ...closed.entries,
      {
        trackId: song.trackId,
        title: song.title,
        artist: song.artist,
        plannedIndex,
        plannedSeconds: Math.round(
          plannedIndex >= 0
            ? (session.planned[plannedIndex]?.seconds ?? song.seconds)
            : song.seconds,
        ),
        startedAt: now,
        endedAt: null,
      },
    ],
  };
}

export function startPlanned(
  session: ShowSession,
  index: number,
  now: number,
): ShowSession {
  const song = session.planned[index];
  if (!song) return session;
  return startSong(session, song, now, index);
}

export function finishSong(session: ShowSession, now: number): ShowSession {
  if (!isLive(session) || !currentEntry(session)) return session;
  return closeOpen(session, now);
}

export function startBreak(session: ShowSession, now: number): ShowSession {
  if (!isLive(session) || currentBreak(session)) return session;
  const closed = closeOpen(session, now);
  return {
    ...closed,
    breaks: [...closed.breaks, { startedAt: now, endedAt: null }],
  };
}

export function endBreak(session: ShowSession, now: number): ShowSession {
  if (!isLive(session) || !currentBreak(session)) return session;
  return closeOpen(session, now);
}

export function endShow(session: ShowSession, now: number): ShowSession {
  if (!isLive(session)) return session;
  return {
    ...closeOpen(session, now),
    endedAt: Math.max(now, session.startedAt),
  };
}

const seconds = (from: number, to: number) => Math.max(0, (to - from) / 1000);

export interface EntrySummary extends ShowEntry {
  /** Seconds actually played. */
  actualSeconds: number;
  /** actual − planned (positive = ran long); null when nothing was planned. */
  diffSeconds: number | null;
  /** Seconds since the show started. */
  offsetSeconds: number;
}

export interface ShowSummary {
  totalSeconds: number;
  musicSeconds: number;
  breakSeconds: number;
  /** Time between songs that wasn't a declared break (talking, tuning…). */
  gapSeconds: number;
  plannedSeconds: number;
  songsPlayed: number;
  plannedCount: number;
  playedFromSetlist: number;
  skipped: (PlannedSong & { index: number })[];
  extras: number;
  entries: EntrySummary[];
  longest: EntrySummary | null;
}

export function summarizeShow(session: ShowSession, now: number): ShowSummary {
  const end = session.endedAt ?? now;
  const entries: EntrySummary[] = session.entries.map((entry) => {
    const actualSeconds = seconds(entry.startedAt, entry.endedAt ?? end);
    return {
      ...entry,
      actualSeconds,
      diffSeconds:
        entry.plannedSeconds > 0 ? actualSeconds - entry.plannedSeconds : null,
      offsetSeconds: seconds(session.startedAt, entry.startedAt),
    };
  });
  const totalSeconds = seconds(session.startedAt, end);
  const musicSeconds = entries.reduce(
    (sum, entry) => sum + entry.actualSeconds,
    0,
  );
  const breakSeconds = session.breaks.reduce(
    (sum, item) => sum + seconds(item.startedAt, item.endedAt ?? end),
    0,
  );
  const played = playedIndexes(session);
  return {
    totalSeconds,
    musicSeconds,
    breakSeconds,
    gapSeconds: Math.max(0, totalSeconds - musicSeconds - breakSeconds),
    plannedSeconds: session.planned.reduce(
      (sum, song) => sum + song.seconds,
      0,
    ),
    songsPlayed: entries.length,
    plannedCount: session.planned.length,
    playedFromSetlist: played.size,
    skipped: session.planned
      .map((song, index) => ({ ...song, index }))
      .filter((song) => !played.has(song.index)),
    extras: entries.filter((entry) => entry.plannedIndex < 0).length,
    entries,
    longest: entries.reduce<EntrySummary | null>(
      (best, entry) =>
        !best || entry.actualSeconds > best.actualSeconds ? entry : best,
      null,
    ),
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function clock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function mmss(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/** Semicolon-separated so it opens correctly in Excel set to Portuguese. */
export function showToCsv(session: ShowSession, now: number): string {
  const summary = summarizeShow(session, now);
  const rows: (string | number)[][] = [
    ["Show", session.name],
    ["Local", session.venue],
    ["Setlist", session.setlistName],
    ["Início", new Date(session.startedAt).toLocaleString("pt-BR")],
    [
      "Fim",
      session.endedAt
        ? new Date(session.endedAt).toLocaleString("pt-BR")
        : "em andamento",
    ],
    ["Duração total", mmss(summary.totalSeconds)],
    ["Tempo de música", mmss(summary.musicSeconds)],
    ["Intervalos", mmss(summary.breakSeconds)],
    ["Entre músicas", mmss(summary.gapSeconds)],
    [],
    [
      "#",
      "Música",
      "Artista",
      "Início",
      "Tocou (min:s)",
      "Previsto (min:s)",
      "Diferença",
      "No setlist",
    ],
    ...summary.entries.map((entry, index) => [
      index + 1,
      entry.title,
      entry.artist,
      clock(entry.startedAt),
      mmss(entry.actualSeconds),
      entry.plannedSeconds > 0 ? mmss(entry.plannedSeconds) : "",
      entry.diffSeconds === null ? "" : mmss(entry.diffSeconds),
      entry.plannedIndex >= 0 ? `sim (${entry.plannedIndex + 1})` : "extra",
    ]),
  ];
  if (summary.skipped.length > 0) {
    rows.push([], ["Não tocadas"]);
    for (const song of summary.skipped)
      rows.push([song.index + 1, song.title, song.artist]);
  }
  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
