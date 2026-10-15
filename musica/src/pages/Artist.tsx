import { getArtist } from "../api/jamendo";
import { CollectionHeader, PlayAllBar } from "../components/CollectionHeader";
import { AlbumCard, Shelf } from "../components/Shelf";
import { Empty, ErrorMessage, Loading } from "../components/Status";
import { TrackList } from "../components/TrackList";
import { useAsync } from "../useAsync";

export function ArtistPage({ id }: { id: string }) {
  const { data, error, loading, retry } = useAsync(`artist:${id}`, (signal) =>
    getArtist(id, signal),
  );
  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} onRetry={retry} />;
  if (!data?.artist) return <Empty>Artista não encontrado.</Empty>;

  const { artist, tracks, albums } = data;
  return (
    <div className="page">
      <CollectionHeader
        kind="Artista"
        title={artist.name}
        cover={artist.image || tracks[0]?.cover || ""}
        round
        meta={<>{albums.length > 0 && `${albums.length} álbuns no Jamendo`}</>}
      />
      <PlayAllBar tracks={tracks} />
      <section className="section">
        <h2>Populares</h2>
        {tracks.length > 0 ? (
          <TrackList tracks={tracks.slice(0, 10)} showAlbum={false} />
        ) : (
          <Empty>Sem músicas disponíveis.</Empty>
        )}
      </section>
      {albums.length > 0 && (
        <Shelf title="Discografia">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </Shelf>
      )}
    </div>
  );
}
