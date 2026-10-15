import { getTracks, hasJamendo, type TrackOrder } from "../api/jamendo";
import type { Track } from "../api/types";
import { Cover } from "../components/Cover";
import {
  HeartIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  UploadIcon,
} from "../components/Icons";
import { Shelf, TrackCard } from "../components/Shelf";
import { ErrorMessage, Loading } from "../components/Status";
import { useLibrary, type Playlist } from "../library/LibraryContext";
import { useLocal } from "../local/LocalContext";
import { usePlayer } from "../player/PlayerContext";
import { Link } from "../router/router";
import { useHistory } from "../stats/HistoryContext";
import { useAsync } from "../useAsync";
import { ActiveShowBanner } from "./Shows";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function JamendoShelf({
  title,
  order,
  tag,
  moreLink,
}: {
  title: string;
  order: TrackOrder;
  tag?: string;
  moreLink?: string;
}) {
  const { data, error, loading, retry } = useAsync(
    `home:${order}:${tag ?? ""}`,
    (signal) =>
      getTracks({ order, ...(tag ? { tag } : {}), limit: 12 }, signal),
  );
  return (
    <Shelf title={title} {...(moreLink ? { moreLink } : {})}>
      {loading && <Loading />}
      {error && <ErrorMessage error={error} onRetry={retry} />}
      {data?.map((track, index) => (
        <TrackCard key={track.id} tracks={data} index={index} />
      ))}
    </Shelf>
  );
}

/** Spotify-style shortcut: cover on the left, name, play button on hover. */
function Shortcut({
  to,
  label,
  art,
  tracks,
}: {
  to: string;
  label: string;
  art: React.ReactNode;
  tracks: Track[];
}) {
  const player = usePlayer();
  const playingHere =
    player.playing &&
    player.track !== null &&
    player.state.original.length === tracks.length &&
    player.state.original.every((track, i) => track.id === tracks[i]?.id);
  return (
    <div className="shortcut">
      <Link to={to} className="shortcut-link">
        <span className="shortcut-art">{art}</span>
        <span className="shortcut-label">{label}</span>
      </Link>
      {tracks.length > 0 && (
        <button
          type="button"
          className="play-fab shortcut-play"
          aria-label={playingHere ? `Pausar ${label}` : `Tocar ${label}`}
          onClick={() =>
            playingHere ? player.togglePlay() : player.playList(tracks, 0)
          }
        >
          {playingHere ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
      )}
    </div>
  );
}

function PlaylistShortcut({ playlist }: { playlist: Playlist }) {
  const local = useLocal();
  const tracks = local.resolveAll(playlist.tracks);
  return (
    <Shortcut
      to={`/playlist/${playlist.id}`}
      label={playlist.name}
      tracks={tracks}
      art={
        playlist.kind === "setlist" && !tracks[0]?.cover ? (
          <span className="shortcut-icon setlist-art">
            <MicIcon size={22} />
          </span>
        ) : (
          <Cover src={tracks[0]?.cover ?? ""} alt="" />
        )
      }
    />
  );
}

export function Home() {
  const library = useLibrary();
  const local = useLocal();
  const history = useHistory();
  const recent = local.resolveAll(history.recentTracks);
  const liked = local.resolveAll(library.liked);
  const jamendo = hasJamendo();
  const playlists = [...library.playlists]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);

  return (
    <div className="page">
      <h1 className="page-title">{greeting()}</h1>
      <ActiveShowBanner />
      <div className="shortcut-grid">
        <Shortcut
          to="/curtidas"
          label="Músicas Curtidas"
          tracks={liked}
          art={
            <span className="shortcut-icon liked-cover">
              <HeartIcon size={22} />
            </span>
          }
        />
        <Shortcut
          to="/suas-musicas"
          label="Suas músicas"
          tracks={local.tracks}
          art={
            <span className="shortcut-icon local-art">
              <UploadIcon size={22} />
            </span>
          }
        />
        {playlists.map((playlist) => (
          <PlaylistShortcut key={playlist.id} playlist={playlist} />
        ))}
      </div>

      {recent.length > 0 && (
        <Shelf title="Tocadas recentemente" moreLink="/estatisticas">
          {recent.map((track, index) => (
            <TrackCard key={track.id} tracks={recent} index={index} />
          ))}
        </Shelf>
      )}

      {local.tracks.length > 0 ? (
        <Shelf title="Suas músicas" moreLink="/suas-musicas">
          {local.tracks.slice(0, 12).map((track, index) => (
            <TrackCard key={track.id} tracks={local.tracks} index={index} />
          ))}
        </Shelf>
      ) : (
        <section className="promo-card">
          <UploadIcon size={28} />
          <div>
            <h2>Importe suas músicas</h2>
            <p>MP3, M4A, FLAC, WAV… Ficam no aparelho e tocam sem internet.</p>
          </div>
          <Link to="/suas-musicas" className="button-primary">
            Importar
          </Link>
        </section>
      )}

      {jamendo ? (
        <>
          <JamendoShelf title="Em alta esta semana" order="popularity_week" />
          <JamendoShelf title="Lançamentos" order="releasedate_desc" />
          <JamendoShelf
            title="Eletrônica"
            order="popularity_month"
            tag="electronic"
            moreLink="/genero/electronic"
          />
          <JamendoShelf
            title="Rock"
            order="popularity_month"
            tag="rock"
            moreLink="/genero/rock"
          />
          <JamendoShelf
            title="Para relaxar"
            order="popularity_month"
            tag="relaxation"
            moreLink="/genero/relaxation"
          />
        </>
      ) : (
        <section className="promo-card">
          <MicIcon size={28} />
          <div>
            <h2>Descubra mais músicas</h2>
            <p>
              Conecte o Jamendo (grátis) para ouvir mais de 600 mil músicas
              livres.
            </p>
          </div>
          <Link to="/configuracoes" className="button-outline">
            Conectar
          </Link>
        </section>
      )}
    </div>
  );
}
