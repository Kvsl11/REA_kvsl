import { getTrack, hasJamendo } from "../api/jamendo";
import type { Track } from "../api/types";
import { useEditor } from "../components/EditorContext";
import { EditIcon, PauseIcon, PlayIcon, SparkIcon } from "../components/Icons";
import { ArtistLink } from "../components/TrackList";
import { TrackMenu } from "../components/TrackMenu";
import { Cover } from "../components/Cover";
import { Empty, ErrorMessage, Loading } from "../components/Status";
import {
  formatAgo,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatTime,
} from "../format";
import { useLibrary } from "../library/LibraryContext";
import { useLocal } from "../local/LocalContext";
import { usePlayer } from "../player/PlayerContext";
import { Link, navigate } from "../router/router";
import { useTrackLyrics } from "../lyrics/LyricsContext";
import { useLyricsEditor } from "../lyrics/LyricsUi";
import { useAnalyze } from "../ai/AnalyzeUi";
import { useShow } from "../show/ShowContext";
import { useHistory } from "../stats/HistoryContext";
import { trackHistory } from "../stats/plays";
import { useAsync } from "../useAsync";

/** Finds a track wherever the app already knows it, before asking Jamendo. */
export function useKnownTrack(id: string): Track | null {
  const local = useLocal();
  const library = useLibrary();
  const player = usePlayer();
  const record = local.getRecord(id);
  if (record) return local.resolve({ id, source: "local" } as Track);
  if (player.track?.id === id) return player.track;
  const all = [
    ...library.liked,
    ...library.playlists.flatMap((playlist) => playlist.tracks),
  ];
  return all.find((track) => track.id === id) ?? null;
}

export function TrackDetailPage({ id }: { id: string }) {
  const known = useKnownTrack(id);
  const local = useLocal();
  const history = useHistory();
  const remote = useAsync(
    `track:${id}:${known ? "known" : "fetch"}`,
    async (signal) =>
      known || id.startsWith("local:") || !hasJamendo()
        ? null
        : getTrack(id, signal),
  );

  const fromHistory = history.statsPlays.find((play) => play.trackId === id);
  const track = known ?? remote.data;

  if (!track) {
    if (!known && !local.loaded) return <Loading />;
    if (!known && remote.loading && !id.startsWith("local:") && hasJamendo())
      return <Loading />;
    if (remote.error)
      return <ErrorMessage error={remote.error} onRetry={remote.retry} />;
    if (fromHistory) {
      // Only the history knows it now (deleted file, or Jamendo unavailable).
      return (
        <div className="page">
          <h1 className="page-title">{fromHistory.title}</h1>
          <p className="collection-meta">
            {fromHistory.artist} • esta música não está mais disponível para
            tocar.
          </p>
          <TrackStats id={id} />
        </div>
      );
    }
    return <Empty>Música não encontrada.</Empty>;
  }
  return <TrackDetail track={track} />;
}

