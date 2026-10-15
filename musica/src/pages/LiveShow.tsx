import { useEffect, useState } from "react";
import {
  CheckIcon,
  CoffeeIcon,
  MicIcon,
  NextIcon,
  StopIcon,
} from "../components/Icons";
import { Empty } from "../components/Status";
import {
  formatClock,
  formatDiff,
  formatTime,
  formatTimeOfDay,
} from "../format";
import { useLocal, type TrackInfo } from "../local/LocalContext";
import { Link, navigate } from "../router/router";
import { useShow } from "../show/ShowContext";
import * as S from "../show/session";
import { useNow } from "../useNow";

/** Keeps the phone screen on during the show, where supported. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      navigator.wakeLock.request("screen").then(
        (sentinel) => {
          if (cancelled) void sentinel.release();
          else lock = sentinel;
        },
        () => {
          // Denied (battery saver, unsupported context): the show still records.
        },
      );
    };
    acquire();
    // The lock is dropped when the tab is hidden; take it back on return.
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, [active]);
}

/** Stage shortcuts: → or N for the next song, B for a break. */
function useStageShortcuts(active: boolean) {
  const show = useShow();
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "n") {
        event.preventDefault();
        show.next();
      } else if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        show.toggleBreak();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, show]);
}

function Metronome({ bpm }: { bpm: number }) {
  return (
    <span
      className="metronome"
      style={{ animationDuration: `${60 / bpm}s` }}
      title={`${bpm} batidas por minuto`}
      aria-hidden="true"
    />
  );
}

function LiveHeader({
  session,
  summary,
  onBreak,
}: {
  session: S.ShowSession;
  summary: S.ShowSummary;
  onBreak: boolean;
}) {
  const remaining = summary.skipped.reduce(
    (sum, song) => sum + song.seconds,
    0,
  );
  return (
    <>
      <header className="live-header">
        <div>
          <span className={`live-status ${onBreak ? "is-break" : ""}`}>
            <span className="rec-dot" aria-hidden="true" />
            {onBreak ? "Intervalo" : "Gravando"}
          </span>
          <h1>{session.name}</h1>
          <p className="live-meta">
            {session.venue && `${session.venue} • `}
            começou às {formatTimeOfDay(session.startedAt)} •{" "}
            {session.mode === "live" ? "ao vivo" : "tocando pelo app"}
          </p>
        </div>
        <div className="live-total" aria-label="Duração do show">
          <span className="live-total-time">
            {formatClock(summary.totalSeconds)}
          </span>
          <span className="live-total-label">duração do show</span>
        </div>
      </header>
      <div className="live-stats">
        <span>
          <strong>
            {summary.playedFromSetlist}/{summary.plannedCount}
          </strong>{" "}
          músicas
        </span>
        <span>
          <strong>{formatClock(summary.musicSeconds)}</strong> de música
        </span>
        <span>
          <strong>{formatClock(summary.breakSeconds)}</strong> de intervalo
        </span>
        {remaining > 0 && (
          <span>
            <strong>~{formatClock(remaining)}</strong> previstos pela frente
          </span>
        )}
      </div>
    </>
  );
}

function StageInfo({ info }: { info: TrackInfo | undefined }) {
  if (!info || !(info.key || info.bpm || info.notes)) return null;
  return (
    <div className="live-stage">
      {info.key && (
        <span className="live-stage-item">
          <small>Tom</small>
          {info.key}
        </span>
      )}
      {info.bpm && (
        <span className="live-stage-item">
          <small>BPM</small>
          <span>
            <Metronome bpm={info.bpm} /> {info.bpm}
          </span>
        </span>
      )}
      {info.notes && <p className="live-notes">{info.notes}</p>}
    </div>
  );
}

