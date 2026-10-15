import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Track } from "../api/types";
import { LyricsEditor } from "./LyricsEditor";

type Open = (track: Track, tab?: "search" | "write") => void;

const LyricsUiContext = createContext<Open>(() => {});

/** Lets menus and pages open the lyrics editor without passing state around. */
export function LyricsUiProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState<{
    track: Track;
    tab: "search" | "write";
  } | null>(null);
  const open = useCallback<Open>(
    (track, tab = "search") => setEditing({ track, tab }),
    [],
  );
  return (
    <LyricsUiContext.Provider value={open}>
      {children}
      {editing && (
        <LyricsEditor
          track={editing.track}
          initialTab={editing.tab}
          onClose={() => setEditing(null)}
        />
      )}
    </LyricsUiContext.Provider>
  );
}

export function useLyricsEditor(): Open {
  return useContext(LyricsUiContext);
}
