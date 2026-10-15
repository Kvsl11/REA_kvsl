import { useEffect, useState, type CSSProperties } from "react";
import { formatTime } from "../format";
import { useLibrary } from "../library/LibraryContext";
import { usePlayer } from "../player/PlayerContext";
import { Link, navigate } from "../router/router";
import { Cover } from "./Cover";
import {
  ChevronDownIcon,
  HeartIcon,
  HeartOutlineIcon,
  MuteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
} from "./Icons";

function SeekBar() {
  const player = usePlayer();
  // While dragging, show the drag position instead of the playback position.
  const [dragging, setDragging] = useState<number | null>(null);
  const value = dragging ?? player.position;
  const max = player.duration || 1;
  return (
    <div className="seek">
      <span className="time">{formatTime(value)}</span>
      <input
        type="range"
        className="range"
        aria-label="Posição da música"
        min={0}
        max={max}
        step={1}
        value={Math.min(value, max)}
        disabled={!player.track}
        style={
          {
            "--fill": `${(Math.min(value, max) / max) * 100}%`,
          } as CSSProperties
        }
        onChange={(event) => setDragging(Number(event.target.value))}
        onPointerUp={() => {
          if (dragging !== null) player.seek(dragging);
          setDragging(null);
        }}
        onKeyUp={() => {
          if (dragging !== null) player.seek(dragging);
          setDragging(null);
        }}
      />
      <span className="time">{formatTime(player.duration)}</span>
    </div>
  );
}

function Controls({ large = false }: { large?: boolean }) {
  const player = usePlayer();
  const { shuffle, repeat } = player.state;
  const size = large ? 28 : 20;
  return (
    <div className={`controls ${large ? "controls-large" : ""}`}>
      <button
        type="button"
        className={`icon-button ${shuffle ? "is-on" : ""}`}
        aria-label="Modo aleatório"
        aria-pressed={shuffle}
        onClick={player.toggleShuffle}
      >
        <ShuffleIcon size={size - 2} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Anterior"
        onClick={player.previous}
        disabled={!player.track}
      >
        <PrevIcon size={size} />
      </button>
      <button
        type="button"
        className="play-button"
        aria-label={player.playing ? "Pausar" : "Tocar"}
        onClick={player.togglePlay}
        disabled={!player.track}
      >
        {player.playing ? (
          <PauseIcon size={size - 2} />
        ) : (
          <PlayIcon size={size - 2} />
        )}
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Próxima"
        onClick={player.next}
        disabled={!player.track}
      >
        <NextIcon size={size} />
      </button>
      <button
        type="button"
        className={`icon-button repeat-button ${repeat !== "off" ? "is-on" : ""}`}
        aria-label={
          repeat === "off"
            ? "Repetir: desligado"
            : repeat === "all"
              ? "Repetir: todas"
              : "Repetir: esta música"
        }
        onClick={player.cycleRepeat}
      >
        <RepeatIcon size={size - 2} />
        {repeat === "one" && <span className="repeat-one">1</span>}
      </button>
    </div>
  );
}

function LikeButton() {
  const player = usePlayer();
  const library = useLibrary();
  if (!player.track) return null;
  const liked = library.isLiked(player.track.id);
  return (
    <button
      type="button"
      className={`icon-button like-button ${liked ? "is-liked" : ""}`}
      aria-label={liked ? "Descurtir" : "Curtir"}
      aria-pressed={liked}
      onClick={() => player.track && library.toggleLike(player.track)}
    >
      {liked ? <HeartIcon size={18} /> : <HeartOutlineIcon size={18} />}
    </button>
  );
}

function NowPlaying({ onClose }: { onClose: () => void }) {
  const player = usePlayer();
  const track = player.track;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!track) return null;
  return (
    <div className="now-playing" role="dialog" aria-label="Tocando agora">
      <div className="now-playing-top">
        <button
          type="button"
          className="icon-button"
          aria-label="Fechar"
          onClick={onClose}
        >
          <ChevronDownIcon size={28} />
        </button>
        <span>Tocando agora</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Fila"
          onClick={() => {
            onClose();
            navigate("/fila");
          }}
        >
          <QueueIcon />
        </button>
      </div>
      <Cover
        src={track.cover}
        alt={`Capa de ${track.album}`}
        className="now-playing-cover"
      />
      <div className="now-playing-info">
        <div>
          <h2>{track.title}</h2>
          <Link to={`/artista/${track.artistId}`} onClick={onClose}>
            {track.artist}
          </Link>
        </div>
        <LikeButton />
      </div>
      <SeekBar />
      <Controls large />
    </div>
  );
}

export function PlayerBar() {
  const player = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const track = player.track;

  return (
    <>
      <footer
        className={`player-bar ${track ? "" : "is-idle"}`}
        aria-label="Player"
      >
        <div className="player-track">
          {track ? (
            <>
              <button
                type="button"
                className="player-cover-button"
                aria-label="Abrir player"
                onClick={() => setExpanded(true)}
              >
                <Cover src={track.cover} alt="" />
              </button>
              <div className="player-text">
                <button
                  type="button"
                  className="player-title"
                  onClick={() => setExpanded(true)}
                >
                  {track.title}
                </button>
                <Link
                  to={`/artista/${track.artistId}`}
                  className="player-artist"
                >
                  {track.artist}
                </Link>
              </div>
              <LikeButton />
            </>
          ) : (
            <span className="player-hint">Escolha uma música para começar</span>
          )}
        </div>
        <div className="player-center">
          <Controls />
          <SeekBar />
          {player.error && (
            <p className="player-error" role="alert">
              {player.error}
            </p>
          )}
        </div>
        <div className="player-side">
          <Link to="/fila" className="icon-button" title="Fila">
            <QueueIcon />
            <span className="visually-hidden">Fila</span>
          </Link>
          <button
            type="button"
            className="icon-button"
            aria-label={player.muted ? "Ativar som" : "Silenciar"}
            onClick={player.toggleMute}
          >
            {player.muted || player.volume === 0 ? (
              <MuteIcon />
            ) : (
              <VolumeIcon />
            )}
          </button>
          <input
            type="range"
            className="range volume"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={player.muted ? 0 : player.volume}
            style={
              {
                "--fill": `${(player.muted ? 0 : player.volume) * 100}%`,
              } as CSSProperties
            }
            onChange={(event) => player.setVolume(Number(event.target.value))}
          />
        </div>
        {/* Mobile mini player: a thin progress line plus play/pause. */}
        <div
          className="mini-progress"
          style={{
            width: `${player.duration ? (player.position / player.duration) * 100 : 0}%`,
          }}
        />
        {track && (
          <button
            type="button"
            className="icon-button mini-play"
            aria-label={player.playing ? "Pausar" : "Tocar"}
            onClick={player.togglePlay}
          >
            {player.playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
          </button>
        )}
      </footer>
      {expanded && <NowPlaying onClose={() => setExpanded(false)} />}
    </>
  );
}