function TrackDetail({ track }: { track: Track }) {
  const player = usePlayer();
  const local = useLocal();
  const edit = useEditor();
  const analyze = useAnalyze();
  const record =
    track.source === "local" ? local.getRecord(track.id) : undefined;
  const info = local.info(track.id);
  const isCurrent = player.track?.id === track.id;

  return (
    <div className="page">
      <header className="collection-header">
        <Cover
          src={track.cover}
          alt={`Capa de ${track.title}`}
          className="collection-cover"
        />
        <div className="collection-text">
          <span className="collection-kind">
            {track.source === "local"
              ? "Música importada"
              : "Música do Jamendo"}
          </span>
          <h1 className="collection-title">{track.title}</h1>
          <div className="collection-meta">
            <ArtistLink track={track} className="strong-link" />
            {track.album && <> • {track.album}</>}
            {record?.year && <> • {record.year}</>}
            {track.duration > 0 && <> • {formatTime(track.duration)}</>}
          </div>
        </div>
      </header>

      <div className="play-all-bar">
        <button
          type="button"
          className="play-fab play-fab-large"
          aria-label={isCurrent && player.playing ? "Pausar" : "Tocar"}
          onClick={() =>
            isCurrent ? player.togglePlay() : player.playList([track], 0)
          }
        >
          {isCurrent && player.playing ? (
            <PauseIcon size={26} />
          ) : (
            <PlayIcon size={26} />
          )}
        </button>
        <button
          type="button"
          className="button-outline"
          onClick={() => edit(track)}
        >
          <EditIcon size={16} />{" "}
          {record ? "Editar informações" : "Informações de show"}
        </button>
        <button
          type="button"
          className="button-outline"
          onClick={() => analyze(track)}
        >
          <SparkIcon size={16} /> Analisar com IA
        </button>
        <button
          type="button"
          className="button-text"
          onClick={() => navigate(`/cifra/${encodeURIComponent(track.id)}`)}
        >
          Cifra
        </button>
        <TrackMenu track={track} />
      </div>

      <div className="detail-grid">
        <section className="panel">
          <h2>Para o show</h2>
          {info && (info.key || info.bpm || info.notes) ? (
            <dl className="facts">
              {info.key && (
                <>
                  <dt>Tom</dt>
                  <dd>{info.key}</dd>
                </>
              )}
              {info.bpm && (
                <>
                  <dt>BPM</dt>
                  <dd>{info.bpm}</dd>
                </>
              )}
              {info.notes && (
                <>
                  <dt>Notas</dt>
                  <dd className="notes-text">{info.notes}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="empty">
              Sem tom, BPM ou notas.{" "}
              <button
                type="button"
                className="button-text"
                onClick={() => edit(track)}
              >
                Adicionar
              </button>
            </p>
          )}
        </section>

        <LyricsPanel track={track} />

        {record && (
          <section className="panel">
            <h2>Arquivo</h2>
            <dl className="facts">
              <dt>Nome</dt>
              <dd>{record.fileName}</dd>
              <dt>Tamanho</dt>
              <dd>{formatBytes(record.size)}</dd>
              <dt>Formato</dt>
              <dd>{record.mimeType}</dd>
              {record.genre && (
                <>
                  <dt>Gênero</dt>
                  <dd>{record.genre}</dd>
                </>
              )}
              <dt>Importada em</dt>
              <dd>{formatDateTime(record.importedAt)}</dd>
            </dl>
          </section>
        )}
      </div>

      <TrackStats id={track.id} />

      {track.licenseUrl && (
        <p className="license">
          Licença:{" "}
          <a href={track.licenseUrl} target="_blank" rel="noreferrer">
            Creative Commons
          </a>
        </p>
      )}
    </div>
  );
}

function TrackStats({ id }: { id: string }) {
  const history = useHistory();
  const show = useShow();
  const stats = trackHistory(history.statsPlays, id);
  const showNames = new Map(
    show.sessions.map((session) => [session.id, session]),
  );

  return (
    <section className="section">
      <h2>Estatísticas</h2>
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-value">{stats.plays}</span>
          <span className="stat-label">vezes tocada</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatDuration(stats.seconds)}</span>
          <span className="stat-label">de música ouvida</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.showPlays}</span>
          <span className="stat-label">vezes em shows</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {stats.lastPlayed > 0 ? formatAgo(stats.lastPlayed) : "—"}
          </span>
          <span className="stat-label">última vez</span>
        </div>
      </div>
      {stats.recent.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Ouvida por</th>
              <th>Onde</th>
            </tr>
          </thead>
          <tbody>
            {stats.recent.map((play) => {
              const session = play.showId
                ? showNames.get(play.showId)
                : undefined;
              return (
                <tr key={play.id}>
                  <td>{formatDateTime(play.startedAt)}</td>
                  <td>{formatTime(play.seconds)}</td>
                  <td>
                    {session ? (
                      <Link to={`/show/${session.id}`} className="strong-link">
                        Show: {session.name}
                      </Link>
                    ) : (
                      "Ouvindo"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="empty">Ainda não foi tocada.</p>
      )}
    </section>
  );
}

function LyricsPanel({ track }: { track: Track }) {
  const lyrics = useTrackLyrics(track);
  const openEditor = useLyricsEditor();
  const preview = lyrics.plain.split("\n").filter(Boolean).slice(0, 6);
  return (
    <section className="panel">
      <h2>Letra</h2>
      {lyrics.status === "loading" || lyrics.status === "searching" ? (
        <p className="empty">Procurando a letra…</p>
      ) : lyrics.record ? (
        <>
          <p className="field-hint">
            {lyrics.lines.length > 0 ? "Sincronizada" : "Sem sincronia"}
            {lyrics.record.source === "lrclib" && " • LRCLIB"}
          </p>
          <p className="lyrics-preview">
            {preview.map((line, index) => (
              <span key={index}>{line}</span>
            ))}
            {lyrics.plain.split("\n").filter(Boolean).length >
              preview.length && <span>…</span>}
          </p>
        </>
      ) : (
        <p className="empty">Sem letra ainda.</p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button-outline button-small"
          onClick={() => openEditor(track, lyrics.record ? "write" : "search")}
        >
          {lyrics.record ? "Editar letra" : "Buscar letra"}
        </button>
        {lyrics.record && !lyrics.record.instrumental && (
          <button
            type="button"
            className="button-text"
            onClick={() =>
              navigate(`/letra/sincronizar/${encodeURIComponent(track.id)}`)
            }
          >
            {lyrics.lines.length > 0 ? "Ressincronizar" : "Sincronizar"}
          </button>
        )}
      </div>
    </section>
  );
}
