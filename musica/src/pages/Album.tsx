import { getAlbum } from "../api/jamendo";
import { CollectionHeader, PlayAllBar } from "../components/CollectionHeader";
import { Empty, ErrorMessage, Loading } from "../components/Status";
import { TrackList } from "../components/TrackList";
import { formatTotal, plural } from "../format";
import { Link } from "../router/router";
import { useAsync } from "../useAsync";

export function AlbumPage({ id }: { id: string }) {
  const { data, error, loading, retry } = useAsync(`album:${id}`, (signal) =>
    getAlbum(id, signal),
  );
  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} onRetry={retry} />;
  if (!data?.album) return <Empty>Álbum não encontrado.</Empty>;

  const { album, tracks } = data;
  const total = tracks.reduce((sum, track) => sum + track.duration, 0);
  return (
    <div className="page">
      <CollectionHeader
        kind="Álbum"
        title={album.title}
        cover={album.cover}
        meta={
          <>
            <Link to={`/artista/${album.artistId}`} className="strong-link">
              {album.artist}
            </Link>
            {album.releaseDate && <> • {album.releaseDate.slice(0, 4)}</>}
            {" • "}
            {plural(tracks.length, "música", "músicas")}, {formatTotal(total)}
          </>
        }
      />
      <PlayAllBar tracks={tracks} />
      <TrackList tracks={tracks} showAlbum={false} showCover={false} />
      {tracks[0]?.licenseUrl && (
        <p className="license">
          Licença:{" "}
          <a href={tracks[0].licenseUrl} target="_blank" rel="noreferrer">
            Creative Commons
          </a>
        </p>
      )}
    </div>
  );
}
