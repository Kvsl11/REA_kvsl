import { useState } from "react";
import type { Track } from "../api/types";
import { CollectionHeader, PlayAllBar } from "../components/CollectionHeader";
import { Cover } from "../components/Cover";
import {
  ChartIcon,
  HeartIcon,
  MicIcon,
  PlusIcon,
  UploadIcon,
} from "../components/Icons";
import { Modal } from "../components/Modal";
import { Empty } from "../components/Status";
import { TrackList } from "../components/TrackList";
import { useToast } from "../components/Toast";
import { formatTime, formatTotal, plural } from "../format";
import { useLibrary, type Playlist } from "../library/LibraryContext";
import { useLocal } from "../local/LocalContext";
import { usePlayer } from "../player/PlayerContext";
import { Link, navigate } from "../router/router";
import { useShow } from "../show/ShowContext";
import { StartShowDialog } from "./Shows";

function PlaylistTile({ playlist }: { playlist: Playlist }) {
  const local = useLocal();
  const tracks = local.resolveAll(playlist.tracks);
  return (
    <Link to={`/playlist/${playlist.id}`} className="library-tile">
      <Cover src={tracks[0]?.cover ?? ""} alt="" />
      <span className="library-tile-name">{playlist.name}</span>
      <span className="library-tile-meta">
        {playlist.kind === "setlist" ? "Setlist • " : ""}
        {plural(tracks.length, "música", "músicas")}
      </span>
    </Link>
  );
}

