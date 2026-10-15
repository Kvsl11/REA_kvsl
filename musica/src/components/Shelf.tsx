import type { ReactNode } from "react";
import type { Album, Artist, Track } from "../api/types";
import { useLocal } from "../local/LocalContext";
import { usePlayer } from "../player/PlayerContext";
import { ArtistLink } from "./TrackList";
import { Link } from "../router/router";
import { Cover } from "./Cover";
import { PauseIcon, PlayIcon } from "./Icons";

export function Shelf({
  title,
  moreLink,
  children,
}: {
  title: string;
  moreLink?: string;
  children: ReactNode;
}) {
  return (
    <section className="shelf">
      <header className="shelf-header">
        <h2>{title}</h2>
        {moreLink && (
          <Link to={moreLink} className="shelf-more">
            Mostrar tudo
          </Link>
        )}
      </header>
      <div className="shelf-row">{children}</div>
    </section>
  );
}

export function TrackCard({
  tracks,
  index,
}: {
  tracks: Track[];
  index: number;
}) {
  const player = usePlayer();
  const local = useLocal();
  const track = local.resolve(tracks[index]!);
  const isCurrent = player.track?.id === track.id;
  const isPlaying = isCurrent && player.playing;
  return (
    <div className="card">
      <div className="card-art">
        <Cover src={track.cover} alt="" />
        <button
          type="button"
          className="play-fab"
          aria-label={
            isPlaying ? `Pausar ${track.title}` : `Tocar ${track.title}`
          }
          onClick={() =>
            isCurrent ? player.togglePlay() : player.playList(tracks, index)
          }
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
      <p className="card-title" title={track.title}>
        {track.title}
      </p>
      <ArtistLink track={track} className="card-subtitle" />
    </div>
  );
}

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link to={`/album/${album.id}`} className="card">
      <div className="card-art">
        <Cover src={album.cover} alt="" />
      </div>
      <p className="card-title" title={album.title}>
        {album.title}
      </p>
      <p className="card-subtitle">
        {album.releaseDate ? `${album.releaseDate.slice(0, 4)} • ` : ""}
        {album.artist}
      </p>
    </Link>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link to={`/artista/${artist.id}`} className="card">
      <div className="card-art">
        <Cover src={artist.image} alt="" round />
      </div>
      <p className="card-title" title={artist.name}>
        {artist.name}
      </p>
      <p className="card-subtitle">Artista</p>
    </Link>
  );
}
