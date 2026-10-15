import { useEffect, useRef, useState } from "react";
import { getClientId } from "./api/jamendo";
import { AnalysisProvider } from "./ai/AnalysisContext";
import { AnalyzeUiProvider } from "./ai/AnalyzeUi";
import { EditorProvider } from "./components/EditorContext";
import { BackIcon, SettingsIcon } from "./components/Icons";
import { PlayerBar } from "./components/PlayerBar";
import { BottomNav, Sidebar } from "./components/Sidebar";
import { Empty } from "./components/Status";
import { ToastProvider } from "./components/Toast";
import { LibraryProvider } from "./library/LibraryContext";
import { LocalProvider } from "./local/LocalContext";
import { LyricsProvider } from "./lyrics/LyricsContext";
import { LyricsUiProvider } from "./lyrics/LyricsUi";
import { AlbumPage } from "./pages/Album";
import { ArtistPage } from "./pages/Artist";
import { CifraPage } from "./pages/Cifra";
import { GenrePage } from "./pages/Genre";
import { Home } from "./pages/Home";
import {
  LibraryPage,
  LikedPage,
  PlaylistPage,
  QueuePage,
} from "./pages/Library";
import { LiveShowPage } from "./pages/LiveShow";
import { LyricsPage, LyricsSyncPage } from "./pages/Lyrics";
import { LocalMusicPage } from "./pages/LocalMusic";
import { Search } from "./pages/Search";
import { SettingsPage } from "./pages/Settings";
import { Setup, setupDone } from "./pages/Setup";
import { ShowReportPage } from "./pages/ShowReport";
import { ShowsPage } from "./pages/Shows";
import { StatsPage } from "./pages/Stats";
import { TrackDetailPage } from "./pages/TrackDetail";
import { PlayerProvider } from "./player/PlayerContext";
import { Link, match, useRoute, type Route } from "./router/router";
import { ShowProvider } from "./show/ShowContext";
import { HistoryProvider } from "./stats/HistoryContext";

function Page({ route }: { route: Route }) {
  const { path, params } = route;
  switch (path) {
    case "/":
      return <Home />;
    case "/buscar":
      return <Search initialQuery={params.get("q") ?? ""} />;
    case "/biblioteca":
      return <LibraryPage />;
    case "/curtidas":
      return <LikedPage />;
    case "/fila":
      return <QueuePage />;
    case "/suas-musicas":
      return <LocalMusicPage />;
    case "/shows":
      return <ShowsPage />;
    case "/show/ao-vivo":
      return <LiveShowPage />;
    case "/estatisticas":
      return <StatsPage />;
    case "/configuracoes":
      return <SettingsPage />;
    case "/letra":
      return <LyricsPage />;
  }

  let found: Record<string, string> | null;
  if ((found = match("/album/:id", path))) return <AlbumPage id={found.id!} />;
  if ((found = match("/artista/:id", path)))
    return <ArtistPage id={found.id!} />;
  if ((found = match("/genero/:tag", path)))
    return <GenrePage tag={found.tag!} />;
  if ((found = match("/playlist/:id", path)))
    return <PlaylistPage key={found.id} id={found.id!} />;
  if ((found = match("/faixa/:id", path)))
    return <TrackDetailPage key={found.id} id={found.id!} />;
  if ((found = match("/cifra/:id", path)))
    return <CifraPage key={found.id} id={found.id!} />;
  if ((found = match("/letra/sincronizar/:id", path)))
    return <LyricsSyncPage key={found.id} id={found.id!} />;
  if ((found = match("/show/:id", path)))
    return <ShowReportPage id={found.id!} />;
  return <Empty>Página não encontrada.</Empty>;
}

function Shell() {
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  const liveShow = route.path === "/show/ao-vivo";
  const lyricsPage = route.path === "/letra";

  // Each navigation starts at the top, like a new page would.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [route.path]);

  return (
    <div
      className={`app ${liveShow ? "is-live-show" : ""} ${lyricsPage ? "is-lyrics" : ""}`}
    >
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
          <Link
            to="/configuracoes"
            className="icon-button topbar-settings"
            title="Configurações"
          >
            <SettingsIcon />
            <span className="visually-hidden">Configurações</span>
          </Link>
        </div>
        <Page route={route} />
      </main>
      <PlayerBar />
      <BottomNav path={route.path} />
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(() => setupDone() || getClientId() !== "");
  if (!ready) return <Setup onDone={() => setReady(true)} />;
  return (
    <ToastProvider>
      <LocalProvider>
        <LibraryProvider>
          <PlayerProvider>
            <ShowProvider>
              <HistoryProvider>
                <LyricsProvider>
                  <EditorProvider>
                    <LyricsUiProvider>
                      <AnalysisProvider>
                        <AnalyzeUiProvider>
                          <Shell />
                        </AnalyzeUiProvider>
                      </AnalysisProvider>
                    </LyricsUiProvider>
                  </EditorProvider>
                </LyricsProvider>
              </HistoryProvider>
            </ShowProvider>
          </PlayerProvider>
        </LibraryProvider>
      </LocalProvider>
    </ToastProvider>
  );
}
