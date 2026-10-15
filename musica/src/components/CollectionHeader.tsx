import type { ReactNode } from "react";
import type { Track } from "../api/types";
import { usePlayer } from "../player/PlayerContext";
import { Cover } from "./Cover";
import { PauseIcon, PlayIcon, ShuffleIcon } from "./Icons";

export function CollectionHeader({
  kind,
  title,
  cover,
  round = false,
  meta,
  coverNode,
}: {
  kind: string;
  title: ReactNode;
  cover?: string;
  round?: boolean;
  meta: ReactNode;
  coverNode?: ReactNode;
}) {
  return (
    <header className="collection-header">
      {coverNode ?? (
        <Cover
          src={cover ?? ""}
          alt=""
          round={round}
          className="collection-cover"
        />
      )}
      <div className="collection-text">
        <span className="collection-kind">{kind}</span>
        <h1 className="collection-title">{title}</h1>
        <div className="collection-meta">{meta}</div>
      </div>
    </header>
  );
}

/** Big play button + shuffle for a list, as on album/playlist pages. */
export function PlayAllBar({
  tracks,
  children,
}: {
  tracks: Track[];
  children?: ReactNode;
}) {
  const player = usePlayer();
  const ids = new Set(tracks.map((track) => track.id));
  const listIsPlaying =
    player.track !== null &&
    ids.has(player.track.id) &&
    player.state.original.length === tracks.length &&
    player.state.original.every((track, i) => track.id === tracks[i]?.id);

  return (
    <div className="play-all-bar">
      <button
        type="button"
        className="play-fab play-fab-large"
        aria-label={listIsPlaying && player.playing ? "Pausar" : "Tocar tudo"}
        disabled={tracks.length === 0}
        onClick={() =>
          listIsPlaying ? player.togglePlay() : player.playList(tracks, 0)
        }
      >
        {listIsPlaying && player.playing ? (
          <PauseIcon size={26} />
        ) : (
          <PlayIcon size={26} />
        )}
      </button>
      <button
        type="button"
        className={`icon-button ${player.state.shuffle ? "is-on" : ""}`}
        aria-label="Modo aleatório"
        aria-pressed={player.state.shuffle}
        onClick={player.toggleShuffle}
      >
        <ShuffleIcon size={28} />
      </button>
      {children}
    </div>
  );
}
