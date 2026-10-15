import { useEffect, useRef, useState } from "react";
import type { Track } from "../api/types";
import { useLibrary } from "../library/LibraryContext";
import { usePlayer } from "../player/PlayerContext";
import { navigate } from "../router/router";
import { MoreIcon } from "./Icons";
import { useToast } from "./Toast";

export function TrackMenu({
  track,
  onRemove,
  removeLabel,
}: {
  track: Track;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "playlists">("main");
  const ref = useRef<HTMLDivElement>(null);
  const player = usePlayer();
  const library = useLibrary();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const act = (action: () => void, message?: string) => {
    action();
    setOpen(false);
    if (message) toast(message);
  };

  const liked = library.isLiked(track.id);

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className="icon-button row-action"
        aria-label={`Mais opções para ${track.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setView("main");
          setOpen((value) => !value);
        }}
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          className="menu"
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          {view === "main" ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  act(() => player.playNext(track), "Vai tocar em seguida")
                }
              >
                Tocar em seguida
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  act(() => player.enqueue(track), "Adicionada à fila")
                }
              >
                Adicionar à fila
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setView("playlists")}
              >
                Adicionar à playlist…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  act(
                    () => library.toggleLike(track),
                    liked ? "Removida das Curtidas" : "Adicionada às Curtidas",
                  )
                }
              >
                {liked ? "Remover das Curtidas" : "Curtir"}
              </button>
              {onRemove && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => act(onRemove)}
                >
                  {removeLabel ?? "Remover"}
                </button>
              )}
              <hr />
              {track.artistId && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    act(() => navigate(`/artista/${track.artistId}`))
                  }
                >
                  Ir para o artista
                </button>
              )}
              {track.albumId && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => act(() => navigate(`/album/${track.albumId}`))}
                >
                  Ir para o álbum
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  act(() => {
                    const playlist = library.createPlaylist("");
                    library.addToPlaylist(playlist.id, track);
                  }, "Adicionada a uma nova playlist")
                }
              >
                + Nova playlist
              </button>
              {library.playlists.map((playlist) => (
                <button
                  type="button"
                  role="menuitem"
                  key={playlist.id}
                  onClick={() =>
                    act(
                      () => library.addToPlaylist(playlist.id, track),
                      `Adicionada a ${playlist.name}`,
                    )
                  }
                >
                  {playlist.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
