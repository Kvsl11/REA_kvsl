import type { Album, Artist, Track } from "./types";

const API_BASE = "https://api.jamendo.com/v3.0";
const CLIENT_ID_STORAGE_KEY = "sonora.jamendoClientId";

export class JamendoError extends Error {
  constructor(
    message: string,
    readonly kind: "missing-client-id" | "network" | "api",
  ) {
    super(message);
    this.name = "JamendoError";
  }
}

function envClientId(): string {
  const fromEnv: unknown = import.meta.env.VITE_JAMENDO_CLIENT_ID;
  return typeof fromEnv === "string" ? fromEnv.trim() : "";
}

/** True when the ID is baked in at build time, so it can't be changed in the app. */
export function clientIdFromEnv(): boolean {
  return envClientId() !== "";
}

export function getClientId(): string {
  const fromEnv = envClientId();
  if (fromEnv !== "") return fromEnv;
  try {
    return localStorage.getItem(CLIENT_ID_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveClientId(clientId: string): void {
  try {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId.trim());
  } catch {
    // Storage blocked (private mode): the ID lasts only for this page load.
  }
}

export function clearClientId(): void {
  try {
    localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

type Params = Record<string, string | number | undefined>;

interface JamendoResponse {
  headers?: { status?: string; error_message?: string };
  results?: unknown[];
}

async function request(
  path: string,
  params: Params,
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const clientId = getClientId();
  if (clientId === "") {
    throw new JamendoError(
      "Client ID do Jamendo não configurado.",
      "missing-client-id",
    );
  }

  const url = new URL(`${API_BASE}/${path}/`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, signal ? { signal } : {});
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new JamendoError("Não foi possível conectar ao Jamendo.", "network");
  }
  if (!response.ok) {
    throw new JamendoError(
      `O Jamendo respondeu com erro ${response.status}.`,
      "api",
    );
  }

  const body = (await response.json()) as JamendoResponse;
  if (body.headers?.status !== "success") {
    throw new JamendoError(
      body.headers?.error_message || "O Jamendo recusou a requisição.",
      "api",
    );
  }
  return (body.results ?? []).filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  );
}

const str = (value: unknown): string =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : "";

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function toTrack(raw: Record<string, unknown>): Track | null {
  const audioUrl = str(raw.audio);
  const id = str(raw.id);
  // A track without a stream URL can't be played, so it isn't shown at all.
  if (id === "" || audioUrl === "") return null;
  return {
    id,
    source: "jamendo",
    title: str(raw.name),
    artist: str(raw.artist_name),
    artistId: str(raw.artist_id),
    album: str(raw.album_name),
    albumId: str(raw.album_id),
    cover: str(raw.album_image) || str(raw.image),
    audioUrl,
    duration: num(raw.duration),
    licenseUrl: str(raw.license_ccurl),
  };
}

export function toAlbum(raw: Record<string, unknown>): Album | null {
  const id = str(raw.id);
  if (id === "") return null;
  return {
    id,
    title: str(raw.name),
    artist: str(raw.artist_name),
    artistId: str(raw.artist_id),
    cover: str(raw.image),
    releaseDate: str(raw.releasedate),
  };
}

export function toArtist(raw: Record<string, unknown>): Artist | null {
  const id = str(raw.id);
  if (id === "") return null;
  return { id, name: str(raw.name), image: str(raw.image) };
}

function compact<T>(items: (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}

const TRACK_DEFAULTS = { imagesize: 300, audioformat: "mp32" } as const;

export type TrackOrder =
  | "popularity_week"
  | "popularity_month"
  | "popularity_total"
  | "releasedate_desc";

export async function getTracks(
  options: { order?: TrackOrder; tag?: string; limit?: number },
  signal?: AbortSignal,
): Promise<Track[]> {
  const results = await request(
    "tracks",
    {
      ...TRACK_DEFAULTS,
      order: options.order ?? "popularity_week",
      tags: options.tag,
      limit: options.limit ?? 20,
    },
    signal,
  );
  return compact(results.map(toTrack));
}

export async function searchAll(
  query: string,
  signal?: AbortSignal,
): Promise<{ tracks: Track[]; albums: Album[]; artists: Artist[] }> {
  const [tracks, albums, artists] = await Promise.all([
    request("tracks", { ...TRACK_DEFAULTS, search: query, limit: 20 }, signal),
    request("albums", { namesearch: query, imagesize: 300, limit: 10 }, signal),
    request("artists", { namesearch: query, limit: 10 }, signal),
  ]);
  return {
    tracks: compact(tracks.map(toTrack)),
    albums: compact(albums.map(toAlbum)),
    artists: compact(artists.map(toArtist)),
  };
}

export async function getAlbum(
  id: string,
  signal?: AbortSignal,
): Promise<{ album: Album | null; tracks: Track[] }> {
  const [albums, tracks] = await Promise.all([
    request("albums", { id, imagesize: 300 }, signal),
    request(
      "tracks",
      { ...TRACK_DEFAULTS, album_id: id, order: "position", limit: 100 },
      signal,
    ),
  ]);
  const first = albums[0];
  return {
    album: first ? toAlbum(first) : null,
    tracks: compact(tracks.map(toTrack)),
  };
}

export async function getArtist(
  id: string,
  signal?: AbortSignal,
): Promise<{ artist: Artist | null; tracks: Track[]; albums: Album[] }> {
  const [artists, tracks, albums] = await Promise.all([
    request("artists", { id }, signal),
    request(
      "tracks",
      {
        ...TRACK_DEFAULTS,
        artist_id: id,
        order: "popularity_total",
        limit: 20,
      },
      signal,
    ),
    request(
      "albums",
      { artist_id: id, imagesize: 300, order: "releasedate_desc", limit: 20 },
      signal,
    ),
  ]);
  const first = artists[0];
  return {
    artist: first ? toArtist(first) : null,
    tracks: compact(tracks.map(toTrack)),
    albums: compact(albums.map(toAlbum)),
  };
}

export async function getTrack(
  id: string,
  signal?: AbortSignal,
): Promise<Track | null> {
  const results = await request("tracks", { ...TRACK_DEFAULTS, id }, signal);
  const first = results[0];
  return first ? toTrack(first) : null;
}

/** False when the user chose to use only their own files. */
export function hasJamendo(): boolean {
  return getClientId() !== "";
}
