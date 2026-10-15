import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { withSource, type Track } from "../api/types";

const STORAGE_KEY = "sonora.library.v1";

export interface Playlist {
  id: string;
  name: string;
  /** "setlist" playlists are show plans: ordered, timed, startable as a show. */
  kind: "playlist" | "setlist";
  description: string;
  tracks: Track[];
  createdAt: number;
}

export interface LibraryData {
  liked: Track[];
  playlists: Playlist[];
}

interface LibraryApi extends LibraryData {
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => void;
  createPlaylist: (name: string, kind?: Playlist["kind"]) => Playlist;
  updatePlaylist: (
    id: string,
    patch: Partial<Pick<Playlist, "name" | "description" | "kind">>,
  ) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, track: Track) => void;
  removeFromPlaylist: (id: string, index: number) => void;
  moveInPlaylist: (id: string, from: number, to: number) => void;
  /** Replaces everything (backup restore). */
  replaceAll: (data: LibraryData) => void;
}

const LibraryContext = createContext<LibraryApi | null>(null);

function isTrack(value: unknown): value is Track {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Track).id === "string"
  );
}

function normalizePlaylist(value: unknown): Playlist | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<Playlist>;
  if (typeof raw.id !== "string" || !Array.isArray(raw.tracks)) return null;
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "Playlist",
    kind: raw.kind === "setlist" ? "setlist" : "playlist",
    description: typeof raw.description === "string" ? raw.description : "",
    tracks: raw.tracks.filter(isTrack).map(withSource),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
  };
}

export function normalizeLibrary(raw: unknown): LibraryData {
  const parsed = (
    typeof raw === "object" && raw !== null ? raw : {}
  ) as Partial<LibraryData>;
  return {
    liked: Array.isArray(parsed.liked)
      ? parsed.liked.filter(isTrack).map(withSource)
      : [],
    playlists: Array.isArray(parsed.playlists)
      ? parsed.playlists
          .map((item: unknown) => normalizePlaylist(item))
          .filter((item): item is Playlist => item !== null)
      : [],
  };
}

function load(): LibraryData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeLibrary(raw ? JSON.parse(raw) : {});
  } catch {
    return { liked: [], playlists: [] };
  }
}

/**
 * Imported tracks are kept as references: their cover (a data URL) and
 * metadata live with the file and are looked up when shown, so storing
 * them here would only waste the small localStorage quota.
 */
function slim(track: Track): Track {
  return track.source === "local" ? { ...track, cover: "" } : track;
}

function forStorage(data: LibraryData): LibraryData {
  return {
    liked: data.liked.map(slim),
    playlists: data.playlists.map((playlist) => ({
      ...playlist,
      tracks: playlist.tracks.map(slim),
    })),
  };
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LibraryData>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(forStorage(data)));
    } catch {
      // Storage full or blocked: the library lasts for this session only.
    }
  }, [data]);

  const api = useMemo<LibraryApi>(() => {
    const likedIds = new Set(data.liked.map((track) => track.id));
    const change = (id: string, update: (playlist: Playlist) => Playlist) =>
      setData((current) => ({
        ...current,
        playlists: current.playlists.map((playlist) =>
          playlist.id === id ? update(playlist) : playlist,
        ),
      }));

    return {
      ...data,
      isLiked: (trackId) => likedIds.has(trackId),
      toggleLike: (track) =>
        setData((current) => ({
          ...current,
          liked: current.liked.some((item) => item.id === track.id)
            ? current.liked.filter((item) => item.id !== track.id)
            : [track, ...current.liked],
        })),
      createPlaylist: (name, kind = "playlist") => {
        const sameKind = data.playlists.filter(
          (item) => item.kind === kind,
        ).length;
        const playlist: Playlist = {
          id: newId(),
          name:
            name.trim() ||
            (kind === "setlist"
              ? `Setlist nº ${sameKind + 1}`
              : `Minha playlist nº ${sameKind + 1}`),
          kind,
          description: "",
          tracks: [],
          createdAt: Date.now(),
        };
        setData((current) => ({
          ...current,
          playlists: [...current.playlists, playlist],
        }));
        return playlist;
      },
      updatePlaylist: (id, patch) =>
        change(id, (playlist) => ({
          ...playlist,
          ...patch,
          name: patch.name?.trim() ? patch.name.trim() : playlist.name,
        })),
      deletePlaylist: (id) =>
        setData((current) => ({
          ...current,
          playlists: current.playlists.filter((playlist) => playlist.id !== id),
        })),
      // Setlists may repeat a song (a reprise), plain playlists don't.
      addToPlaylist: (id, track) =>
        change(id, (playlist) =>
          playlist.kind !== "setlist" &&
          playlist.tracks.some((item) => item.id === track.id)
            ? playlist
            : { ...playlist, tracks: [...playlist.tracks, track] },
        ),
      removeFromPlaylist: (id, index) =>
        change(id, (playlist) => ({
          ...playlist,
          tracks: playlist.tracks.filter((_, i) => i !== index),
        })),
      moveInPlaylist: (id, from, to) =>
        change(id, (playlist) => {
          if (
            from === to ||
            from < 0 ||
            to < 0 ||
            from >= playlist.tracks.length ||
            to >= playlist.tracks.length
          ) {
            return playlist;
          }
          const tracks = [...playlist.tracks];
          const [moved] = tracks.splice(from, 1);
          tracks.splice(to, 0, moved!);
          return { ...playlist, tracks };
        }),
      replaceAll: (next) => setData(normalizeLibrary(next)),
    };
  }, [data]);

  return (
    <LibraryContext.Provider value={api}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryApi {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary must be used inside LibraryProvider");
  return value;
}
