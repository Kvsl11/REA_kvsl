import type { LyricLine } from "../lyrics/lrc";
import { transposeChord, type ChordSegment } from "./harmony";

export interface ChartChord {
  chord: string;
  /** Seconds. */
  time: number;
  /** Character position in the lyric line the chord sits over. */
  column: number;
}

export interface ChartLine {
  /** Seconds; where the line (or instrumental part) starts. */
  time: number;
  /** Lyric text; empty for instrumental lines. */
  text: string;
  label?: "Intro" | "Instrumental";
  chords: ChartChord[];
}

/** Snaps a column to the start of the word it falls in, so chords sit on syllable starts. */
function wordStart(text: string, column: number): number {
  if (column >= text.length) return column;
  let start = column;
  while (start > 0 && text[start - 1] !== " ") start--;
  // Prefer the nearer word boundary when the chord lands in the middle.
  let end = column;
  while (end < text.length && text[end] !== " ") end++;
  return column - start <= end - column || end >= text.length ? start : end + 1;
}

/**
 * Chord chart ("cifra"): every chord change is placed over the lyric
 * line being sung at that moment, at a column proportional to its time
 * within the line. Chords before the first line form an intro; long gaps
 * between lines become instrumental lines.
 */
export function buildChart(
  lines: LyricLine[],
  chords: ChordSegment[],
  transpose = 0,
): ChartLine[] {
  const changes = chords
    .filter((segment) => segment.chord !== "N")
    .map((segment) => ({
      chord: transposeChord(segment.chord, transpose),
      time: segment.start,
    }));
  // Consecutive equal chords (after N gaps) count once.
  const deduped = changes.filter(
    (change, index) => change.chord !== changes[index - 1]?.chord,
  );

  if (lines.length === 0) {
    return deduped.length
      ? [
          {
            time: deduped[0]!.time,
            text: "",
            label: "Instrumental",
            chords: deduped.map((c) => ({ ...c, column: 0 })),
          },
        ]
      : [];
  }

  const chart: ChartLine[] = [];
  const firstTime = lines[0]!.time;
  const intro = deduped.filter((change) => change.time < firstTime - 0.4);
  if (intro.length > 0) {
    chart.push({
      time: intro[0]!.time,
      text: "",
      label: "Intro",
      chords: intro.map((c) => ({ ...c, column: 0 })),
    });
  }

  let lastShown = intro.at(-1)?.chord ?? null;
  lines.forEach((line, index) => {
    const next = lines[index + 1]?.time ?? Infinity;
    // A line is "sung" for about 0.35 s per character, at most until the next line.
    const sungEnd = Math.min(
      next,
      line.time + Math.max(2, line.text.length * 0.12) + 1,
    );
    const inLine = deduped.filter(
      (change) => change.time >= line.time - 0.4 && change.time < sungEnd,
    );
    const placed: ChartChord[] = [];

    // The chord already ringing when the line starts, if it differs from the last one shown.
    const ringing = [...deduped]
      .reverse()
      .find((change) => change.time < line.time - 0.4);
    if (
      ringing &&
      ringing.chord !== lastShown &&
      (inLine.length === 0 || inLine[0]!.time > line.time + 0.3)
    ) {
      placed.push({ chord: ringing.chord, time: line.time, column: 0 });
    }
    for (const change of inLine) {
      const fraction = Math.max(
        0,
        (change.time - line.time) / Math.max(0.5, sungEnd - line.time),
      );
      const column = wordStart(
        line.text,
        Math.round(fraction * line.text.length),
      );
      placed.push({ ...change, column });
    }
    // Chords never overlap: each starts after the previous one plus a space.
    for (let k = 1; k < placed.length; k++) {
      const minimum = placed[k - 1]!.column + placed[k - 1]!.chord.length + 1;
      if (placed[k]!.column < minimum) placed[k]!.column = minimum;
    }
    chart.push({ time: line.time, text: line.text, chords: placed });
    if (placed.length) lastShown = placed.at(-1)!.chord;

    // Chords in a long gap before the next line: an instrumental part.
    const gap = deduped.filter(
      (change) => change.time >= sungEnd && change.time < next - 0.4,
    );
    if (gap.length > 0 && next - sungEnd > 6) {
      chart.push({
        time: gap[0]!.time,
        text: "",
        label: "Instrumental",
        chords: gap.map((c) => ({ ...c, column: 0 })),
      });
      lastShown = gap.at(-1)!.chord;
    } else if (gap.length > 0) {
      // Short gap: the changes still belong to this line, after its text.
      const line = chart.at(-1)!;
      for (const change of gap) {
        const previous = line.chords.at(-1);
        const column = previous
          ? previous.column + previous.chord.length + 1
          : line.text.length + 1;
        line.chords.push({
          ...change,
          column: Math.max(column, line.text.length + 1),
        });
      }
      lastShown = gap.at(-1)!.chord;
    }
  });
  return chart;
}

/** Two-row text: chords above, lyrics below. */
export function chordRow(line: ChartLine): string {
  if (line.label) return line.chords.map((chord) => chord.chord).join("  ");
  let row = "";
  for (const chord of line.chords) {
    row = row.padEnd(chord.column, " ") + chord.chord;
  }
  return row;
}

/** The chart as plain text, ready to paste anywhere (monospace font). */
export function chartToText(
  chart: ChartLine[],
  meta: { title: string; artist: string; key: string; bpm: number | null },
): string {
  const header = [
    `${meta.title}${meta.artist ? ` — ${meta.artist}` : ""}`,
    [meta.key && `Tom: ${meta.key}`, meta.bpm && `BPM: ${meta.bpm}`]
      .filter(Boolean)
      .join("  "),
    "",
  ];
  const body = chart.flatMap((line) => {
    if (line.label) return [`[${line.label}] ${chordRow(line)}`, ""];
    const chords = chordRow(line);
    return chords ? [chords, line.text] : [line.text];
  });
  return [...header, ...body].join("\n").trimEnd() + "\n";
}

/** The chord sounding at `time` and the next different one. */
export function chordAt(
  chords: ChordSegment[],
  time: number,
): { current: string | null; next: string | null; nextIn: number | null } {
  const index = chords.findIndex(
    (segment) => time >= segment.start && time < segment.end,
  );
  const current =
    index >= 0 && chords[index]!.chord !== "N" ? chords[index]!.chord : null;
  // Only look ahead: before, between or after the segments there is no "current" index.
  const upcoming = chords.find(
    (segment) =>
      segment.start > time &&
      segment.chord !== "N" &&
      segment.chord !== current,
  );
  return {
    current,
    next: upcoming?.chord ?? null,
    nextIn: upcoming ? Math.max(0, upcoming.start - time) : null,
  };
}
