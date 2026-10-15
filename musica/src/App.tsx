import { useEffect, useRef, useState } from "react";
import { clearClientId, clientIdFromEnv, getClientId } from "./api/jamendo";
import { BackIcon } from "./components/Icons";
import { PlayerBar } from "./components/PlayerBar";
import { BottomNav, Sidebar } from "./components/Sidebar";
import { Empty } from "./components/Status";
import { ToastProvider } from "./components/Toast";
import { LibraryProvider } from "./library/LibraryContext";
import { AlbumPage } from "./pages/Album";
import { ArtistPage } from "./pages/Artist";
import { GenrePage } from "./pages/Genre";
import { Home } from "./pages/Home";
import {
  LibraryPage,
  LikedPage,
  PlaylistPage,
  QueuePage,
} from "./pages/Library";
import { Search } from "./pages/Search";
import { Setup } from "./pages/Setup";
import { PlayerProvider } from "./player/PlayerContext";
import { match, useRoute, type Route } from "./router/router";

function Page({ route }: { route: Route }) {
  const { path, params } = route;
  if (path === "/") return <Home />;
  if (path === "/buscar")
    return <Search initialQuery={params.get("q") ?? ""} />;
  if (path === "/biblioteca") return <LibraryPage />;
  if (path === "/curtidas") return <LikedPage />;
  if (path === "/fila") return <QueuePage />;

  let found: Record<string, string> | null;
  if ((found = match("/album/:id", path))) return <AlbumPage id={found.id!} />;
  if ((found = match("/artista/:id", path)))
    return <ArtistPage id={found.id!} />;
  if ((found = match("/genero/:tag", path)))
    return <GenrePage tag={found.tag!} />;
  if ((found = match("/playlist/:id", path)))
    return <PlaylistPage id={found.id!} />;
  return <Empty>Página não encontrada.</Empty>;
}

function Shell() {
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);

  // Each navigation starts at the top, like a new page would.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [route.path]);

  return (
    <div className="app">
      <Sidebar path={route.path} />
      <main className="main" ref={mainRef}>
        <div className="topbar">
          <button
            type="button"
            className="icon-button topbar-back"
            aria-label="Voltar"
            onClick={() => window.history.back()}
          >
            <BackIcon />
          </button>
          {!clientIdFromEnv() && (
            <button
              type="button"
              className="button-text topbar-reset"
              title="Trocar o Client ID do Jamendo"
              onClick={() => {
                clearClientId();
                window.location.reload();
              }}
            >
              Trocar Client ID
            </button>
          )}
        </div>
        <Page route={route} />
      </main>
      <PlayerBar />
      <BottomNav path={route.path} />
    </div>
  );
}

export function App() {
  const [hasClientId, setHasClientId] = useState(() => getClientId() !== "");
  if (!hasClientId) return <Setup onDone={() => setHasClientId(true)} />;
  return (
    <ToastProvider>
      <LibraryProvider>
        <PlayerProvider>
          <Shell />
        </PlayerProvider>
      </LibraryProvider>
    </ToastProvider>
  );
}