export function LibraryPage() {
  const library = useLibrary();
  const local = useLocal();
  const setlists = library.playlists.filter(
    (playlist) => playlist.kind === "setlist",
  );
  const playlists = library.playlists.filter(
    (playlist) => playlist.kind !== "setlist",
  );
  return (
    <div className="page">
      <div className="page-title-row">
        <h1 className="page-title">Sua Biblioteca</h1>
        <div className="button-row">
          <button
            type="button"
            className="button-outline"
            onClick={() =>
              navigate(`/playlist/${library.createPlaylist("").id}`)
            }
          >
            <PlusIcon size={16} /> Nova playlist
          </button>
          <button
            type="button"
            className="button-outline"
            onClick={() =>
              navigate(`/playlist/${library.createPlaylist("", "setlist").id}`)
            }
          >
            <MicIcon size={16} /> Novo setlist
          </button>
        </div>
      </div>
      <div className="library-grid">
        <Link to="/curtidas" className="library-tile liked-tile">
          <HeartIcon size={32} />
          <span className="library-tile-name">Músicas Curtidas</span>
          <span className="library-tile-meta">
            {plural(library.liked.length, "música", "músicas")}
          </span>
        </Link>
        <Link to="/suas-musicas" className="library-tile local-tile">
          <UploadIcon size={32} />
          <span className="library-tile-name">Suas músicas</span>
          <span className="library-tile-meta">
            {plural(local.records.length, "arquivo", "arquivos")}
          </span>
        </Link>
        <Link to="/estatisticas" className="library-tile stats-tile">
          <ChartIcon size={32} />
          <span className="library-tile-name">Estatísticas</span>
          <span className="library-tile-meta">histórico e mais tocadas</span>
        </Link>
      </div>
      <section className="section">
        <h2>Setlists de show</h2>
        {setlists.length === 0 ? (
          <Empty>
            Nenhum setlist ainda.{" "}
            <Link to="/shows" className="strong-link">
              Saiba como funciona o modo show
            </Link>
            .
          </Empty>
        ) : (
          <div className="library-grid">
            {setlists.map((playlist) => (
              <PlaylistTile key={playlist.id} playlist={playlist} />
            ))}
          </div>
        )}
      </section>
      <section className="section">
        <h2>Playlists</h2>
        {playlists.length === 0 ? (
          <Empty>Nenhuma playlist ainda.</Empty>
        ) : (
          <div className="library-grid">
            {playlists.map((playlist) => (
              <PlaylistTile key={playlist.id} playlist={playlist} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function LikedPage() {
  const library = useLibrary();
  const local = useLocal();
  const liked = local.resolveAll(library.liked);
  const total = liked.reduce((sum, track) => sum + track.duration, 0);
  return (
    <div className="page">
      <CollectionHeader
        kind="Playlist"
        title="Músicas Curtidas"
        coverNode={
          <div className="collection-cover liked-cover-large">
            <HeartIcon size={64} />
          </div>
        }
        meta={`${plural(liked.length, "música", "músicas")}${
          total > 0 ? `, ${formatTotal(total)}` : ""
        }`}
      />
      {liked.length === 0 ? (
        <Empty>
          As músicas que você curtir aparecem aqui. Toque no coração ao lado de
          qualquer música.
        </Empty>
      ) : (
        <>
          <PlayAllBar tracks={liked} />
          <TrackList
            tracks={liked}
            onRemove={(track) => library.toggleLike(track)}
            removeLabel="Remover das Curtidas"
          />
        </>
      )}
    </div>
  );
}

/** Quick picker to fill a playlist or setlist from songs the app already knows. */
function AddTracksDialog({
  playlist,
  onClose,
}: {
  playlist: Playlist;
  onClose: () => void;
}) {
  const library = useLibrary();
  const local = useLocal();
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState(0);

  const seen = new Set<string>();
  const pool: Track[] = [];
  for (const track of [
    ...local.tracks,
    ...local.resolveAll(library.liked),
    ...library.playlists.flatMap((item) => local.resolveAll(item.tracks)),
  ]) {
    if (!seen.has(track.id)) {
      seen.add(track.id);
      pool.push(track);
    }
  }
  const inPlaylist = new Set(playlist.tracks.map((track) => track.id));
  const text = query.trim().toLowerCase();
  const results = pool.filter(
    (track) =>
      !text || `${track.title} ${track.artist}`.toLowerCase().includes(text),
  );

  return (
    <Modal
      title={
        playlist.kind === "setlist"
          ? "Adicionar ao setlist"
          : "Adicionar à playlist"
      }
      onClose={onClose}
      wide
      footer={
        <button type="button" className="button-primary" onClick={onClose}>
          Pronto
          {added > 0 && ` (${plural(added, "adicionada", "adicionadas")})`}
        </button>
      }
    >
      <input
        type="search"
        className="filter-input"
        placeholder="Buscar em suas músicas, curtidas e playlists"
        aria-label="Buscar músicas para adicionar"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {pool.length === 0 ? (
        <p className="empty">
          Nenhuma música salva ainda. Importe arquivos em{" "}
          <Link to="/suas-musicas" className="strong-link" onClick={onClose}>
            Suas músicas
          </Link>{" "}
          ou curta músicas do catálogo.
        </p>
      ) : (
        <ul className="picker-list">
          {results.slice(0, 100).map((track) => {
            const already = inPlaylist.has(track.id);
            return (
              <li key={track.id}>
                <Cover src={track.cover} alt="" />
                <span className="track-text">
                  <span className="track-title">{track.title}</span>
                  <span className="track-artist">
                    {track.artist || "Artista desconhecido"} •{" "}
                    {formatTime(track.duration)}
                  </span>
                </span>
                <button
                  type="button"
                  className="button-outline button-small"
                  disabled={already && playlist.kind !== "setlist"}
                  aria-label={`Adicionar ${track.title}`}
                  onClick={() => {
                    library.addToPlaylist(playlist.id, track);
                    setAdded((value) => value + 1);
                  }}
                >
                  {already
                    ? playlist.kind === "setlist"
                      ? "+ De novo"
                      : "Adicionada"
                    : "+ Adicionar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export function PlaylistPage({ id }: { id: string }) {
  const library = useLibrary();
  const local = useLocal();
  const show = useShow();
  const toast = useToast();
  const playlist = library.playlists.find((item) => item.id === id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [starting, setStarting] = useState(false);

  if (!playlist) return <Empty>Playlist não encontrada.</Empty>;
  const isSetlist = playlist.kind === "setlist";
  const tracks = local.resolveAll(playlist.tracks);
  const total = tracks.reduce((sum, track) => sum + track.duration, 0);
  const noun = isSetlist ? "setlist" : "playlist";

  return (
    <div className="page">
      <CollectionHeader
        kind={isSetlist ? "Setlist de show" : "Playlist"}
        cover={tracks[0]?.cover ?? ""}
        title={
          editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const name = new FormData(event.currentTarget).get("name");
                library.updatePlaylist(playlist.id, {
                  name: String(name ?? ""),
                });
                setEditing(false);
              }}
            >
              <input
                name="name"
                className="rename-input"
                aria-label={`Nome do ${noun}`}
                defaultValue={playlist.name}
                autoFocus
                onBlur={(event) => event.currentTarget.form?.requestSubmit()}
              />
            </form>
          ) : (
            <button
              type="button"
              className="title-button"
              title="Renomear"
              onClick={() => setEditing(true)}
            >
              {playlist.name}
            </button>
          )
        }
        meta={
          <>
            {plural(tracks.length, "música", "músicas")}
            {total > 0 &&
              `, ${formatTotal(total)}${isSetlist ? " previstos" : ""}`}
          </>
        }
      />
      <PlayAllBar tracks={tracks}>
        {isSetlist && (
          <button
            type="button"
            className="button-primary button-record"
            disabled={tracks.length === 0}
            onClick={() =>
              show.active ? navigate("/show/ao-vivo") : setStarting(true)
            }
          >
            <span className="rec-dot" aria-hidden="true" />
            {show.active ? "Show em andamento" : "Iniciar show"}
          </button>
        )}
        <button
          type="button"
          className="button-outline"
          onClick={() => setAdding(true)}
        >
          <PlusIcon size={16} /> Adicionar músicas
        </button>
        <button
          type="button"
          className="button-text"
          onClick={() => {
            library.updatePlaylist(playlist.id, {
              kind: isSetlist ? "playlist" : "setlist",
            });
            toast(
              isSetlist
                ? "Agora é uma playlist comum"
                : "Agora é um setlist de show",
            );
          }}
        >
          {isSetlist ? "Transformar em playlist" : "Usar como setlist de show"}
        </button>
        <button
          type="button"
          className="button-text button-danger-text"
          onClick={() => {
            if (window.confirm(`Excluir “${playlist.name}”?`)) {
              library.deletePlaylist(playlist.id);
              toast(isSetlist ? "Setlist excluído" : "Playlist excluída");
              navigate("/biblioteca");
            }
          }}
        >
          Excluir
        </button>
      </PlayAllBar>
      {playlist.tracks.length === 0 ? (
        <Empty>
          {isSetlist
            ? "Setlist vazio. Adicione as músicas na ordem do show; depois é só reordenar com as setas."
            : "Playlist vazia."}{" "}
          <button
            type="button"
            className="button-text"
            onClick={() => setAdding(true)}
          >
            Adicionar músicas
          </button>
        </Empty>
      ) : (
        <TrackList
          tracks={playlist.tracks}
          showStageInfo={isSetlist}
          onMove={(from, to) => library.moveInPlaylist(playlist.id, from, to)}
          onRemove={(_, index) =>
            library.removeFromPlaylist(playlist.id, index)
          }
          removeLabel={`Remover deste ${noun}`}
        />
      )}
      {adding && (
        <AddTracksDialog playlist={playlist} onClose={() => setAdding(false)} />
      )}
      {starting && (
        <StartShowDialog
          setlist={playlist}
          onClose={() => setStarting(false)}
        />
      )}
    </div>
  );
}

export function QueuePage() {
  const player = usePlayer();
  const local = useLocal();
  const { queue, index } = player.state;
  const current = player.track;
  const upcoming = queue.slice(index + 1).map(local.resolve);

  return (
    <div className="page">
      <h1 className="page-title">Fila</h1>
      {!current ? (
        <Empty>A fila está vazia. Toque alguma música para começar.</Empty>
      ) : (
        <>
          <section className="section">
            <h2>Tocando agora</h2>
            <TrackList tracks={[current]} />
          </section>
          <section className="section">
            <h2>A seguir</h2>
            {upcoming.length === 0 ? (
              <Empty>Nada na fila depois desta música.</Empty>
            ) : (
              <ol className="queue-list">
                {upcoming.map((track, offset) => {
                  const queueIndex = index + 1 + offset;
                  return (
                    <li key={`${track.id}-${queueIndex}`} className="queue-row">
                      <button
                        type="button"
                        className="queue-play"
                        onClick={() => player.jumpTo(queueIndex)}
                      >
                        <Cover src={track.cover} alt="" />
                        <span className="track-text">
                          <span className="track-title">{track.title}</span>
                          <span className="track-artist">{track.artist}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="button-text"
                        aria-label={`Remover ${track.title} da fila`}
                        onClick={() => player.removeAt(queueIndex)}
                      >
                        Remover
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
