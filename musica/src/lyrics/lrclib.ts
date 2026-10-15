/**
 * LRCLIB (https://lrclib.net): a free, open database of synced lyrics.
 * No key needed; requests go straight from the browser.
 */

const API = "https://lrclib.net/api";

export interface LrclibResult {
  id: number;
  title: string;
  artist: string;
  album: string;
  /** Seconds. */
  duration: number;
  instrumental: boolean;
  plain: string;
  synced: string;
}

export class LyricsLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LyricsLookupError";
  }
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

export function toResult(raw: Record<string, unknown>): LrclibResult | null {
  if (typeof raw.id !== "number") return null;
  return {
    id: raw.id,
    title: str(raw.trackName) || str(raw.name),
    artist: str(raw.artistName),
    album: str(raw.albumName),
    duration: typeof raw.duration === "number" ? raw.duration : 0,
    instrumental: raw.instrumental === true,
    plain: str(raw.plainLyrics),
    synced: str(raw.syncedLyrics),
  };
}

/**
 * Strips decorations that rarely match lyrics databases:
 * "Música (Ao Vivo)", "Song - Remastered 2011", "Song [Live]", "feat. X".
 */
export function cleanTitle(title: string): string {
  return title
    .replace(
      /\s*[([][^)\]]*\b(ao vivo|live|remaster(ed)?|vers[aã]o|version|edit|mix|ac[uú]stic[oa]|acoustic|demo|bonus)\b[^)\]]*[)\]]/gi,
      "",
    )
    .replace(
      /\s+[-–—]\s+.*\b(remaster(ed)?|live|ao vivo|version|vers[aã]o|edit|mix)\b.*$/i,
      "",
    )
    .replace(/\s+(feat\.?|ft\.?|part\.?|participa[cç][aã]o)\s+.*$/i, "")
    .trim();
}

async function call(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
) {
  const url = new URL(`${API}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  let response: Response;
  try {
    response = await fetch(url, signal ? { signal } : {});
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new LyricsLookupError(
      "Não foi possível conectar ao serviço de letras.",
    );
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new LyricsLookupError(
      `O serviço de letras respondeu com erro ${response.status}.`,
    );
  }
  return (await response.json()) as unknown;
}

export async function searchLyrics(
  query: { title: string; artist?: string } | { q: string },
  signal?: AbortSignal,
): Promise<LrclibResult[]> {
  const params: Record<string, string> =
    "q" in query
      ? { q: query.q }
      : {
          track_name: cleanTitle(query.title) || query.title,
          artist_name: query.artist ?? "",
        };
  const body = await call("search", params, signal);
  if (!Array.isArray(body)) return [];
  return body
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map(toResult)
    .filter((item): item is LrclibResult => item !== null);
}

/**
 * Picks the best match for a track: synced lyrics first, then the closest
 * duration (a different recording of the song has different timing).
 */
export function bestMatch(
  results: LrclibResult[],
  duration: number,
): LrclibResult | null {
  const usable = results.filter(
    (item) => item.synced || item.plain || item.instrumental,
  );
  if (usable.length === 0) return null;
  const distance = (item: LrclibResult) =>
    duration > 0 && item.duration > 0 ? Math.abs(item.duration - duration) : 30;
  const scored = usable
    // A recording more than 15 s off is likely another version.
    .filter(
      (item) => distance(item) <= 15 || duration <= 0 || item.duration <= 0,
    )
    .sort(
      (a, b) =>
        Number(!!b.synced) - Number(!!a.synced) || distance(a) - distance(b),
    );
  return scored[0] ?? null;
}

/** Best guess for a track, or null when nothing fits. */
export async function findLyrics(
  track: { title: string; artist: string; album: string; duration: number },
  signal?: AbortSignal,
): Promise<LrclibResult | null> {
  const exact = await call(
    "get",
    {
      track_name: track.title,
      artist_name: track.artist,
      album_name: track.album,
      duration: track.duration > 0 ? String(Math.round(track.duration)) : "",
    },
    signal,
  );
  if (exact && typeof exact === "object") {
    const result = toResult(exact as Record<string, unknown>);
    if (result && (result.synced || result.plain || result.instrumental))
      return result;
  }
  const results = await searchLyrics(
    { title: track.title, artist: track.artist },
    signal,
  );
  return bestMatch(results, track.duration);
}
