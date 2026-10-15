export type TrackSource = "jamendo" | "local";

export interface Track {
  /** Jamendo tracks use Jamendo's numeric id; imported files use "local:<uuid>". */
  id: string;
  source: TrackSource;
  title: string;
  artist: string;
  /** Empty for imported files: they have no artist or album page. */
  artistId: string;
  album: string;
  albumId: string;
  /** Image URL, or a data: URL for covers of imported files. */
  cover: string;
  /** Stream URL. Empty for imported files: their audio is read from storage at play time. */
  audioUrl: string;
  /** Seconds. */
  duration: number;
  licenseUrl: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  cover: string;
  releaseDate: string;
}

export interface Artist {
  id: string;
  name: string;
  image: string;
}

export function isLocal(track: Pick<Track, "id">): boolean {
  return track.id.startsWith("local:");
}

/** Tracks saved before `source` existed were all from Jamendo. */
export function withSource(track: Track): Track {
  if (track.source === "jamendo" || track.source === "local") return track;
  return { ...track, source: isLocal(track) ? "local" : "jamendo" };
}
