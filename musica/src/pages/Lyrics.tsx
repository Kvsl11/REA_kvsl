import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../api/types";
import { Cover } from "../components/Cover";
import {
  EditIcon,
  GuitarIcon,
  LyricsIcon,
  SparkIcon,
  SyncIcon,
} from "../components/Icons";
import { useAnalyze } from "../ai/AnalyzeUi";
import { Empty, Loading } from "../components/Status";
import { useToast } from "../components/Toast";
import { formatTime } from "../format";
import { linesForSync, toLrc } from "../lyrics/lrc";
import {
  useLyricsStore,
  useTrackLyrics,
  type TrackLyrics,
} from "../lyrics/LyricsContext";
import { useLyricsEditor } from "../lyrics/LyricsUi";
import { LyricsView } from "../lyrics/LyricsView";
import { usePlayer } from "../player/PlayerContext";
import { Link, navigate } from "../router/router";
import { ArtistLink } from "../components/TrackList";
import { useKnownTrack } from "./TrackDetail";

const SIZE_KEY = "sonora.lyricsSize";

/** "1:05.3" — tenths matter when syncing lines. */
function preciseTime(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  const secs = String(Math.floor((tenths % 600) / 10)).padStart(2, "0");
  return `${minutes}:${secs}.${tenths % 10}`;
}
const SIZES = ["small", "medium", "large"] as const;

function readSize(): (typeof SIZES)[number] {
  try {
    const stored = localStorage.getItem(SIZE_KEY);
    return SIZES.find((size) => size === stored) ?? "medium";
  } catch {
    return "medium";
  }
}

function sourceLabel(lyrics: TrackLyrics): string {
  switch (lyrics.record?.source) {
    case "lrclib":
      return "Letra: LRCLIB";
    case "sincronizada":
      return "Sincronizada por você";
    case "arquivo":
      return "Letra importada de arquivo";
    case "manual":
      return "Letra adicionada por você";
    case "ia":
      return "Sincronizada pela IA — toque numa linha fora do tempo para conferir";
    default:
      return "";
  }
}

