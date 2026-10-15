import { getTracks, type TrackOrder } from "../api/jamendo";
import { ErrorMessage, Loading } from "../components/Status";
import { Shelf, TrackCard } from "../components/Shelf";
import { useAsync } from "../useAsync";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function TrackShelf({
  title,
  order,
  tag,
  moreLink,
}: {
  title: string;
  order: TrackOrder;
  tag?: string;
  moreLink?: string;
}) {
  const { data, error, loading, retry } = useAsync(
    `home:${order}:${tag ?? ""}`,
    (signal) =>
      getTracks({ order, ...(tag ? { tag } : {}), limit: 12 }, signal),
  );
  return (
    <Shelf title={title} {...(moreLink ? { moreLink } : {})}>
      {loading && <Loading />}
      {error && <ErrorMessage error={error} onRetry={retry} />}
      {data?.map((track, index) => (
        <TrackCard key={track.id} tracks={data} index={index} />
      ))}
    </Shelf>
  );
}

export function Home() {
  return (
    <div className="page">
      <h1 className="page-title">{greeting()}</h1>
      <TrackShelf title="Em alta esta semana" order="popularity_week" />
      <TrackShelf title="Lançamentos" order="releasedate_desc" />
      <TrackShelf
        title="Eletrônica"
        order="popularity_month"
        tag="electronic"
        moreLink="/genero/electronic"
      />
      <TrackShelf
        title="Rock"
        order="popularity_month"
        tag="rock"
        moreLink="/genero/rock"
      />
      <TrackShelf
        title="Para relaxar"
        order="popularity_month"
        tag="relaxation"
        moreLink="/genero/relaxation"
      />
      <TrackShelf title="Mais tocadas de sempre" order="popularity_total" />
    </div>
  );
}
