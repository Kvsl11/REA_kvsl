import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Track } from "../api/types";

const STORAGE_KEY = "sonora.library.v1";

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

interface LibraryData {
  liked: Track[];
  playlists: Playlist[];
}

interface LibraryApi extends LibraryData {
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => void;
  createPlaylist: (name: string) => Playlist;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, track: Track) => void;
  removeFromPlaylist: (id: string, trackId: string) => void;
}

const LibraryContext = createContext<LibraryApi | null>(null);

function load(): LibraryData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { liked: [], playlists: [] };
    const parsed = JSON.parse(raw) as Partial<LibraryData>;
    return {
      liked: Array.isArray(parsed.liked) ? parsed.liked : [],
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
    };
  } catch {
    return { liked: [], playlists: [] };
  }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked: the library lasts for this session only.
    }
  }, [data]);

  const api = useMemo<LibraryApi>(() => {
    const likedIds = new Set(data.liked.map((track) => track.id));
    const updatePlaylist = (
      id: string,
      change: (playlist: Playlist) => Playlist,
    ) =>
      setData((current) => ({
        ...current,
        playlists: current.playlists.map((playlist) =>
          playlist.id === id ? change(playlist) : playlist,
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
      createPlaylist: (name) => {
        const playlist: Playlist = {
          id: newId(),
          name: name.trim() || `Minha playlist nº ${data.playlists.length + 1}`,
          tracks: [],
          createdAt: Date.now(),
        };
        setData((current) => ({
          ...current,
          playlists: [...current.playlists, playlist],
        }));
        return playlist;
      },
      renamePlaylist: (id, name) => {
        if (name.trim() === "") return;
        updatePlaylist(id, (playlist) => ({ ...playlist, name: name.trim() }));
      },
      deletePlaylist: (id) =>
        setData((current) => ({
          ...current,
          playlists: current.playlists.filter((playlist) => playlist.id !== id),
        })),
      addToPlaylist: (id, track) =>
        updatePlaylist(id, (playlist) =>
          playlist.tracks.some((item) => item.id === track.id)
            ? playlist
            : { ...playlist, tracks: [...playlist.tracks, track] },
        ),
      removeFromPlaylist: (id, trackId) =>
        updatePlaylist(id, (playlist) => ({
          ...playlist,
          tracks: playlist.tracks.filter((item) => item.id !== trackId),
        })),
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
