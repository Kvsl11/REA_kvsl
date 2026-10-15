import { useState, type FormEvent } from "react";
import type { Track } from "../api/types";
import { Cover } from "../components/Cover";
import { MicIcon, PlusIcon } from "../components/Icons";
import { Modal } from "../components/Modal";
import { Empty, Loading } from "../components/Status";
import { formatClock, formatDateTime, formatDuration, plural } from "../format";
import { useLibrary, type Playlist } from "../library/LibraryContext";
import { useLocal } from "../local/LocalContext";
import { Link, navigate } from "../router/router";
import { useShow } from "../show/ShowContext";
import { summarizeShow, type ShowMode } from "../show/session";
import { useNow } from "../useNow";

export function StartShowDialog({
  setlist,
  onClose,
}: {
  setlist: Playlist;
  onClose: () => void;
}) {
  const show = useShow();
  const local = useLocal();
  const tracks = local.resolveAll(setlist.tracks);
  const missing = setlist.tracks.length - tracks.length;
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  const [name, setName] = useState(`${setlist.name} — ${today}`);
  const [venue, setVenue] = useState("");
  const [mode, setMode] = useState<ShowMode>("live");
  const planned = tracks.reduce((sum, track) => sum + track.duration, 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    show.start({
      name,
      venue,
      mode,
      setlistId: setlist.id,
      setlistName: setlist.name,
      tracks,
    });
    onClose();
    navigate("/show/ao-vivo");
  };

  return (
    <Modal
      title="Iniciar show"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button-outline" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            form="start-show"
            className="button-primary button-record"
            disabled={tracks.length === 0}
          >
            <span className="rec-dot" aria-hidden="true" /> Começar a gravar
          </button>
        </>
      }
    >
      <form id="start-show" className="edit-form" onSubmit={submit}>
        <p className="field-hint">
          {setlist.name}: {plural(tracks.length, "música", "músicas")}
          {planned > 0 && `, ${formatDuration(planned)} previstos`}
          {missing > 0 && ` (${missing} indisponível)`}
        </p>
        <label>
          Nome do show
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label>
          Local (opcional)
          <input
            value={venue}
            placeholder="ex.: Bar do Zé"
            onChange={(event) => setVenue(event.target.value)}
          />
        </label>
        <fieldset className="mode-options">
          <legend>Como vai ser o show?</legend>
          <label
            className={`mode-option ${mode === "live" ? "is-selected" : ""}`}
          >
            <input
              type="radio"
              name="mode"
              checked={mode === "live"}
              onChange={() => setMode("live")}
            />
            <span>
              <strong>Ao vivo</strong>
              A banda toca; você toca em “Próxima” quando cada música começa. O
              app não toca áudio.
            </span>
          </label>
          <label
            className={`mode-option ${mode === "playback" ? "is-selected" : ""}`}
          >
            <input
              type="radio"
              name="mode"
              checked={mode === "playback"}
              onChange={() => setMode("playback")}
            />
            <span>
              <strong>Tocar as músicas</strong>
              O app toca o setlist (playback, DJ) e registra sozinho cada
              música.
            </span>
          </label>
        </fieldset>
        {tracks.length === 0 && (
          <p className="form-error">
            Adicione músicas ao setlist antes de começar.
          </p>
        )}
      </form>
    </Modal>
  );
}

export function ActiveShowBanner() {
  const show = useShow();
  const now = useNow(show.active ? 1000 : null);
  if (!show.active) return null;
  return (
    <Link to="/show/ao-vivo" className="live-banner">
      <span className="rec-dot" aria-hidden="true" />
      <span className="live-banner-text">
        Gravando: <strong>{show.active.name}</strong>
      </span>
      <span className="live-banner-time">
        {formatClock((now - show.active.startedAt) / 1000)}
      </span>
    </Link>
  );
}

function SetlistCard({
  setlist,
  onStart,
}: {
  setlist: Playlist;
  onStart: () => void;
}) {
  const local = useLocal();
  const tracks: Track[] = local.resolveAll(setlist.tracks);
  const planned = tracks.reduce((sum, track) => sum + track.duration, 0);
  return (
    <div className="setlist-card">
      <Link to={`/playlist/${setlist.id}`} className="setlist-card-main">
        <Cover src={tracks[0]?.cover ?? ""} alt="" />
        <span className="setlist-card-text">
          <strong>{setlist.name}</strong>
          <span>
            {plural(tracks.length, "música", "músicas")}
            {planned > 0 && ` • ${formatDuration(planned)}`}
          </span>
        </span>
      </Link>
      <button
        type="button"
        className="button-primary button-small"
        disabled={tracks.length === 0}
        onClick={onStart}
      >
        <MicIcon size={16} /> Iniciar show
      </button>
    </div>
  );
}

export function ShowsPage() {
  const library = useLibrary();
  const show = useShow();
  const [starting, setStarting] = useState<Playlist | null>(null);
  const setlists = library.playlists.filter(
    (playlist) => playlist.kind === "setlist",
  );
  const past = show.sessions.filter((session) => session.endedAt !== null);
  const now = Date.now();

  return (
    <div className="page">
      <div className="page-title-row">
        <h1 className="page-title">Shows</h1>
        <button
          type="button"
          className="button-outline"
          onClick={() =>
            navigate(`/playlist/${library.createPlaylist("", "setlist").id}`)
          }
        >
          <PlusIcon size={16} /> Novo setlist
        </button>
      </div>

      {show.active && (
        <section className="section">
          <ActiveShowBanner />
        </section>
      )}

      <section className="section">
        <h2>Seus setlists</h2>
        {setlists.length === 0 ? (
          <div className="empty-hero">
            <MicIcon size={40} />
            <h2>Monte o setlist do seu show</h2>
            <p>
              Um setlist é uma playlist na ordem do show. Na hora do show, toque
              em “Iniciar show” e o app grava quanto tempo durou o show, cada
              música e os intervalos.
            </p>
            <button
              type="button"
              className="button-primary"
              onClick={() =>
                navigate(
                  `/playlist/${library.createPlaylist("", "setlist").id}`,
                )
              }
            >
              Criar setlist
            </button>
          </div>
        ) : (
          <div className="setlist-grid">
            {setlists.map((setlist) => (
              <SetlistCard
                key={setlist.id}
                setlist={setlist}
                onStart={() => setStarting(setlist)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>Histórico de shows</h2>
        {!show.loaded ? (
          <Loading />
        ) : past.length === 0 ? (
          <Empty>Os shows que você gravar aparecem aqui.</Empty>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Show</th>
                <th>Data</th>
                <th>Duração</th>
                <th>Músicas</th>
              </tr>
            </thead>
            <tbody>
              {past.map((session) => {
                const summary = summarizeShow(session, now);
                return (
                  <tr key={session.id}>
                    <td>
                      <Link to={`/show/${session.id}`} className="strong-link">
                        {session.name}
                      </Link>
                      {session.venue && (
                        <span className="cell-sub">{session.venue}</span>
                      )}
                    </td>
                    <td>{formatDateTime(session.startedAt)}</td>
                    <td>{formatClock(summary.totalSeconds)}</td>
                    <td>
                      {summary.songsPlayed}
                      {summary.plannedCount > 0 &&
                        ` de ${summary.plannedCount}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {starting && (
        <StartShowDialog setlist={starting} onClose={() => setStarting(null)} />
      )}
    </div>
  );
}
