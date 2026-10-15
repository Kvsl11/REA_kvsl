import { useEffect, useRef, useState } from "react";
import type { Track } from "../api/types";
import { useLibrary } from "../library/LibraryContext";
import { usePlayer } from "../player/PlayerContext";
import { navigate } from "../router/router";
import { useAnalyze } from "../ai/AnalyzeUi";
import { useLyricsEditor } from "../lyrics/LyricsUi";
import { useEditor } from "./EditorContext";
import { MoreIcon } from "./Icons";
import { useToast } from "./Toast";

export function TrackMenu({
  track,
  onRemove,
  removeLabel,
  disabled = false,
}: {
  track: Track;
  onRemove?: () => void;
  removeLabel?: string;
  /** The track can't be played (deleted file): only removal is offered. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "playlists">("main");
  const ref = useRef<HTMLDivElement>(null);
  const player = usePlayer();
  const library = useLibrary();
  const toast = useToast();
  const edit = useEditor();
  const editLyrics = useLyricsEditor();
  const analyze = useAnalyze();

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
  const setlists = library.playlists.filter(
    (playlist) => playlist.kind === "setlist",
  );
  const playlists = library.playlists.filter(
    (playlist) => playlist.kind !== "setlist",
  );

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
              {!disabled && (
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
                    Adicionar à playlist ou setlist…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      act(
                        () => library.toggleLike(track),
                        liked
                          ? "Removida das Curtidas"
                          : "Adicionada às Curtidas",
                      )
                    }
                  >
                    {liked ? "Remover das Curtidas" : "Curtir"}
                  </button>
                  <hr />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => act(() => edit(track))}
                  >
                    {track.source === "local"
                      ? "Editar informações"
                      : "Informações de show (tom, BPM)"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => act(() => analyze(track))}
                  >
                    Analisar com IA (letra, BPM, cifra)…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      act(() =>
                        navigate(`/cifra/${encodeURIComponent(track.id)}`),
                      )
                    }
                  >
                    Cifra
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => act(() => editLyrics(track))}
                  >
                    Letra…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      act(() =>
                        navigate(`/faixa/${encodeURIComponent(track.id)}`),
                      )
                    }
                  >
                    Detalhes e estatísticas
                  </button>
                </>
              )}
              {onRemove && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => act(onRemove)}
                >
                  {removeLabel ?? "Remover"}
                </button>
              )}
              {!disabled && (track.artistId || track.albumId) && <hr />}
              {!disabled && track.artistId && (
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
              {!disabled && track.albumId && (
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
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  act(() => {
                    const setlist = library.createPlaylist("", "setlist");
                    library.addToPlaylist(setlist.id, track);
                  }, "Adicionada a um novo setlist")
                }
              >
                + Novo setlist de show
              </button>
              {setlists.length > 0 && (
                <span className="menu-label">Setlists</span>
              )}
              {setlists.map((playlist) => (
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
              {playlists.length > 0 && (
                <span className="menu-label">Playlists</span>
              )}
              {playlists.map((playlist) => (
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
