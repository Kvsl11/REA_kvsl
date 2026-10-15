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
import {
  isAudioFile,
  localToTrack,
  readLocalFile,
  type LocalTrackRecord,
} from "./importer";

/** Stage notes a musician keeps per song; works for imported and Jamendo tracks. */
export interface TrackInfo {
  trackId: string;
  /** Tom, e.g. "Am" or "D". */
  key: string;
  bpm: number | null;
  notes: string;
  updatedAt: number;
}

export interface ImportResult {
  imported: LocalTrackRecord[];
  skipped: { name: string; reason: string }[];
}

export type LocalTrackPatch = Partial<
  Pick<
    LocalTrackRecord,
    "title" | "artist" | "album" | "year" | "genre" | "cover" | "duration"
  >
>;

interface LocalApi {
  loaded: boolean;
  /** Newest first. */
  records: LocalTrackRecord[];
  tracks: Track[];
  importing: { done: number; total: number } | null;
  importFiles: (files: File[]) => Promise<ImportResult>;
  updateLocal: (id: string, patch: LocalTrackPatch) => Promise<void>;
  deleteLocal: (id: string) => Promise<void>;
  getRecord: (id: string) => LocalTrackRecord | undefined;
  /** Object URL for an imported track's audio, created on demand and cached. */
  getAudioUrl: (id: string) => Promise<string>;
  /** Swaps a saved snapshot of an imported track for its current, edited version. */
  resolve: (track: Track) => Track;
  /** Like `resolve` over a list, dropping imported tracks that were deleted. */
  resolveAll: (tracks: Track[]) => Track[];
  info: (trackId: string) => TrackInfo | undefined;
  saveInfo: (
    trackId: string,
    info: Omit<TrackInfo, "trackId" | "updatedAt">,
  ) => Promise<void>;
  error: string | null;
}

const LocalContext = createContext<LocalApi | null>(null);

export function LocalProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<LocalTrackRecord[]>([]);
  const [infos, setInfos] = useState<Map<string, TrackInfo>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState<LocalApi["importing"]>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      db.getAll<LocalTrackRecord>("localTracks"),
      db.getAll<TrackInfo>("trackInfo"),
    ]).then(
      ([storedTracks, storedInfo]) => {
        if (cancelled) return;
        setRecords(storedTracks.sort((a, b) => b.importedAt - a.importedAt));
        setInfos(new Map(storedInfo.map((item) => [item.trackId, item])));
        setLoaded(true);
      },
      (cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoaded(true);
      },
    );
    const cache = urls.current;
    return () => {
      cancelled = true;
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  const byId = useMemo(
    () => new Map(records.map((record) => [record.id, record])),
    [records],
  );

  const importFiles = useCallback(
    async (files: File[]): Promise<ImportResult> => {
      const result: ImportResult = { imported: [], skipped: [] };
      const existing = new Set(
        records.map((record) => `${record.fileName}|${record.size}`),
      );
      const audioFiles: File[] = [];
      for (const file of files) {
        if (!isAudioFile(file)) {
          result.skipped.push({
            name: file.name,
            reason: "não é um arquivo de áudio",
          });
        } else if (existing.has(`${file.name}|${file.size}`)) {
          result.skipped.push({
            name: file.name,
            reason: "já estava importada",
          });
        } else {
          existing.add(`${file.name}|${file.size}`);
          audioFiles.push(file);
        }
      }
      if (audioFiles.length > 0) void db.requestPersistence();

      setImporting({ done: 0, total: audioFiles.length });
      const batchStart = Date.now();
      for (const [index, file] of audioFiles.entries()) {
        try {
          // Newest first overall, but a batch keeps the order the files were picked in.
          const record = await readLocalFile(file, batchStart - index);
          await db.writeAll([
            { store: "localTracks", value: record },
            { store: "audio", value: file, key: record.id },
          ]);
          result.imported.push(record);
          setRecords((current) =>
            [...current, record].sort((a, b) => b.importedAt - a.importedAt),
          );
        } catch (cause) {
          const quota =
            cause instanceof DOMException &&
            cause.name === "QuotaExceededError";
          result.skipped.push({
            name: file.name,
            reason: quota
              ? "sem espaço no navegador"
              : "não foi possível ler o arquivo",
          });
        }
        setImporting({ done: index + 1, total: audioFiles.length });
      }
      setImporting(null);
      return result;
    },
    [records],
  );

  const updateLocal = useCallback(
    async (id: string, patch: LocalTrackPatch) => {
      const current = byId.get(id);
      if (!current) return;
      const next: LocalTrackRecord = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      await db.put("localTracks", next);
      setRecords((list) =>
        list.map((record) => (record.id === id ? next : record)),
      );
    },
    [byId],
  );

  const deleteLocal = useCallback(async (id: string) => {
    await db.writeAll([
      { store: "localTracks", key: id, delete: true },
      { store: "audio", key: id, delete: true },
      { store: "trackInfo", key: id, delete: true },
    ]);
    const url = urls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.current.delete(id);
    setRecords((list) => list.filter((record) => record.id !== id));
    setInfos((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }, []);

  const getAudioUrl = useCallback(async (id: string) => {
    const cached = urls.current.get(id);
    if (cached) return cached;
    const blob = await db.get<Blob>("audio", id);
    if (!blob)
      throw new Error(
        "Arquivo de áudio não encontrado. Importe a música de novo.",
      );
    const url = URL.createObjectURL(blob);
    urls.current.set(id, url);
    return url;
  }, []);

  const saveInfo = useCallback<LocalApi["saveInfo"]>(async (trackId, info) => {
    const record: TrackInfo = {
      trackId,
      key: info.key.trim(),
      bpm: info.bpm && info.bpm > 0 ? Math.round(info.bpm) : null,
      notes: info.notes.trim(),
      updatedAt: Date.now(),
    };
    await db.put("trackInfo", record);
    setInfos((map) => new Map(map).set(trackId, record));
  }, []);

  const api = useMemo<LocalApi>(() => {
    const resolve = (track: Track): Track => {
      if (track.source !== "local") return track;
      const record = byId.get(track.id);
      return record ? localToTrack(record) : track;
    };
    return {
      loaded,
      records,
      tracks: records.map(localToTrack),
      importing,
      importFiles,
      updateLocal,
      deleteLocal,
      getRecord: (id) => byId.get(id),
      getAudioUrl,
      resolve,
      resolveAll: (tracks) =>
        tracks
          // Before loading finishes nothing is known to be deleted yet.
          .filter(
            (track) =>
              !loaded || track.source !== "local" || byId.has(track.id),
          )
          .map(resolve),
      info: (trackId) => infos.get(trackId),
      saveInfo,
      error,
    };
  }, [
    loaded,
    records,
    byId,
    importing,
    importFiles,
    updateLocal,
    deleteLocal,
    getAudioUrl,
    infos,
    saveInfo,
    error,
  ]);

  return <LocalContext.Provider value={api}>{children}</LocalContext.Provider>;
}

export function useLocal(): LocalApi {
  const value = useContext(LocalContext);
  if (!value) throw new Error("useLocal must be used inside LocalProvider");
  return value;
}
