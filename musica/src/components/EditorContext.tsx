import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Track } from "../api/types";
import { EditTrackDialog } from "./EditTrackDialog";

const EditorContext = createContext<(track: Track) => void>(() => {});

/** Lets any menu open the edit dialog without threading state through pages. */
export function EditorProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState<Track | null>(null);
  const open = useCallback((track: Track) => setEditing(track), []);
  return (
    <EditorContext.Provider value={open}>
      {children}
      {editing && (
        <EditTrackDialog track={editing} onClose={() => setEditing(null)} />
      )}
    </EditorContext.Provider>
  );
}

export function useEditor(): (track: Track) => void {
  return useContext(EditorContext);
}