/** Shown when a track has no lyrics (yet). */
export function LyricsMissing({
  track,
  lyrics,
}: {
  track: Track;
  lyrics: TrackLyrics;
}) {
  const store = useLyricsStore();
  const openEditor = useLyricsEditor();
  const analyze = useAnalyze();
  return (
    <div className="lyrics-empty">
      <LyricsIcon size={40} />
      <h2>
        {lyrics.status === "error"
          ? "Não deu para buscar a letra agora"
          : "Não encontramos a letra desta música"}
      </h2>
      <p>
        {lyrics.error ??
          "Você pode buscar com outro nome, colar a letra ou importar um arquivo .lrc."}
      </p>
      <div className="button-row">
        <button
          type="button"
          className="button-primary"
          onClick={() => openEditor(track, "search")}
        >
          Buscar letra
        </button>
        <button
          type="button"
          className="button-outline"
          onClick={() => openEditor(track, "write")}
        >
          Colar ou importar
        </button>
        <button
          type="button"
          className="button-outline"
          onClick={() => analyze(track)}
        >
          <SparkIcon size={16} /> Reconhecer com IA
        </button>
        <button
          type="button"
          className="button-text"
          onClick={() => store.lookup(track)}
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}

export function LyricsPage() {
  const player = usePlayer();
  const track = player.track;
  if (!track) {
    return (
      <div className="page">
        <Empty>
          Toque uma música para ver a letra.{" "}
          <Link to="/" className="strong-link">
            Ir para o início
          </Link>
        </Empty>
      </div>
    );
  }
  return <TrackLyricsPage key={track.id} track={track} />;
}

function TrackLyricsPage({ track }: { track: Track }) {
  const player = usePlayer();
  const store = useLyricsStore();
  const lyrics = useTrackLyrics(track);
  const openEditor = useLyricsEditor();
  const [size, setSize] = useState(readSize);
  const synced = lyrics.lines.length > 0;
  const userOffset = lyrics.record?.offsetMs ?? 0;

  useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, size);
    } catch {
      // Only a preference.
    }
  }, [size]);

  const nudge = (ms: number) => void store.setOffset(track.id, userOffset + ms);

  return (
    <div className={`lyrics-page lyrics-size-${size}`}>
      <header className="lyrics-header">
        <Cover src={track.cover} alt="" />
        <div className="lyrics-header-text">
          <strong>{track.title}</strong>
          <ArtistLink track={track} className="lyrics-header-artist" />
        </div>
        <div className="lyrics-tools">
          {synced && (
            <span
              className="lyrics-offset"
              role="group"
              aria-label="Ajustar sincronia"
            >
              <button
                type="button"
                className="icon-button"
                aria-label="Letra mais cedo"
                title="Letra aparece mais cedo"
                onClick={() => nudge(250)}
              >
                −
              </button>
              <span className="lyrics-offset-value" title="Ajuste de sincronia">
                {userOffset === 0
                  ? "sincronia"
                  : `${userOffset > 0 ? "−" : "+"}${(Math.abs(userOffset) / 1000).toFixed(2).replace(".", ",")} s`}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Letra mais tarde"
                title="Letra aparece mais tarde"
                onClick={() => nudge(-250)}
              >
                +
              </button>
            </span>
          )}
          <span
            className="lyrics-size"
            role="group"
            aria-label="Tamanho do texto"
          >
            <button
              type="button"
              className="icon-button"
              aria-label="Texto menor"
              disabled={size === "small"}
              onClick={() =>
                setSize(SIZES[Math.max(0, SIZES.indexOf(size) - 1)]!)
              }
            >
              A−
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Texto maior"
              disabled={size === "large"}
              onClick={() =>
                setSize(
                  SIZES[Math.min(SIZES.length - 1, SIZES.indexOf(size) + 1)]!,
                )
              }
            >
              A+
            </button>
          </span>
          {lyrics.record && !lyrics.record.instrumental && (
            <button
              type="button"
              className="button-outline button-small"
              onClick={() =>
                navigate(`/letra/sincronizar/${encodeURIComponent(track.id)}`)
              }
            >
              <SyncIcon size={16} /> {synced ? "Ressincronizar" : "Sincronizar"}
            </button>
          )}
          <button
            type="button"
            className="button-outline button-small"
            onClick={() => navigate(`/cifra/${encodeURIComponent(track.id)}`)}
          >
            <GuitarIcon size={16} /> Cifra
          </button>
          <button
            type="button"
            className="button-outline button-small"
            onClick={() =>
              openEditor(track, lyrics.record ? "write" : "search")
            }
          >
            <EditIcon size={16} /> {lyrics.record ? "Editar" : "Buscar letra"}
          </button>
        </div>
      </header>

      {lyrics.status === "loading" ||
      (lyrics.status === "searching" && !lyrics.record) ? (
        <Loading label="Procurando a letra…" />
      ) : !lyrics.record ? (
        <LyricsMissing track={track} lyrics={lyrics} />
      ) : lyrics.record.instrumental && !lyrics.plain ? (
        <div className="lyrics-empty">
          <LyricsIcon size={40} />
          <h2>Música instrumental ♪</h2>
        </div>
      ) : (
        <>
          {!synced && (
            <p className="lyrics-notice">
              Esta letra não está sincronizada.{" "}
              <button
                type="button"
                className="button-text"
                onClick={() =>
                  navigate(`/letra/sincronizar/${encodeURIComponent(track.id)}`)
                }
              >
                Sincronizar agora
              </button>
            </p>
          )}
          <LyricsView
            lines={lyrics.lines}
            plain={lyrics.plain}
            offsetMs={lyrics.offsetMs}
            getTime={player.getTime}
            onSeek={(seconds) => {
              player.seek(seconds);
              if (!player.playing) player.togglePlay();
            }}
          />
          <p className="lyrics-source">{sourceLabel(lyrics)}</p>
        </>
      )}
    </div>
  );
}

export function LyricsSyncPage({ id }: { id: string }) {
  const track = useKnownTrack(id);
  if (!track) return <Empty>Música não encontrada.</Empty>;
  return <SyncTool key={track.id} track={track} />;
}

/**
 * Tap-to-sync: play the song and tap "Marcar" as each line starts.
 * Space/Enter/↓ marks, Backspace/↑ undoes (and jumps back a little).
 */
