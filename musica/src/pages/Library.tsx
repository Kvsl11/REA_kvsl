import { CollectionHeader, PlayAllBar } from "../components/CollectionHeader";
import { Cover } from "../components/Cover";
import { HeartIcon, PlusIcon } from "../components/Icons";
import { Empty } from "../components/Status";
import { TrackList } from "../components/TrackList";
import { useToast } from "../components/Toast";
import { formatTotal, plural } from "../format";
import { useLibrary } from "../library/LibraryContext";
import { usePlayer } from "../player/PlayerContext";
import { Link, navigate } from "../router/router";
import { useState } from "react";

export function LibraryPage() {
  const library = useLibrary();
  return (
    <div className="page">
      <div className="page-title-row">
        <h1 className="page-title">Sua Biblioteca</h1>
        <button
          type="button"
          className="button-outline"
          onClick={() => navigate(`/playlist/${library.createPlaylist("").id}`)}
        >
          <PlusIcon size={16} /> Nova playlist
        </button>
      </div>
      <div className="library-grid">
        <Link to="/curtidas" className="library-tile liked-tile">
          <HeartIcon size={32} />
          <span className="library-tile-name">Músicas Curtidas</span>
          <span className="library-tile-meta">
            {plural(library.liked.length, "música", "músicas")}
          </span>
        </Link>
        {library.playlists.map((playlist) => (
          <Link
            key={playlist.id}
            to={`/playlist/${playlist.id}`}
            className="library-tile"
          >
            <Cover src={playlist.tracks[0]?.cover ?? ""} alt="" />
            <span className="library-tile-name">{playlist.name}</span>
            <span className="library-tile-meta">
              {plural(playlist.tracks.length, "música", "músicas")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function LikedPage() {
  const library = useLibrary();
  const total = library.liked.reduce((sum, track) => sum + track.duration, 0);
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
        meta={`${plural(library.liked.length, "música", "músicas")}${
          total > 0 ? `, ${formatTotal(total)}` : ""
        }`}
      />
      {library.liked.length === 0 ? (
        <Empty>
          As músicas que você curtir aparecem aqui. Toque no coração ao lado de
          qualquer música.
        </Empty>
      ) : (
        <>
          <PlayAllBar tracks={library.liked} />
          <TrackList
            tracks={library.liked}
            onRemove={(track) => library.toggleLike(track)}
            removeLabel="Remover das Curtidas"
          />
        </>
      )}
    </div>
  );
}

export function PlaylistPage({ id }: { id: string }) {
  const library = useLibrary();
  const toast = useToast();
  const playlist = library.playlists.find((item) => item.id === id);
  const [editing, setEditing] = useState(false);

  if (!playlist) return <Empty>Playlist não encontrada.</Empty>;
  const total = playlist.tracks.reduce((sum, track) => sum + track.duration, 0);

  return (
    <div className="page">
      <CollectionHeader
        kind="Playlist"
        cover={playlist.tracks[0]?.cover ?? ""}
        title={
          editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const name = new FormData(event.currentTarget).get("name");
                library.renamePlaylist(playlist.id, String(name ?? ""));
                setEditing(false);
              }}
            >
              <input
                name="name"
                className="rename-input"
                aria-label="Nome da playlist"
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
        meta={`${plural(playlist.tracks.length, "música", "músicas")}${
          total > 0 ? `, ${formatTotal(total)}` : ""
        }`}
      />
      <PlayAllBar tracks={playlist.tracks}>
        <button
          type="button"
          className="button-outline button-danger"
          onClick={() => {
            if (window.confirm(`Excluir a playlist “${playlist.name}”?`)) {
              library.deletePlaylist(playlist.id);
              toast("Playlist excluída");
              navigate("/biblioteca");
            }
          }}
        >
          Excluir playlist
        </button>
      </PlayAllBar>
      {playlist.tracks.length === 0 ? (
        <Empty>
          Playlist vazia. Use o menu <strong>⋯</strong> de qualquer música e
          escolha “Adicionar à playlist”, ou{" "}
          <Link to="/buscar" className="strong-link">
            busque algo para ouvir
          </Link>
          .
        </Empty>
      ) : (
        <TrackList
          tracks={playlist.tracks}
          onRemove={(track) =>
            library.removeFromPlaylist(playlist.id, track.id)
          }
          removeLabel="Remover desta playlist"
        />
      )}
    </div>
  );
}

export function QueuePage() {
  const player = usePlayer();
  const { queue, index } = player.state;
  const current = player.track;
  const upcoming = queue.slice(index + 1);

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
