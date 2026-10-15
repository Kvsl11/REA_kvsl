/**
 * LRC: the common format for synced lyrics.
 *
 *   [ti:Song]            metadata tags (ignored)
 *   [offset:+250]        shift in ms; positive shows lyrics earlier
 *   [00:12.34]First line
 *   [00:15.00][01:20.5]A repeated chorus line
 *   [00:18.20]<00:18.20>Word <00:18.70>by <00:19.10>word   (enhanced LRC)
 */

export interface LyricLine {
  /** Seconds from the start of the song. */
  time: number;
  text: string;
}

const LEADING_STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
const OFFSET = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i;

function stampSeconds(
  minutes: string,
  seconds: string,
  fraction: string | undefined,
): number {
  const frac = fraction ? Number(fraction) / 10 ** fraction.length : 0;
  return Number(minutes) * 60 + Number(seconds) + frac;
}

/** True when the text has at least one timed line. */
export function isLrc(text: string): boolean {
  return /^\s*(\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/m.test(text);
}

export function parseLrc(text: string): {
  lines: LyricLine[];
  offsetMs: number;
} {
  const lines: LyricLine[] = [];
  let offsetMs = 0;
  for (const raw of text.split(/\r?\n/)) {
    const offset = OFFSET.exec(raw);
    if (offset) {
      offsetMs = Number(offset[1]);
      continue;
    }
    const times: number[] = [];
    let rest = raw.trim();
    // Timestamps sit at the start of the line; text follows the last one.
    let match: RegExpExecArray | null;
    while ((match = LEADING_STAMP.exec(rest))) {
      times.push(stampSeconds(match[1]!, match[2]!, match[3]));
      rest = rest.slice(match[0].length);
    }
    if (times.length === 0) continue;
    const lineText = rest.replace(WORD_STAMP, "").replace(/\s+/g, " ").trim();
    for (const time of times) lines.push({ time, text: lineText });
  }
  lines.sort((a, b) => a.time - b.time);
  return { lines, offsetMs };
}

/** The lyrics as plain text (one line per timed line, blanks dropped at the ends). */
export function lrcToPlain(text: string): string {
  if (!isLrc(text)) return text.trim();
  return parseLrc(text)
    .lines.map((line) => line.text)
    .join("\n")
    .trim();
}

function stamp(seconds: number): string {
  const centis = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(centis / 6000);
  const secs = Math.floor((centis % 6000) / 100);
  const hundredths = centis % 100;
  return `[${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(
    hundredths,
  ).padStart(2, "0")}]`;
}

export function toLrc(
  lines: LyricLine[],
  meta: { title?: string; artist?: string } = {},
): string {
  const header = [
    meta.artist ? `[ar:${meta.artist}]` : "",
    meta.title ? `[ti:${meta.title}]` : "",
  ].filter(Boolean);
  const body = [...lines]
    .sort((a, b) => a.time - b.time)
    .map((line) => `${stamp(line.time)}${line.text}`);
  return [...header, ...body].join("\n");
}

/**
 * Index of the line being sung at `time` seconds (with the user's offset
 * applied), or -1 before the first line.
 */
export function activeLine(
  lines: LyricLine[],
  time: number,
  offsetMs = 0,
): number {
  const t = time + offsetMs / 1000;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid]!.time <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** Lines to sync by tapping: the text's non-empty lines. */
export function linesForSync(text: string): string[] {
  const plain = isLrc(text) ? lrcToPlain(text) : text;
  return plain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
