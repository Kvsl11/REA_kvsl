import type { Track } from "../api/types";
import { formatTime } from "../format";
import { useLibrary } from "../library/LibraryContext";
import { usePlayer } from "../player/PlayerContext";
import { Link } from "../router/router";
import { Cover } from "./Cover";
import { HeartIcon, HeartOutlineIcon, PauseIcon, PlayIcon } from "./Icons";
import { TrackMenu } from "./TrackMenu";

export function TrackList({
  tracks,
  showAlbum = true,
  showCover = true,
  onRemove,
  removeLabel,
}: {
  tracks: Track[];
  showAlbum?: boolean;
  showCover?: boolean;
  onRemove?: (track: Track, index: number) => void;
  removeLabel?: string;
}) {
  const player = usePlayer();
  const library = useLibrary();

  return (
    <ol className={`track-list ${showAlbum ? "" : "track-list-no-album"}`}>
      {tracks.map((track, index) => {
        const isCurrent = player.track?.id === track.id;
        const isPlaying = isCurrent && player.playing;
        const liked = library.isLiked(track.id);
        const start = () => {
          if (isCurrent) player.togglePlay();
          else player.playList(tracks, index);
        };
        return (
          <li
            key={`${track.id}-${index}`}
            className={`track-row ${isCurrent ? "is-current" : ""}`}
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
                <Link
                  to={`/artista/${track.artistId}`}
                  className="track-artist"
                >
                  {track.artist}
                </Link>
              </div>
            </div>
            {showAlbum && (
              <Link to={`/album/${track.albumId}`} className="track-album">
                {track.album}
              </Link>
            )}
            <div className="track-end">
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
              <span className="track-duration">
                {formatTime(track.duration)}
              </span>
              <TrackMenu
                track={track}
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
