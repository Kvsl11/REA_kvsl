import type { ReactNode } from "react";
import { plural } from "../format";
import { useLibrary } from "../library/LibraryContext";
import { useLocal } from "../local/LocalContext";
import { Link, navigate } from "../router/router";
import { useShow } from "../show/ShowContext";
import { Cover } from "./Cover";
import {
  ChartIcon,
  HeartIcon,
  HomeIcon,
  LibraryIcon,
  MicIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UploadIcon,
} from "./Icons";

function NavLink({
  to,
  current,
  icon,
  label,
  match,
}: {
  to: string;
  current: string;
  icon: ReactNode;
  label: string;
  /** Extra path prefixes that also highlight this link. */
  match?: string[];
}) {
  const active =
    to === "/"
      ? current === "/"
      : [to, ...(match ?? [])].some((prefix) => current.startsWith(prefix));
  return (
    <Link to={to} className={`nav-link ${active ? "is-active" : ""}`}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ path }: { path: string }) {
  const library = useLibrary();
  const local = useLocal();
  const show = useShow();
  return (
    <nav className="sidebar" aria-label="Principal">
      <div className="sidebar-block">
        <Link to="/" className="brand">
          <img src="./favicon.svg" alt="" width={28} height={28} />
          Sonora
        </Link>
        <NavLink to="/" current={path} icon={<HomeIcon />} label="Início" />
        <NavLink
          to="/buscar"
          current={path}
          icon={<SearchIcon />}
          label="Buscar"
        />
        <NavLink
          to="/shows"
          current={path}
          icon={<MicIcon />}
          label="Shows"
          match={["/show/"]}
        />
        {show.active && (
          <Link to="/show/ao-vivo" className="nav-live">
            <span className="rec-dot" aria-hidden="true" /> Gravando show
          </Link>
        )}
        <NavLink
          to="/estatisticas"
          current={path}
          icon={<ChartIcon />}
          label="Estatísticas"
        />
      </div>
      <div className="sidebar-block sidebar-library">
        <div className="library-header">
          <NavLink
            to="/biblioteca"
            current={path}
            icon={<LibraryIcon />}
            label="Sua Biblioteca"
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Criar playlist"
            title="Criar playlist"
            onClick={() =>
              navigate(`/playlist/${library.createPlaylist("").id}`)
            }
          >
            <PlusIcon />
          </button>
        </div>
        <ul className="library-list">
          <li>
            <Link
              to="/curtidas"
              className={`library-item ${path === "/curtidas" ? "is-active" : ""}`}
            >
              <span className="liked-cover">
                <HeartIcon size={18} />
              </span>
              <span className="library-text">
                <span className="library-name">Músicas Curtidas</span>
                <span className="library-meta">
                  Playlist • {plural(library.liked.length, "música", "músicas")}
                </span>
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/suas-musicas"
              className={`library-item ${path === "/suas-musicas" ? "is-active" : ""}`}
            >
              <span className="liked-cover local-art">
                <UploadIcon size={18} />
              </span>
              <span className="library-text">
                <span className="library-name">Suas músicas</span>
                <span className="library-meta">
                  Arquivos • {plural(local.records.length, "música", "músicas")}
                </span>
              </span>
            </Link>
          </li>
          {library.playlists.map((playlist) => {
            const tracks = local.resolveAll(playlist.tracks);
            const isSetlist = playlist.kind === "setlist";
            return (
              <li key={playlist.id}>
                <Link
                  to={`/playlist/${playlist.id}`}
                  className={`library-item ${
                    path === `/playlist/${playlist.id}` ? "is-active" : ""
                  }`}
                >
                  {isSetlist && !tracks[0]?.cover ? (
                    <span className="liked-cover setlist-art">
                      <MicIcon size={18} />
                    </span>
                  ) : (
                    <Cover src={tracks[0]?.cover ?? ""} alt="" />
                  )}
                  <span className="library-text">
                    <span className="library-name">{playlist.name}</span>
                    <span className="library-meta">
                      {isSetlist ? "Setlist" : "Playlist"} •{" "}
                      {plural(tracks.length, "música", "músicas")}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <NavLink
          to="/configuracoes"
          current={path}
          icon={<SettingsIcon />}
          label="Configurações"
        />
      </div>
    </nav>
  );
}

export function BottomNav({ path }: { path: string }) {
  const show = useShow();
  return (
    <nav className="bottom-nav" aria-label="Principal">
      <NavLink to="/" current={path} icon={<HomeIcon />} label="Início" />
      <NavLink
        to="/buscar"
        current={path}
        icon={<SearchIcon />}
        label="Buscar"
      />
      <NavLink
        to={show.active ? "/show/ao-vivo" : "/shows"}
        current={path}
        icon={
          <span className="nav-icon-wrap">
            <MicIcon />
            {show.active && (
              <span className="rec-dot nav-rec" aria-label="gravando" />
            )}
          </span>
        }
        label="Shows"
        match={["/shows", "/show/"]}
      />
      <NavLink
        to="/estatisticas"
        current={path}
        icon={<ChartIcon />}
        label="Estatísticas"
      />
      <NavLink
        to="/biblioteca"
        current={path}
        icon={<LibraryIcon />}
        label="Biblioteca"
        match={["/curtidas", "/playlist/", "/suas-musicas", "/configuracoes"]}
      />
    </nav>
  );
}
