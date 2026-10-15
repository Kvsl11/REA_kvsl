import { getTracks } from "../api/jamendo";
import { CollectionHeader, PlayAllBar } from "../components/CollectionHeader";
import { Empty, ErrorMessage, Loading } from "../components/Status";
import { TrackList } from "../components/TrackList";
import { GENRES, genreName } from "../genres";
import { useAsync } from "../useAsync";

export function GenrePage({ tag }: { tag: string }) {
  const { data, error, loading, retry } = useAsync(`genre:${tag}`, (signal) =>
    getTracks({ tag, order: "popularity_month", limit: 50 }, signal),
  );
  const color = GENRES.find((genre) => genre.tag === tag)?.color ?? "#535353";

  return (
    <div className="page">
      <CollectionHeader
        kind="Gênero"
        title={genreName(tag)}
        coverNode={
          <div
            className="collection-cover genre-cover"
            style={{ background: color }}
          >
            {genreName(tag)}
          </div>
        }
        meta="As mais ouvidas do mês"
      />
      {loading && <Loading />}
      {error && <ErrorMessage error={error} onRetry={retry} />}
      {data && data.length === 0 && <Empty>Nenhuma música neste gênero.</Empty>}
      {data && data.length > 0 && (
        <>
          <PlayAllBar tracks={data} />
          <TrackList tracks={data} />
        </>
      )}
    </div>
  );
}