function SyncTool({ track }: { track: Track }) {
  const player = usePlayer();
  const store = useLyricsStore();
  const lyrics = useTrackLyrics(track, false);
  const openEditor = useLyricsEditor();
  const toast = useToast();
  const source = lyrics.record?.plain || "";
  const texts = useMemo(() => linesForSync(source), [source]);
  const [times, setTimes] = useState<(number | null)[]>([]);
  const cursor = times.findIndex((time) => time === null);
  const done = texts.length > 0 && cursor === -1;
  const listRef = useRef<HTMLOListElement>(null);
  const isCurrent = player.track?.id === track.id;

  useEffect(() => {
    setTimes(texts.map(() => null));
  }, [texts]);

  const start = () => {
    setTimes(texts.map(() => null));
    if (isCurrent) {
      player.seek(0);
      if (!player.playing) player.togglePlay();
    } else {
      player.playList([track], 0);
    }
  };

  const mark = () => {
    if (cursor < 0 || !isCurrent) return;
    const now = player.getTime();
    setTimes((list) =>
      list.map((time, index) => (index === cursor ? now : time)),
    );
  };

  const undo = () => {
    const last = cursor === -1 ? times.length - 1 : cursor - 1;
    if (last < 0) return;
    setTimes((list) =>
      list.map((time, index) => (index === last ? null : time)),
    );
    const previous = last > 0 ? times[last - 1] : 0;
    player.seek(Math.max(0, (previous ?? 0) - 1));
  };

  const nudgeLine = (index: number, delta: number) =>
    setTimes((list) =>
      list.map((time, i) =>
        i === index && time !== null ? Math.max(0, time + delta) : time,
      ),
    );

  // Keys in the capture phase so space doesn't also toggle playback.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (
        event.code === "Space" ||
        event.key === "Enter" ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) mark();
      } else if (event.key === "Backspace" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        undo();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>(".sync-line.is-cursor");
    if (list && active) {
      list.scrollTo({
        top: active.offsetTop - list.clientHeight / 3,
        behavior: "smooth",
      });
    }
  }, [cursor]);

  const save = async () => {
    const lines = texts.map((text, index) => ({
      text,
      time: times[index] ?? 0,
    }));
    await store.save(track.id, {
      synced: toLrc(lines, { title: track.title, artist: track.artist }),
      plain: source,
      source: "sincronizada",
      offsetMs: 0,
    });
    toast("Letra sincronizada!");
    navigate("/letra", { replace: true });
  };

  if (lyrics.status === "loading") return <Loading />;
  if (texts.length === 0) {
    return (
      <div className="page">
        <h1 className="page-title">Sincronizar letra</h1>
        <Empty>
          Primeiro adicione a letra desta música.{" "}
          <button
            type="button"
            className="button-text"
            onClick={() => openEditor(track, "search")}
          >
            Buscar ou colar a letra
          </button>
        </Empty>
      </div>
    );
  }

  const marked = times.filter((time) => time !== null).length;

  return (
    <div className="page sync-page">
      <h1 className="page-title">Sincronizar: {track.title}</h1>
      <p className="field-hint">
        Toque a música e aperte <strong>Marcar</strong> (ou a barra de espaço)
        no instante em que cada linha começa a ser cantada. Errou?{" "}
        <strong>Desfazer</strong> (ou ↑) volta uma linha e recua a música um
        pouco.
      </p>
      <div className="sync-bar">
        <button type="button" className="button-outline" onClick={start}>
          {marked > 0 ? "Recomeçar do início" : "Tocar do início"}
        </button>
        <span className="sync-progress">
          {marked}/{texts.length} linhas •{" "}
          {formatTime(isCurrent ? player.position : 0)}
        </span>
      </div>
      <ol className="sync-lines" ref={listRef}>
        {texts.map((text, index) => (
          <li
            key={index}
            className={`sync-line ${index === cursor ? "is-cursor" : ""} ${
              times[index] !== null && times[index] !== undefined
                ? "is-marked"
                : ""
            }`}
          >
            <span className="sync-time">
              {times[index] != null ? preciseTime(times[index]!) : "—"}
            </span>
            <span className="sync-text">{text}</span>
            {times[index] != null && (
              <span className="sync-nudge">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Linha ${index + 1} mais cedo`}
                  onClick={() => nudgeLine(index, -0.1)}
                >
                  −
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Linha ${index + 1} mais tarde`}
                  onClick={() => nudgeLine(index, 0.1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="button-text"
                  onClick={() => player.seek(Math.max(0, times[index]! - 1))}
                >
                  ouvir
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="sync-actions">
        <button
          type="button"
          className="live-button"
          onClick={undo}
          disabled={marked === 0}
        >
          Desfazer
        </button>
        {done ? (
          <button
            type="button"
            className="live-button is-primary"
            onClick={() => void save()}
          >
            Salvar sincronia
          </button>
        ) : (
          <button
            type="button"
            className="live-button is-primary"
            onClick={mark}
            disabled={!isCurrent || !player.playing}
          >
            {!isCurrent || (!player.playing && marked === 0)
              ? "Toque a música para começar"
              : `Marcar: ${texts[cursor] ?? ""}`}
          </button>
        )}
      </div>
    </div>
  );
}
