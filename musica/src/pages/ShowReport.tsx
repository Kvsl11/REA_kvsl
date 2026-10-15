import { useState } from "react";
import { Empty, Loading } from "../components/Status";
import { useToast } from "../components/Toast";
import {
  formatClock,
  formatDateTime,
  formatDiff,
  formatDuration,
  formatTime,
  formatTimeOfDay,
} from "../format";
import { Link, navigate } from "../router/router";
import { useShow } from "../show/ShowContext";
import { showToCsv, summarizeShow, type ShowSession } from "../show/session";

function download(fileName: string, content: string, type: string) {
  // BOM so Excel reads the accents correctly.
  const blob = new Blob(["﻿", content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * File-system-safe ASCII name. Some browsers ignore a download name with
 * accents and fall back to "download", so "Zé" becomes "Ze" here (the
 * spreadsheet content keeps its accents).
 */
export function safeFileName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]+/g, "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim() || "show"
  );
}

export function ShowReportPage({ id }: { id: string }) {
  const show = useShow();
  const session = show.sessions.find((item) => item.id === id);
  if (!show.loaded) return <Loading />;
  if (!session) return <Empty>Show não encontrado.</Empty>;
  if (session.endedAt === null) {
    return (
      <div className="page">
        <Empty>
          Este show ainda está sendo gravado.{" "}
          <Link to="/show/ao-vivo" className="strong-link">
            Abrir o modo show
          </Link>
        </Empty>
      </div>
    );
  }
  // Keyed so the editable fields reset when another show is opened.
  return <ShowReport key={session.id} session={session} />;
}

function ShowReport({ session }: { session: ShowSession }) {
  const show = useShow();
  const toast = useToast();
  const [notes, setNotes] = useState(session.notes);
  const [name, setName] = useState(session.name);
  const [venue, setVenue] = useState(session.venue);
  const summary = summarizeShow(session, session.endedAt ?? Date.now());
  const plannedDiff =
    summary.plannedSeconds > 0
      ? summary.musicSeconds - summary.plannedSeconds
      : null;

  const saveMeta = () => {
    if (name.trim() !== session.name || venue.trim() !== session.venue) {
      show.update(session.id, {
        name: name.trim() || session.name,
        venue: venue.trim(),
      });
    }
  };

  return (
    <div className="page">
      <span className="collection-kind">Relatório do show</span>
      <input
        className="title-input"
        aria-label="Nome do show"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={saveMeta}
      />
      <div className="collection-meta report-meta">
        <input
          className="inline-input"
          aria-label="Local do show"
          placeholder="Adicionar local"
          value={venue}
          onChange={(event) => setVenue(event.target.value)}
          onBlur={saveMeta}
        />
        <span>
          {formatDateTime(session.startedAt)} até{" "}
          {formatTimeOfDay(session.endedAt!)} • setlist{" "}
          {session.setlistId ? (
            <Link to={`/playlist/${session.setlistId}`} className="strong-link">
              {session.setlistName}
            </Link>
          ) : (
            session.setlistName
          )}{" "}
          • {session.mode === "live" ? "ao vivo" : "tocado pelo app"}
        </span>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-value">
            {formatClock(summary.totalSeconds)}
          </span>
          <span className="stat-label">duração total</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {formatClock(summary.musicSeconds)}
          </span>
          <span className="stat-label">
            de música
            {plannedDiff !== null &&
              ` (${formatDiff(plannedDiff)} do previsto)`}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {formatClock(summary.breakSeconds)}
          </span>
          <span className="stat-label">
            {session.breaks.length === 1
              ? "1 intervalo"
              : `${session.breaks.length} intervalos`}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatClock(summary.gapSeconds)}</span>
          <span className="stat-label">entre músicas</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {summary.playedFromSetlist}/{summary.plannedCount}
          </span>
          <span className="stat-label">
            do setlist{summary.extras > 0 && ` + ${summary.extras} extra`}
          </span>
        </div>
      </div>

      <section className="section">
        <h2>Música por música</h2>
        {summary.entries.length === 0 ? (
          <Empty>Nenhuma música foi registrada neste show.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Música</th>
                  <th>Início</th>
                  <th>Tocou</th>
                  <th>Previsto</th>
                  <th>Diferença</th>
                </tr>
              </thead>
              <tbody>
                {summary.entries.map((entry, index) => (
                  <tr key={`${entry.trackId}-${entry.startedAt}`}>
                    <td>{index + 1}</td>
                    <td>
                      <Link
                        to={`/faixa/${encodeURIComponent(entry.trackId)}`}
                        className="strong-link"
                      >
                        {entry.title}
                      </Link>
                      <span className="cell-sub">
                        {entry.plannedIndex >= 0
                          ? `${entry.artist} • nº ${entry.plannedIndex + 1} do setlist`
                          : `${entry.artist} • fora do setlist`}
                      </span>
                    </td>
                    <td>
                      {formatTimeOfDay(entry.startedAt)}
                      <span className="cell-sub">
                        +{formatClock(entry.offsetSeconds)}
                      </span>
                    </td>
                    <td>{formatClock(entry.actualSeconds)}</td>
                    <td>
                      {entry.plannedSeconds > 0
                        ? formatTime(entry.plannedSeconds)
                        : "—"}
                    </td>
                    <td
                      className={
                        entry.diffSeconds !== null &&
                        Math.abs(entry.diffSeconds) >= 30
                          ? entry.diffSeconds > 0
                            ? "diff-over"
                            : "diff-under"
                          : ""
                      }
                    >
                      {entry.diffSeconds === null
                        ? "—"
                        : formatDiff(entry.diffSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {summary.longest && summary.entries.length > 1 && (
          <p className="field-hint">
            Música mais longa: {summary.longest.title} (
            {formatDuration(summary.longest.actualSeconds)}).
          </p>
        )}
      </section>

      {summary.skipped.length > 0 && (
        <section className="section">
          <h2>Não tocadas</h2>
          <ul className="plain-list">
            {summary.skipped.map((song) => (
              <li key={`${song.trackId}-${song.index}`}>
                nº {song.index + 1} • {song.title}
                {song.artist && (
                  <span className="cell-sub"> — {song.artist}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>Anotações</h2>
        <textarea
          className="notes-area"
          rows={4}
          placeholder="Como foi o show? Público, som, o que mudar no setlist…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes !== session.notes) {
              show.update(session.id, { notes });
              toast("Anotações salvas");
            }
          }}
        />
      </section>

      <div className="report-actions">
        <button
          type="button"
          className="button-primary"
          onClick={() =>
            download(
              `${safeFileName(session.name)}.csv`,
              showToCsv(session, session.endedAt ?? Date.now()),
              "text/csv;charset=utf-8",
            )
          }
        >
          Exportar planilha (CSV)
        </button>
        <button
          type="button"
          className="button-outline button-danger"
          onClick={() => {
            if (
              window.confirm(`Excluir o registro do show “${session.name}”?`)
            ) {
              void show.remove(session.id).then(() => {
                toast("Show excluído");
                navigate("/shows", { replace: true });
              });
            }
          }}
        >
          Excluir show
        </button>
      </div>
    </div>
  );
}
