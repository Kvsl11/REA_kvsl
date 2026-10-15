import type { Track } from "../api/types";
import { formatTime } from "../format";
import { useLibrary } from "../library/LibraryContext";
import { useLocal } from "../local/LocalContext";
import { usePlayer } from "../player/PlayerContext";
import { Link } from "../router/router";
import { Cover } from "./Cover";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  HeartIcon,
  HeartOutlineIcon,
  PauseIcon,
  PlayIcon,
} from "./Icons";
import { TrackMenu } from "./TrackMenu";

export function ArtistLink({
  track,
  className,
}: {
  track: Track;
  className: string;
}) {
  if (!track.artistId) {
    return (
      <span className={className}>
        {track.artist || "Artista desconhecido"}
      </span>
    );
  }
  return (
    <Link to={`/artista/${track.artistId}`} className={className}>
      {track.artist}
    </Link>
  );
}

export function TrackList({
  tracks: rawTracks,
  showAlbum = true,
  showCover = true,
  showStageInfo = false,
  onRemove,
  removeLabel,
  onMove,
}: {
  tracks: Track[];
  showAlbum?: boolean;
  showCover?: boolean;
  /** Shows key and BPM (setlists). */
  showStageInfo?: boolean;
  onRemove?: (track: Track, index: number) => void;
  removeLabel?: string;
  /** Enables reordering buttons. */
  onMove?: (from: number, to: number) => void;
}) {
  const player = usePlayer();
  const library = useLibrary();
  const local = useLocal();

  // Imported songs may have been edited or deleted since they were added.
  const tracks = rawTracks.map(local.resolve);
  const missing = (track: Track) =>
    track.source === "local" && local.loaded && !local.getRecord(track.id);
  const playable = tracks.filter((track) => !missing(track));

  return (
    <ol
      className={`track-list ${showAlbum ? "" : "track-list-no-album"} ${
        onMove ? "track-list-sortable" : ""
      }`}
    >
      {tracks.map((track, index) => {
        const unavailable = missing(track);
        const isCurrent = player.track?.id === track.id;
        const isPlaying = isCurrent && player.playing;
        const liked = library.isLiked(track.id);
        const info = showStageInfo ? local.info(track.id) : undefined;
        const start = () => {
          if (unavailable) return;
          if (isCurrent) player.togglePlay();
          else player.playList(playable, playable.indexOf(track));
        };
        return (
          <li
            key={`${track.id}-${index}`}
            className={`track-row ${isCurrent ? "is-current" : ""} ${
              unavailable ? "is-unavailable" : ""
            }`}
            onDoubleClick={start}
          >
            <div className="track-index">
              <span className="track-number">{index + 1}</span>
              <button
                type="button"
                className="icon-button track-play"
                aria-label={
                  isPlaying ? `Pausar ${track.title}` : `Tocar ${track.title}`
                }
                onClick={start}
                disabled={unavailable}
              >
                {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
              </button>
            </div>
            <div className="track-main">
              {showCover && (
                <Cover src={track.cover} alt="" className="track-cover" />
              )}
              <div className="track-text">
                <button type="button" className="track-title" onClick={start}>
                  {track.title}
                </button>
                <span className="track-sub">
                  {track.source === "local" && (
                    <span className="badge" title="Arquivo importado">
                      {unavailable ? "removida" : "local"}
                    </span>
                  )}
                  <ArtistLink track={track} className="track-artist" />
                </span>
              </div>
            </div>
            {showAlbum &&
              (track.albumId ? (
                <Link to={`/album/${track.albumId}`} className="track-album">
                  {track.album}
                </Link>
              ) : (
                <span className="track-album">{track.album}</span>
              ))}
            <div className="track-end">
              {info && (info.key || info.bpm) && (
                <span className="stage-chips">
                  {info.key && <span className="chip">{info.key}</span>}
                  {info.bpm && <span className="chip">{info.bpm} bpm</span>}
                </span>
              )}
              {onMove && (
                <span className="move-buttons">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Subir ${track.title}`}
                    disabled={index === 0}
                    onClick={() => onMove(index, index - 1)}
                  >
                    <ArrowUpIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Descer ${track.title}`}
                    disabled={index === tracks.length - 1}
                    onClick={() => onMove(index, index + 1)}
                  >
                    <ArrowDownIcon size={16} />
                  </button>
                </span>
              )}
              {!unavailable && (
                <button
                  type="button"
                  className={`icon-button like-button ${liked ? "is-liked" : ""}`}
                  aria-label={
                    liked ? `Descurtir ${track.title}` : `Curtir ${track.title}`
                  }
                  aria-pressed={liked}
                  onClick={() => library.toggleLike(track)}
                >
                  {liked ? (
                    <HeartIcon size={16} />
                  ) : (
                    <HeartOutlineIcon size={16} />
                  )}
                </button>
              )}
              <span className="track-duration">
                {formatTime(track.duration)}
              </span>
              <TrackMenu
                track={track}
                disabled={unavailable}
                {...(onRemove
                  ? { onRemove: () => onRemove(track, index) }
                  : {})}
                {...(removeLabel ? { removeLabel } : {})}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
