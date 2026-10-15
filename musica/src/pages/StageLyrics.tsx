import { useCallback, useMemo, useState } from "react";
import { isLocal, type Track } from "../api/types";
import { useLocal } from "../local/LocalContext";
import { useTrackLyrics } from "../lyrics/LyricsContext";
import { LyricsView } from "../lyrics/LyricsView";
import { usePlayer } from "../player/PlayerContext";
import { useAnalysis } from "../ai/AnalysisContext";
import { buildChart } from "../ai/chart";
import { ChartView, ChordNow } from "./Cifra";
import type * as S from "../show/session";

function usePreference(
  key: string,
  initial: boolean,
): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : stored === "1";
    } catch {
      return initial;
    }
  });
  const update = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // Only a preference.
    }
  };
  return [value, update];
}

/**
 * Teleprompter. In playback shows the lyrics follow the audio; live, a
 * synced text can follow the song's stopwatch (a band rarely matches the
 * recording exactly, so this can be turned off).
 */
export function StageLyrics({
  session,
  entry,
}: {
  session: S.ShowSession;
  entry: S.ShowEntry;
}) {
  const player = usePlayer();
  const local = useLocal();
  const [show, setShow] = usePreference("sonora.stageLyrics", true);
  const [follow, setFollow] = usePreference("sonora.stageLyricsFollow", true);
  const track = useMemo<Track>(
    () =>
      local.resolve({
        id: entry.trackId,
        source: isLocal({ id: entry.trackId }) ? "local" : "jamendo",
        title: entry.title,
        artist: entry.artist,
        artistId: "",
        album: "",
        albumId: "",
        cover: "",
        audioUrl: "",
        duration: entry.plannedSeconds,
        licenseUrl: "",
      }),
    // A new song on stage means a new lookup; edits to the record don't.
    [entry.trackId, entry.title],
  );
  const lyrics = useTrackLyrics(show ? track : null);
  const playing =
    session.mode === "playback" && player.track?.id === entry.trackId;
  const startedAt = entry.startedAt;
  // Stable so the lyrics view doesn't restart its frame loop every tick.
  const songClock = useCallback(
    () => (Date.now() - startedAt) / 1000,
    [startedAt],
  );
  const getTime = playing ? player.getTime : follow ? songClock : null;
  const analysis = useAnalysis(entry.trackId);
  const [cifra, setCifra] = usePreference("sonora.stageCifra", true);
  const chart = useMemo(
    () =>
      analysis && cifra ? buildChart(lyrics.lines, analysis.chords) : null,
    [analysis, cifra, lyrics.lines],
  );

  return (
    <div className="stage-lyrics">
      <div className="stage-lyrics-bar">
        <button
          type="button"
          className={`chip-button ${show ? "is-active" : ""}`}
          aria-pressed={show}
          onClick={() => setShow(!show)}
        >
          Letra
        </button>
        {analysis && (
          <button
            type="button"
            className={`chip-button ${cifra ? "is-active" : ""}`}
            aria-pressed={cifra}
            onClick={() => setCifra(!cifra)}
          >
            Cifra
          </button>
        )}
        {show && !playing && lyrics.lines.length > 0 && (
          <button
            type="button"
            className={`chip-button ${follow ? "is-active" : ""}`}
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
            title="Destacar as linhas pelo tempo desde o início da música"
          >
            Rolar com o tempo
          </button>
        )}
      </div>
      {analysis && cifra && (
        <ChordNow chords={analysis.chords} getTime={getTime} transpose={0} />
      )}
      {show && chart && chart.length > 0 ? (
        <ChartView
          key={entry.startedAt}
          chart={chart}
          getTime={getTime}
          variant="stage"
        />
      ) : (
        show &&
        (lyrics.record && lyrics.plain ? (
          <LyricsView
            key={entry.startedAt}
            lines={lyrics.lines}
            plain={lyrics.plain}
            offsetMs={lyrics.offsetMs}
            getTime={getTime}
            variant="stage"
            follow={getTime !== null}
          />
        ) : (
          <p className="field-hint">
            {lyrics.status === "loading" || lyrics.status === "searching"
              ? "Procurando a letra…"
              : "Sem letra para esta música. Adicione pelo menu ⋯ → Letra."}
          </p>
        ))
      )}
    </div>
  );
}
