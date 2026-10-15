import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../api/types";
import { useAnalysis } from "../ai/AnalysisContext";
import { useAnalyze } from "../ai/AnalyzeUi";
import {
  buildChart,
  chartToText,
  chordAt,
  chordRow,
  type ChartLine,
} from "../ai/chart";
import { transposeChord, type ChordSegment } from "../ai/harmony";
import { Cover } from "../components/Cover";
import {
  GuitarIcon,
  PauseIcon,
  PlayIcon,
  SparkIcon,
} from "../components/Icons";
import { Empty, Loading } from "../components/Status";
import { ArtistLink } from "../components/TrackList";
import { useToast } from "../components/Toast";
import { useLocal } from "../local/LocalContext";
import { activeLine } from "../lyrics/lrc";
import { useTrackLyrics } from "../lyrics/LyricsContext";
import { usePlayer } from "../player/PlayerContext";
import { useKnownTrack } from "./TrackDetail";

function download(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Current/next chord, refreshed every frame while the song plays. */
export function useChordNow(
  chords: ChordSegment[],
  getTime: (() => number) | null,
) {
  const [now, setNow] = useState(() => chordAt(chords, getTime?.() ?? 0));
  useEffect(() => {
    if (!getTime) return;
    let frame = 0;
    let last = "";
    const tick = () => {
      const value = chordAt(chords, getTime());
      const signature = `${value.current}|${value.next}|${Math.ceil(value.nextIn ?? 0)}`;
      if (signature !== last) {
        last = signature;
        setNow(value);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chords, getTime]);
  return now;
}

export function ChordNow({
  chords,
  getTime,
  transpose,
}: {
  chords: ChordSegment[];
  getTime: (() => number) | null;
  transpose: number;
}) {
  const now = useChordNow(chords, getTime);
  if (!now.current && !now.next) return null;
  return (
    <div className="chord-now" aria-live="off">
      <span className="chord-now-current">
        <small>Agora</small>
        {now.current ? transposeChord(now.current, transpose) : "—"}
      </span>
      {now.next && (
        <span className="chord-now-next">
          <small>
            Próximo
            {now.nextIn !== null && now.nextIn < 10
              ? ` em ${Math.ceil(now.nextIn)} s`
              : ""}
          </small>
          {transposeChord(now.next, transpose)}
        </span>
      )}
    </div>
  );
}

/** The chart; highlights and follows the current line when `getTime` is given. */
export function ChartView({
  chart,
  getTime,
  variant = "page",
}: {
  chart: ChartLine[];
  getTime: (() => number) | null;
  variant?: "page" | "stage";
}) {
  const [current, setCurrent] = useState(-1);
  const container = useRef<HTMLDivElement>(null);
  const times = useMemo(
    () => chart.map((line) => ({ time: line.time, text: line.text })),
    [chart],
  );

  useEffect(() => {
    if (!getTime) return;
    let frame = 0;
    let last = -2;
    const tick = () => {
      const index = activeLine(times, getTime());
      if (index !== last) {
        last = index;
        setCurrent(index);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [times, getTime]);

  useEffect(() => {
    const element = container.current?.querySelector<HTMLElement>(
      `[data-line="${current}"]`,
    );
    const box = container.current;
    if (!element || !box || current < 0) return;
    box.scrollTo({
      top: Math.max(0, element.offsetTop - box.clientHeight / 3),
      behavior: "smooth",
    });
  }, [current]);

  return (
    <div
      className={`chart chart-${variant}`}
      ref={container}
      data-testid="chart"
    >
      {chart.map((line, index) => (
        <div
          key={`${line.time}-${index}`}
          data-line={index}
          className={`chart-line ${index === current ? "is-active" : ""} ${line.label ? "is-label" : ""}`}
        >
          {line.label ? (
            <p>
              <span className="chart-label">{line.label}</span>
              {line.chords.map((chord, k) => (
                <span key={k} className="chart-chord">
                  {chord.chord}
                </span>
              ))}
            </p>
          ) : (
            <>
              {line.chords.length > 0 && (
                <pre className="chart-chords">{chordRow(line)}</pre>
              )}
              <pre className="chart-text">{line.text}</pre>
            </>
          )}
        </div>
      ))}
      <div className="lyrics-end" aria-hidden="true" />
    </div>
  );
}

export function CifraPage({ id }: { id: string }) {
  const track = useKnownTrack(id);
  if (!track) return <Empty>Música não encontrada.</Empty>;
  return <Cifra key={track.id} track={track} />;
}

function Cifra({ track }: { track: Track }) {
  const player = usePlayer();
  const local = useLocal();
  const analysis = useAnalysis(track.id);
  const lyrics = useTrackLyrics(track, false);
  const analyze = useAnalyze();
  const toast = useToast();
  const [transpose, setTranspose] = useState(0);
  const isCurrent = player.track?.id === track.id;
  const info = local.info(track.id);
  const chart = useMemo(
    () =>
      analysis ? buildChart(lyrics.lines, analysis.chords, transpose) : [],
    [analysis, lyrics.lines, transpose],
  );

  if (analysis === null && lyrics.status === "loading") return <Loading />;
  const key = analysis ? transposeChord(analysis.key, transpose) : "";
  const bpm = info?.bpm ?? analysis?.bpm ?? null;

  return (
    <div className="page cifra-page">
      <header className="lyrics-header">
        <Cover src={track.cover} alt="" />
        <div className="lyrics-header-text">
          <strong>{track.title}</strong>
          <ArtistLink track={track} className="lyrics-header-artist" />
        </div>
        <button
          type="button"
          className="play-fab"
          aria-label={isCurrent && player.playing ? "Pausar" : "Tocar"}
          onClick={() =>
            isCurrent ? player.togglePlay() : player.playList([track], 0)
          }
        >
          {isCurrent && player.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </header>

      {!analysis ? (
        <div className="lyrics-empty">
          <GuitarIcon size={40} />
          <h2>Ainda sem cifra</h2>
          <p>
            A IA ouve a música e descobre os acordes, o tom e o BPM. Com a letra
            sincronizada, os acordes aparecem em cima das palavras.
          </p>
          <button
            type="button"
            className="button-primary"
            onClick={() => analyze(track)}
          >
            <SparkIcon size={18} /> Analisar com IA
          </button>
        </div>
      ) : (
        <>
          <div className="cifra-bar">
            <span className="cifra-fact">
              <small>Tom</small>
              {key}
              {transpose !== 0 && <em> (original {analysis.key})</em>}
            </span>
            {bpm && (
              <span className="cifra-fact">
                <small>BPM</small>
                {bpm}
              </span>
            )}
            <span className="lyrics-size" role="group" aria-label="Transpor">
              <button
                type="button"
                className="icon-button"
                aria-label="Meio tom abaixo"
                onClick={() => setTranspose((value) => value - 1)}
              >
                −½
              </button>
              <span className="lyrics-offset-value">
                {transpose === 0
                  ? "tom original"
                  : `${transpose > 0 ? "+" : ""}${transpose / 2} tom`}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Meio tom acima"
                onClick={() => setTranspose((value) => value + 1)}
              >
                +½
              </button>
            </span>
            <span className="spacer" />
            <button
              type="button"
              className="button-outline button-small"
              onClick={() => {
                download(
                  `${track.title.replace(/[\\/:*?"<>|]+/g, "-")} (cifra).txt`,
                  chartToText(chart, {
                    title: track.title,
                    artist: track.artist,
                    key,
                    bpm,
                  }),
                );
                toast("Cifra exportada");
              }}
            >
              Exportar .txt
            </button>
            <button
              type="button"
              className="button-text"
              onClick={() => analyze(track)}
            >
              Analisar de novo
            </button>
          </div>
          {isCurrent && (
            <ChordNow
              chords={analysis.chords}
              getTime={player.getTime}
              transpose={transpose}
            />
          )}
          {lyrics.lines.length === 0 && (
            <p className="lyrics-notice">
              Sem letra sincronizada: mostrando só a sequência de acordes.
              Sincronize a letra (ou use a IA) para ver os acordes em cima das
              palavras.
            </p>
          )}
          <ChartView
            chart={chart}
            getTime={isCurrent ? player.getTime : null}
          />
          <p className="lyrics-source">
            Acordes reconhecidos pela IA: confira de ouvido, ela simplifica para
            acordes maiores e menores.
          </p>
        </>
      )}
    </div>
  );
}
