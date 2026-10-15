import type { ReactNode } from "react";
import { plural } from "../format";
import { useLibrary } from "../library/LibraryContext";
import { Link, navigate } from "../router/router";
import { Cover } from "./Cover";
import {
  HeartIcon,
  HomeIcon,
  LibraryIcon,
  PlusIcon,
  SearchIcon,
} from "./Icons";

function NavLink({
  to,
  current,
  icon,
  label,
}: {
  to: string;
  current: string;
  icon: ReactNode;
  label: string;
}) {
  const active = to === "/" ? current === "/" : current.startsWith(to);
  return (
    <Link to={to} className={`nav-link ${active ? "is-active" : ""}`}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ path }: { path: string }) {
  const library = useLibrary();
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
          {library.playlists.map((playlist) => (
            <li key={playlist.id}>
              <Link
                to={`/playlist/${playlist.id}`}
                className={`library-item ${
                  path === `/playlist/${playlist.id}` ? "is-active" : ""
                }`}
              >
                <Cover src={playlist.tracks[0]?.cover ?? ""} alt="" />
                <span className="library-text">
                  <span className="library-name">{playlist.name}</span>
                  <span className="library-meta">
                    Playlist •{" "}
                    {plural(playlist.tracks.length, "música", "músicas")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function BottomNav({ path }: { path: string }) {
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
        to="/biblioteca"
        current={path}
        icon={<LibraryIcon />}
        label="Biblioteca"
      />
    </nav>
  );
}