/** The big panel: the song on stage, the break, or what comes first. */
function NowPanel({
  session,
  now,
  next,
}: {
  session: S.ShowSession;
  now: number;
  next: S.PlannedSong | undefined;
}) {
  const local = useLocal();
  const entry = S.currentEntry(session);
  const pause = S.currentBreak(session);
  const songSeconds = entry ? (now - entry.startedAt) / 1000 : 0;
  const over =
    !!entry && entry.plannedSeconds > 0 && songSeconds > entry.plannedSeconds;

  if (pause) {
    return (
      <section className="live-now is-break">
        <span className="live-kicker">
          <CoffeeIcon size={18} /> Intervalo
        </span>
        <div className="live-song-time">
          {formatClock((now - pause.startedAt) / 1000)}
        </div>
        {next && <p className="live-next-inline">Na volta: {next.title}</p>}
      </section>
    );
  }

  if (!entry) {
    return (
      <section className="live-now">
        <span className="live-kicker">
          {session.entries.length === 0
            ? "Pronto para começar"
            : "Entre músicas"}
        </span>
        {next ? (
          <>
            <h2 className="live-title">{next.title}</h2>
            <p className="live-artist">é a próxima do setlist</p>
          </>
        ) : (
          <h2 className="live-title">Setlist completo!</h2>
        )}
      </section>
    );
  }

  return (
    <section className={`live-now ${over ? "is-over" : ""}`}>
      <span className="live-kicker">
        Tocando agora
        {entry.plannedIndex >= 0
          ? ` • nº ${entry.plannedIndex + 1}`
          : " • extra"}
      </span>
      <h2 className="live-title">{entry.title}</h2>
      <p className="live-artist">{entry.artist}</p>
      <div className="live-song-time">
        {formatClock(songSeconds)}
        {entry.plannedSeconds > 0 && (
          <small> / {formatTime(entry.plannedSeconds)}</small>
        )}
      </div>
      {entry.plannedSeconds > 0 && (
        <div className="live-progress" aria-hidden="true">
          <div
            style={{
              width: `${Math.min(100, (songSeconds / entry.plannedSeconds) * 100)}%`,
            }}
          />
        </div>
      )}
      {over && (
        <p className="live-over">
          {formatDiff(songSeconds - entry.plannedSeconds)} além do previsto
        </p>
      )}
      <StageInfo info={local.info(entry.trackId)} />
    </section>
  );
}

function LiveControls({
  session,
  next,
  onEnd,
}: {
  session: S.ShowSession;
  next: S.PlannedSong | undefined;
  onEnd: () => void;
}) {
  const show = useShow();
  const entry = S.currentEntry(session);
  const pause = S.currentBreak(session);
  const primaryLabel = next
    ? entry
      ? "Próxima música"
      : `Começar: ${next.title}`
    : "Terminar última música";
  return (
    <div className="live-controls">
      {pause ? (
        <button
          type="button"
          className="live-button is-primary"
          onClick={show.toggleBreak}
        >
          <MicIcon /> Voltar do intervalo
        </button>
      ) : (
        <button
          type="button"
          className="live-button is-primary"
          onClick={show.next}
          disabled={!next && !entry}
        >
          <NextIcon />
          {primaryLabel}
        </button>
      )}
      {!pause && entry && (
        <button type="button" className="live-button" onClick={show.finishSong}>
          <CheckIcon /> Música terminou
        </button>
      )}
      {!pause && (
        <button
          type="button"
          className="live-button"
          onClick={show.toggleBreak}
        >
          <CoffeeIcon /> Intervalo
        </button>
      )}
      <button type="button" className="live-button is-danger" onClick={onEnd}>
        <StopIcon /> Encerrar show
      </button>
    </div>
  );
}

