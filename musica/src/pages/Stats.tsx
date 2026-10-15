import { useMemo, useState } from "react";
import { ChartIcon } from "../components/Icons";
import { Empty, Loading } from "../components/Status";
import {
  formatAgo,
  formatDateTime,
  formatDuration,
  formatTime,
  plural,
} from "../format";
import { Link } from "../router/router";
import { useShow } from "../show/ShowContext";
import { useHistory } from "../stats/HistoryContext";
import {
  localDay,
  summarize,
  type PlayScope,
  type StatsSummary,
} from "../stats/plays";

type Period = "7d" | "30d" | "12m" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "12m", label: "12 meses" },
  { id: "all", label: "Tudo" },
];

const SCOPES: { id: PlayScope; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "listening", label: "Ouvindo" },
  { id: "shows", label: "Em shows" },
];

function periodStart(period: Period, now: number): number | undefined {
  const day = 86_400_000;
  const startOfToday = new Date(new Date(now).toDateString()).getTime();
  if (period === "7d") return startOfToday - 6 * day;
  if (period === "30d") return startOfToday - 29 * day;
  if (period === "12m") {
    const date = new Date(now);
    return new Date(date.getFullYear() - 1, date.getMonth() + 1, 1).getTime();
  }
  return undefined;
}

interface Bucket {
  key: string;
  label: string;
  title: string;
  seconds: number;
}

const MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Every day (short periods) or month (long ones) in the range, including empty ones. */
function buckets(
  summary: StatsSummary,
  period: Period,
  from: number | undefined,
  now: number,
) {
  const perDay = new Map(summary.days.map((day) => [day.day, day.seconds]));
  const result: Bucket[] = [];
  if (period === "7d" || period === "30d") {
    for (let t = from!; t <= now; t += 86_400_000) {
      const key = localDay(t);
      const date = new Date(t);
      result.push({
        key,
        label:
          period === "7d"
            ? date
                .toLocaleDateString("pt-BR", { weekday: "short" })
                .replace(".", "")
            : String(date.getDate()),
        title: date.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
        }),
        seconds: perDay.get(key) ?? 0,
      });
    }
    return result;
  }
  const perMonth = new Map<string, number>();
  for (const day of summary.days) {
    const key = day.day.slice(0, 7);
    perMonth.set(key, (perMonth.get(key) ?? 0) + day.seconds);
  }
  const first =
    from ??
    (summary.days[0]
      ? new Date(`${summary.days[0].day}T00:00`).getTime()
      : now);
  const cursor = new Date(first);
  cursor.setDate(1);
  const end = new Date(now);
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    result.push({
      key,
      label: MONTHS[cursor.getMonth()]!,
      title: `${MONTHS[cursor.getMonth()]} de ${cursor.getFullYear()}`,
      seconds: perMonth.get(key) ?? 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

function ListeningChart({ data }: { data: Bucket[] }) {
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(...data.map((item) => item.seconds), 1);
  // Label every bar when few, otherwise thin the axis out.
  const step = data.length <= 12 ? 1 : Math.ceil(data.length / 10);
  const peak = data.reduce(
    (best, item) => (item.seconds > best.seconds ? item : best),
    data[0]!,
  );

  return (
    <section className="panel chart-panel">
      <header className="chart-header">
        <div>
          <h2>
            Tempo de música por{" "}
            {data.length > 0 && data[0]!.key.length > 7 ? "dia" : "mês"}
          </h2>
          {peak && peak.seconds > 0 && (
            <p className="chart-sub">
              Pico: {formatDuration(peak.seconds)} em {peak.title}
            </p>
          )}
        </div>
        <button
          type="button"
          className="button-text"
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? "Ver gráfico" : "Ver tabela"}
        </button>
      </header>
      {asTable ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Período</th>
              <th>Tempo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.key}>
                <td>{item.title}</td>
                <td>{formatDuration(item.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className="bar-chart"
          role="list"
          aria-label="Tempo de música por período"
        >
          {data.map((item, index) => (
            <div
              key={item.key}
              className="bar-slot"
              role="listitem"
              tabIndex={0}
              aria-label={`${item.title}: ${formatDuration(item.seconds)}`}
            >
              <div className="bar-track">
                <div
                  className={`bar ${item.seconds === 0 ? "bar-empty" : ""}`}
                  style={{ height: `${(item.seconds / max) * 100}%` }}
                />
              </div>
              <span className="bar-label" aria-hidden="true">
                {index % step === 0 ? item.label : ""}
              </span>
              <span className="bar-tooltip" role="tooltip">
                <strong>{formatDuration(item.seconds)}</strong>
                {item.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RankList<T extends { plays: number; seconds: number }>({
  title,
  items,
  render,
  empty,
}: {
  title: string;
  items: T[];
  render: (item: T) => { key: string; name: React.ReactNode; detail: string };
  empty: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items.slice(0, 50) : items.slice(0, 10);
  const max = Math.max(...items.map((item) => item.seconds), 1);
  return (
    <section className="panel">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ol className="rank-list">
          {shown.map((item, index) => {
            const { key, name, detail } = render(item);
            return (
              <li key={key}>
                <span className="rank-pos">{index + 1}</span>
                <span className="rank-body">
                  <span className="rank-name">{name}</span>
                  <span className="rank-detail">{detail}</span>
                  <span
                    className="rank-bar"
                    style={{ width: `${(item.seconds / max) * 100}%` }}
                  />
                </span>
                <span className="rank-value">
                  {plural(item.plays, "vez", "vezes")}
                  <small>{formatDuration(item.seconds)}</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {items.length > 10 && (
        <button
          type="button"
          className="button-text"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Mostrar menos" : "Mostrar mais"}
        </button>
      )}
    </section>
  );
}

export function StatsPage() {
  const history = useHistory();
  const show = useShow();
  const [period, setPeriod] = useState<Period>("30d");
  const [scope, setScope] = useState<PlayScope>("all");
  const now = Date.now();
  const from = periodStart(period, now);

  const summary = useMemo(
    () =>
      summarize(history.statsPlays, {
        ...(from !== undefined ? { from } : {}),
        scope,
      }),
    // `from` is derived from `period`; recomputing each render would be wasted work.
    [history.statsPlays, period, scope],
  );
  const showsInPeriod = show.sessions.filter(
    (session) => from === undefined || session.startedAt >= from,
  );
  const showSeconds = showsInPeriod.reduce(
    (sum, session) =>
      sum + ((session.endedAt ?? now) - session.startedAt) / 1000,
    0,
  );

  if (!history.loaded || !show.loaded) return <Loading />;

  return (
    <div className="page">
      <h1 className="page-title">Estatísticas</h1>
      <div className="filter-bar">
        <div className="chip-group" role="group" aria-label="Período">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip-button ${period === item.id ? "is-active" : ""}`}
              aria-pressed={period === item.id}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="chip-group" role="group" aria-label="Origem">
          {SCOPES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip-button ${scope === item.id ? "is-active" : ""}`}
              aria-pressed={scope === item.id}
              onClick={() => setScope(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-value">{formatDuration(summary.seconds)}</span>
          <span className="stat-label">de música</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{summary.plays}</span>
          <span className="stat-label">vezes tocadas</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{summary.distinctTracks}</span>
          <span className="stat-label">músicas diferentes</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{showsInPeriod.length}</span>
          <span className="stat-label">
            {showsInPeriod.length === 1 ? "show" : "shows"} •{" "}
            {formatDuration(showSeconds)}
          </span>
        </div>
      </div>

      {summary.seconds === 0 ? (
        <div className="empty-hero">
          <ChartIcon size={40} />
          <h2>Nada por aqui ainda</h2>
          <p>
            Ouça músicas ou grave um show: o tempo, as vezes que cada música
            tocou e os artistas mais ouvidos aparecem aqui. Uma música conta
            como tocada depois de 30 segundos.
          </p>
        </div>
      ) : (
        <>
          <ListeningChart data={buckets(summary, period, from, now)} />
          <div className="detail-grid">
            <RankList
              title="Músicas mais tocadas"
              items={summary.tracks}
              empty="Nenhuma música."
              render={(item) => ({
                key: item.trackId,
                name: (
                  <Link
                    to={`/faixa/${encodeURIComponent(item.trackId)}`}
                    className="strong-link"
                  >
                    {item.title}
                  </Link>
                ),
                detail: `${item.artist || "Artista desconhecido"} • ${formatAgo(item.lastPlayed, now)}`,
              })}
            />
            <RankList
              title="Artistas mais ouvidos"
              items={summary.artists}
              empty="Nenhum artista."
              render={(item) => ({
                key: item.artist,
                name: item.artist,
                detail: plural(item.tracks, "música", "músicas"),
              })}
            />
          </div>
        </>
      )}

      <RecentPlays />
    </div>
  );
}

function RecentPlays() {
  const history = useHistory();
  const [limit, setLimit] = useState(20);
  const plays = history.plays.slice(0, limit);
  return (
    <section className="section">
      <div className="page-title-row">
        <h2>Tocadas recentemente</h2>
        {history.plays.length > 0 && (
          <button
            type="button"
            className="button-text"
            onClick={() => {
              if (
                window.confirm(
                  "Apagar todo o histórico de reprodução? Os shows gravados continuam.",
                )
              ) {
                void history.clearHistory();
              }
            }}
          >
            Apagar histórico
          </button>
        )}
      </div>
      {plays.length === 0 ? (
        <Empty>Nenhuma música ouvida ainda.</Empty>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Música</th>
              <th>Quando</th>
              <th>Ouvida por</th>
            </tr>
          </thead>
          <tbody>
            {plays.map((play) => (
              <tr key={play.id}>
                <td>
                  <Link
                    to={`/faixa/${encodeURIComponent(play.trackId)}`}
                    className="strong-link"
                  >
                    {play.title}
                  </Link>
                  <span className="cell-sub">{play.artist}</span>
                </td>
                <td>{formatDateTime(play.startedAt)}</td>
                <td>
                  {formatTime(play.seconds)}
                  {play.completed && (
                    <span className="cell-sub">até o fim</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {history.plays.length > limit && (
        <button
          type="button"
          className="button-text"
          onClick={() => setLimit((v) => v + 50)}
        >
          Mostrar mais
        </button>
      )}
    </section>
  );
}
