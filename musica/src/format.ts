export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}`
    : `${minutes}:${secs}`;
}

export function formatTotal(seconds: number): string {
  if (seconds > 0 && seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3)
    return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
}

/** "1 h 02 min", "12 min", "45 s" — for listening totals. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

/** Stopwatch style: "1:02:05" or "02:05". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${secs}` : `${minutes}:${secs}`;
}

/** "+0:35" / "-1:10" — how far a song ran over or under its planned time. */
export function formatDiff(seconds: number): string {
  const rounded = Math.round(seconds);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

export function formatDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeOfDay(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "agora", "há 5 min", "há 3 h", "ontem", "12/03". */
export function formatAgo(epochMs: number, now = Date.now()): string {
  const diff = Math.max(0, now - epochMs) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return "ontem";
  return new Date(epochMs).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}