function LiveSetlist({
  session,
  summary,
  nextIndex,
}: {
  session: S.ShowSession;
  summary: S.ShowSummary;
  nextIndex: number;
}) {
  const show = useShow();
  const local = useLocal();
  const entry = S.currentEntry(session);
  const played = new Set(session.entries.map((item) => item.plannedIndex));
  return (
    <section className="section">
      <h2>Setlist</h2>
      <ol className="live-setlist">
        {session.planned.map((song, index) => {
          const isNow = entry?.plannedIndex === index;
          const done = played.has(index) && !isNow;
          const last = summary.entries.findLast(
            (item) => item.plannedIndex === index,
          );
          const songInfo = local.info(song.trackId);
          const classes = [
            isNow ? "is-now" : "",
            done ? "is-done" : "",
            index === nextIndex && !isNow ? "is-next" : "",
          ].join(" ");
          return (
            <li key={`${song.trackId}-${index}`} className={classes}>
              <button
                type="button"
                className="live-setlist-button"
                onClick={() => show.playPlanned(index)}
                aria-label={`Começar ${song.title}`}
              >
                <span className="live-setlist-pos">
                  {done ? <CheckIcon size={16} /> : index + 1}
                </span>
                <span className="live-setlist-text">
                  <strong>{song.title}</strong>
                  <span>
                    {song.artist}
                    {songInfo?.key && ` • ${songInfo.key}`}
                    {songInfo?.bpm && ` • ${songInfo.bpm} bpm`}
                  </span>
                </span>
                <span className="live-setlist-time">
                  {last
                    ? formatClock(last.actualSeconds)
                    : song.seconds > 0
                      ? formatTime(song.seconds)
                      : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {summary.extras > 0 && (
        <p className="field-hint">
          + {summary.extras} música(s) fora do setlist registradas.
        </p>
      )}
    </section>
  );
}

export function LiveShowPage() {
  const show = useShow();
  const local = useLocal();
  const session = show.active;
  const now = useNow(session ? 250 : null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  useWakeLock(session !== null);
  useStageShortcuts(session !== null);

  if (!session) {
    return (
      <div className="page">
        <Empty>
          Nenhum show sendo gravado agora.{" "}
          <Link to="/shows" className="strong-link">
            Escolha um setlist para começar
          </Link>
          .
        </Empty>
      </div>
    );
  }

  const summary = S.summarizeShow(session, now);
  const nextIndex = S.nextPlannedIndex(session);
  const next = nextIndex >= 0 ? session.planned[nextIndex] : undefined;
  const entry = S.currentEntry(session);
  const onBreak = S.currentBreak(session) !== null;
  const nextInfo = next ? local.info(next.trackId) : undefined;

  const finish = () => {
    const ended = show.end();
    setConfirmEnd(false);
    if (ended) navigate(`/show/${ended.id}`, { replace: true });
  };

  return (
    <div className="live-show">
      <LiveHeader session={session} summary={summary} onBreak={onBreak} />
      <NowPanel session={session} now={now} next={next} />

      {!onBreak && entry && next && (
        <p className="live-up-next">
          A seguir: <strong>{next.title}</strong>
          {nextInfo?.key && <span className="chip">{nextInfo.key}</span>}
          {nextInfo?.bpm && <span className="chip">{nextInfo.bpm} bpm</span>}
        </p>
      )}

      <LiveControls
        session={session}
        next={next}
        onEnd={() => setConfirmEnd(true)}
      />
      <p className="field-hint live-hint">
        Atalhos: → ou N = próxima música • B = intervalo. A tela fica acesa
        durante o show.
      </p>

      {confirmEnd && (
        <div
          className="live-confirm"
          role="alertdialog"
          aria-label="Encerrar show"
        >
          <p>Encerrar e salvar o show agora?</p>
          <div>
            <button
              type="button"
              className="button-outline"
              onClick={() => setConfirmEnd(false)}
            >
              Continuar gravando
            </button>
            <button
              type="button"
              className="button-primary button-danger-solid"
              onClick={finish}
            >
              Encerrar show
            </button>
          </div>
        </div>
      )}

      <LiveSetlist session={session} summary={summary} nextIndex={nextIndex} />
    </div>
  );
}
