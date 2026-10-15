import * as db from "./db/db";
import type { LibraryData } from "./library/LibraryContext";
import type { AnalysisRecord } from "./ai/AnalysisContext";
import type { LyricsRecord } from "./lyrics/LyricsContext";
import type { TrackInfo } from "./local/LocalContext";
import type { LocalTrackRecord } from "./local/importer";
import type { ShowSession } from "./show/session";
import type { PlayRecord } from "./stats/plays";

export const BACKUP_FORMAT = "sonora-backup";
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  library: LibraryData;
  trackInfo: TrackInfo[];
  plays: PlayRecord[];
  shows: ShowSession[];
  lyrics: LyricsRecord[];
  analysis: AnalysisRecord[];
  localTracks: LocalTrackRecord[];
  /** Audio as data: URLs keyed by track id; only when the user opts in. */
  audio: Record<string, string>;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler o áudio"));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  return response.blob();
}

export async function createBackup(
  library: LibraryData,
  includeAudio: boolean,
): Promise<Backup> {
  const [trackInfo, plays, shows, lyrics, analysis, localTracks] =
    await Promise.all([
      db.getAll<TrackInfo>("trackInfo"),
      db.getAll<PlayRecord>("plays"),
      db.getAll<ShowSession>("shows"),
      db.getAll<LyricsRecord>("lyrics"),
      db.getAll<AnalysisRecord>("analysis"),
      db.getAll<LocalTrackRecord>("localTracks"),
    ]);
  const audio: Record<string, string> = {};
  if (includeAudio) {
    for (const record of localTracks) {
      const blob = await db.get<Blob>("audio", record.id);
      if (blob) audio[record.id] = await blobToDataUrl(blob);
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    library,
    trackInfo,
    plays,
    shows,
    lyrics,
    analysis,
    // Without the audio the file records would point at nothing.
    localTracks: includeAudio
      ? localTracks.filter((record) => audio[record.id])
      : [],
    audio,
  };
}

export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("O arquivo não é um backup válido (JSON ilegível).");
  }
  const data = raw as Partial<Backup>;
  if (data?.format !== BACKUP_FORMAT) {
    throw new Error("Este arquivo não é um backup do Sonora.");
  }
  if (typeof data.version !== "number" || data.version > BACKUP_VERSION) {
    throw new Error(
      "Backup de uma versão mais nova do app. Atualize o app e tente de novo.",
    );
  }
  const list = <T>(value: unknown): T[] =>
    Array.isArray(value) ? (value as T[]) : [];
  return {
    format: BACKUP_FORMAT,
    version: data.version,
    exportedAt: typeof data.exportedAt === "number" ? data.exportedAt : 0,
    library: (data.library ?? { liked: [], playlists: [] }) as LibraryData,
    trackInfo: list<TrackInfo>(data.trackInfo).filter(
      (item) => typeof item?.trackId === "string",
    ),
    plays: list<PlayRecord>(data.plays).filter(
      (item) => typeof item?.id === "string",
    ),
    shows: list<ShowSession>(data.shows).filter(
      (item) => typeof item?.id === "string" && Array.isArray(item.entries),
    ),
    // Older backups have no lyrics.
    lyrics: list<LyricsRecord>(data.lyrics).filter(
      (item) => typeof item?.trackId === "string",
    ),
    analysis: list<AnalysisRecord>(data.analysis).filter(
      (item) => typeof item?.trackId === "string" && Array.isArray(item.chords),
    ),
    localTracks: list<LocalTrackRecord>(data.localTracks).filter(
      (item) => typeof item?.id === "string",
    ),
    audio:
      typeof data.audio === "object" && data.audio !== null ? data.audio : {},
  };
}

/**
 * Merges a backup into this browser: records with the same id are
 * replaced, everything else is kept. The library (playlists, likes) is
 * returned for the caller to apply, since it lives in React state.
 */
export async function restoreBackup(
  backup: Backup,
): Promise<{ audioRestored: number }> {
  let audioRestored = 0;
  for (const record of backup.localTracks) {
    const url = backup.audio[record.id];
    if (!url) continue;
    const blob = await dataUrlToBlob(url);
    await db.writeAll([
      { store: "localTracks", value: record },
      { store: "audio", value: blob, key: record.id },
    ]);
    audioRestored++;
  }
  await db.writeAll([
    ...backup.trackInfo.map((value) => ({
      store: "trackInfo" as const,
      value,
    })),
    ...backup.plays.map((value) => ({ store: "plays" as const, value })),
    ...backup.shows.map((value) => ({ store: "shows" as const, value })),
    ...backup.lyrics.map((value) => ({ store: "lyrics" as const, value })),
    ...backup.analysis.map((value) => ({ store: "analysis" as const, value })),
  ]);
  return { audioRestored };
}
