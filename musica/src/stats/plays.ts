import { isLocal, type Track, type TrackSource } from "../api/types";
import type { ShowSession } from "../show/session";

export interface PlayRecord {
  id: string;
  trackId: string;
  source: TrackSource;
  title: string;
  artist: string;
  album: string;
  /** Epoch ms. */
  startedAt: number;
  endedAt: number;
  /** Seconds actually listened (seeking forward doesn't count). */
  seconds: number;
  /** Track length in seconds, 0 if unknown. */
  duration: number;
  /** Played through to the end. */
  completed: boolean;
  /** Set when the play happened during a recorded show. */
  showId: string | null;
}

export function newPlay(
  track: Track,
  at: number,
  showId: string | null,
): PlayRecord {
  return {
    id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    trackId: track.id,
    source: track.source,
    title: track.title,
    artist: track.artist,
    album: track.album,
    startedAt: at,
    endedAt: at,
    seconds: 0,
    duration: track.duration,
    completed: false,
    showId,
  };
}

/**
 * A play counts once the listener stayed for 30 s, or half of a song
 * shorter than a minute, or heard it to the end.
 */
export function countsAsPlay(
  play: Pick<PlayRecord, "seconds" | "duration" | "completed">,
) {
  if (play.completed) return true;
  const threshold = play.duration > 0 ? Math.min(30, play.duration / 2) : 30;
  return play.seconds >= threshold;
}

/**
 * Songs performed in shows, as plays. In playback shows the player also
 * logged plays tagged with the show id; those are left out of statistics
 * (see `statsSource`) so each performance counts once, from here.
 */
export function showEntriesAsPlays(
  sessions: ShowSession[],
  now: number,
): PlayRecord[] {
  return sessions.flatMap((session) =>
    session.entries.map((entry, index) => {
      const endedAt = entry.endedAt ?? session.endedAt ?? now;
      return {
        id: `${session.id}#${index}`,
        trackId: entry.trackId,
        source: isLocal({ id: entry.trackId })
          ? ("local" as const)
          : ("jamendo" as const),
        title: entry.title,
        artist: entry.artist,
        album: "",
        startedAt: entry.startedAt,
        endedAt,
        seconds: Math.max(0, (endedAt - entry.startedAt) / 1000),
        duration: entry.plannedSeconds,
        completed: false,
        showId: session.id,
      };
    }),
  );
}

/** Everything statistics count: everyday listening plus show performances. */
export function statsSource(
  plays: PlayRecord[],
  sessions: ShowSession[],
  now: number,
): PlayRecord[] {
  return [
    ...plays.filter((play) => play.showId === null),
    ...showEntriesAsPlays(sessions, now),
  ];
}

export type PlayScope = "all" | "listening" | "shows";

export interface StatsFilter {
  /** Epoch ms, inclusive. */
  from?: number;
  scope?: PlayScope;
}

export interface TrackStat {
  trackId: string;
  source: TrackSource;
  title: string;
  artist: string;
  plays: number;
  seconds: number;
  lastPlayed: number;
}

export interface ArtistStat {
  artist: string;
  plays: number;
  seconds: number;
  tracks: number;
}

export interface DayStat {
  /** YYYY-MM-DD in local time. */
  day: string;
  seconds: number;
}

export interface StatsSummary {
  seconds: number;
  plays: number;
  distinctTracks: number;
  distinctArtists: number;
  tracks: TrackStat[];
  artists: ArtistStat[];
  days: DayStat[];
}

export function filterPlays(
  plays: PlayRecord[],
  filter: StatsFilter = {},
): PlayRecord[] {
  return plays.filter((play) => {
    if (filter.from !== undefined && play.startedAt < filter.from) return false;
    if (filter.scope === "shows" && play.showId === null) return false;
    if (filter.scope === "listening" && play.showId !== null) return false;
    return true;
  });
}

export function localDay(epochMs: number): string {
  const date = new Date(epochMs);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Minutes count every second listened; "plays" only those that pass `countsAsPlay`. */
export function summarize(
  plays: PlayRecord[],
  filter: StatsFilter = {},
): StatsSummary {
  const selected = filterPlays(plays, filter);
  const tracks = new Map<string, TrackStat>();
  const artists = new Map<string, ArtistStat & { ids: Set<string> }>();
  const days = new Map<string, number>();
  let seconds = 0;
  let playCount = 0;

  for (const play of selected) {
    const counted = countsAsPlay(play);
    seconds += play.seconds;
    if (counted) playCount++;

    const track = tracks.get(play.trackId) ?? {
      trackId: play.trackId,
      source: play.source,
      title: play.title,
      artist: play.artist,
      plays: 0,
      seconds: 0,
      lastPlayed: 0,
    };
    track.seconds += play.seconds;
    if (counted) track.plays++;
    if (play.startedAt >= track.lastPlayed) {
      // Newest play wins, so renamed tracks show their current name.
      track.lastPlayed = play.startedAt;
      track.title = play.title;
      track.artist = play.artist;
    }
    tracks.set(play.trackId, track);

    const artistName = play.artist.trim() || "Artista desconhecido";
    const artist = artists.get(artistName) ?? {
      artist: artistName,
      plays: 0,
      seconds: 0,
      tracks: 0,
      ids: new Set<string>(),
    };
    artist.seconds += play.seconds;
    if (counted) artist.plays++;
    artist.ids.add(play.trackId);
    artist.tracks = artist.ids.size;
    artists.set(artistName, artist);

    const day = localDay(play.startedAt);
    days.set(day, (days.get(day) ?? 0) + play.seconds);
  }

  const byPlaysThenTime = <T extends { plays: number; seconds: number }>(
    a: T,
    b: T,
  ) => b.plays - a.plays || b.seconds - a.seconds;

  return {
    seconds,
    plays: playCount,
    distinctTracks: tracks.size,
    distinctArtists: artists.size,
    tracks: [...tracks.values()].sort(byPlaysThenTime),
    artists: [...artists.values()]
      .map(({ ids: _ids, ...artist }) => artist)
      .sort(byPlaysThenTime),
    days: [...days.entries()]
      .map(([day, total]) => ({ day, seconds: total }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export function trackHistory(plays: PlayRecord[], trackId: string) {
  const mine = plays.filter((play) => play.trackId === trackId);
  return {
    plays: mine.filter(countsAsPlay).length,
    seconds: mine.reduce((sum, play) => sum + play.seconds, 0),
    showPlays: mine.filter((play) => play.showId !== null && countsAsPlay(play))
      .length,
    firstPlayed: mine.reduce(
      (min, play) => Math.min(min, play.startedAt),
      Infinity,
    ),
    lastPlayed: mine.reduce((max, play) => Math.max(max, play.startedAt), 0),
    recent: [...mine].sort((a, b) => b.startedAt - a.startedAt).slice(0, 20),
  };
}
