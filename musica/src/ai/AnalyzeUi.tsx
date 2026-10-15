import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Track } from "../api/types";
import { AnalyzeDialog } from "./AnalyzeDialog";

const AnalyzeContext = createContext<(track: Track) => void>(() => {});

/** Lets menus and pages open the AI analysis without passing state around. */
export function AnalyzeUiProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<Track | null>(null);
  const open = useCallback((next: Track) => setTrack(next), []);
  return (
    <AnalyzeContext.Provider value={open}>
      {children}
      {track && (
        <AnalyzeDialog
          key={track.id}
          track={track}
          onClose={() => setTrack(null)}
        />
      )}
    </AnalyzeContext.Provider>
  );
}

export function useAnalyze(): (track: Track) => void {
  return useContext(AnalyzeContext);
}
