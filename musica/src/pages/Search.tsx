import { useEffect, useRef, useState } from "react";
import { searchAll } from "../api/jamendo";
import { SearchIcon } from "../components/Icons";
import { AlbumCard, ArtistCard, Shelf } from "../components/Shelf";
import { Empty, ErrorMessage, Loading } from "../components/Status";
import { TrackList } from "../components/TrackList";
import { GENRES } from "../genres";
import { Link, navigate } from "../router/router";
import { useAsync } from "../useAsync";

function Results({ query }: { query: string }) {
  const { data, error, loading, retry } = useAsync(
    `search:${query}`,
    (signal) => searchAll(query, signal),
  );
  if (loading) return <Loading label="Buscando…" />;
  if (error) return <ErrorMessage error={error} onRetry={retry} />;
  if (!data) return null;
  if (data.tracks.length + data.albums.length + data.artists.length === 0) {
    return <Empty>Nada encontrado para “{query}”. Tente outra palavra.</Empty>;
  }
  return (
    <>
      {data.tracks.length > 0 && (
        <section className="section">
          <h2>Músicas</h2>
          <TrackList tracks={data.tracks} />
        </section>
      )}
      {data.artists.length > 0 && (
        <Shelf title="Artistas">
          {data.artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </Shelf>
      )}
      {data.albums.length > 0 && (
        <Shelf title="Álbuns">
          {data.albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </Shelf>
      )}
    </>
  );
}

export function Search({ initialQuery }: { initialQuery: string }) {
  const [text, setText] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = initialQuery.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The query this page last wrote to the URL; any other change came from
  // outside (back button, a link) and must replace the typed text.
  const written = useRef(query);
  useEffect(() => {
    if (query !== written.current) {
      written.current = query;
      setText(query);
    }
  }, [query]);

  // Keep the URL in sync (debounced) so results survive reload and back.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === query) return;
    const timer = setTimeout(() => {
      written.current = trimmed;
      navigate(
        trimmed ? `/buscar?q=${encodeURIComponent(trimmed)}` : "/buscar",
        {
          replace: true,
        },
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [text, query]);

  return (
    <div className="page">
      <div className="search-box">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          aria-label="Buscar"
          placeholder="O que você quer ouvir?"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {query ? (
        <Results query={query} />
      ) : (
        <section className="section">
          <h2>Navegar por gênero</h2>
          <div className="genre-grid">
            {GENRES.map((genre) => (
              <Link
                key={genre.tag}
                to={`/genero/${genre.tag}`}
                className="genre-tile"
              >
                <span
                  style={{ background: genre.color }}
                  className="genre-bg"
                />
                <span className="genre-name">{genre.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
