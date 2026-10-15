import type { LyricLine } from "../lyrics/lrc";

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

/** Lowercase, no accents, no punctuation: "Coração," → "coracao". */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9']/g, "")
    .replace(/'/g, "");
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = temp;
    }
  }
  return row[b.length]!;
}

/** 1 for equal words, partial credit for near misses ("cancao" ~ "cansao"). */
export function wordSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  const ratio = 1 - editDistance(a, b) / longest;
  return ratio >= 0.7 ? ratio : 0;
}

export interface AlignmentResult {
  lines: LyricLine[];
  /** Share of lyric words found in the recognized audio (0–1). */
  coverage: number;
}

/**
 * Times known lyrics against recognized speech: a global alignment of the
 * two word sequences (like a text diff, tolerant to recognition mistakes),
 * then each line starts where its first matched word was heard. Lines
 * with no match are placed between their neighbours.
 */
export function alignLyrics(
  lyricLines: string[],
  heard: TimedWord[],
): AlignmentResult {
  const tokens: { word: string; line: number; position: number }[] = [];
  lyricLines.forEach((line, lineIndex) => {
    line
      .split(/\s+/)
      .map(normalizeWord)
      .filter(Boolean)
      .forEach((word, position) =>
        tokens.push({ word, line: lineIndex, position }),
      );
  });
  const recognized = heard
    .flatMap((word) => {
      // Recognizers sometimes return short phrases as one "word".
      const parts = word.text.split(/\s+/).map(normalizeWord).filter(Boolean);
      const span = (word.end - word.start) / Math.max(1, parts.length);
      return parts.map((part, i) => ({
        word: part,
        start: word.start + i * span,
        end: word.start + (i + 1) * span,
      }));
    })
    .filter((word) => word.word);

  const n = tokens.length;
  const m = recognized.length;
  const gap = -0.4;
  // DP over (lyric token, recognized word).
  const score = new Float64Array((n + 1) * (m + 1));
  const move = new Uint8Array((n + 1) * (m + 1)); // 1 diag, 2 up (skip lyric), 3 left (skip heard)
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = 1; i <= n; i++) {
    score[at(i, 0)] = i * gap;
    move[at(i, 0)] = 2;
  }
  // Leading speech/noise before the lyrics costs nothing.
  for (let j = 1; j <= m; j++) move[at(0, j)] = 3;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const similarity = wordSimilarity(
        tokens[i - 1]!.word,
        recognized[j - 1]!.word,
      );
      const diag =
        score[at(i - 1, j - 1)]! + (similarity > 0 ? 2 * similarity : -1);
      const up = score[at(i - 1, j)]! + gap;
      const left = score[at(i, j - 1)]! + (i === n ? 0 : gap);
      if (diag >= up && diag >= left) {
        score[at(i, j)] = diag;
        move[at(i, j)] = 1;
      } else if (up >= left) {
        score[at(i, j)] = up;
        move[at(i, j)] = 2;
      } else {
        score[at(i, j)] = left;
        move[at(i, j)] = 3;
      }
    }
  }

  const matchOf = Array.from({ length: n }, () => -1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = move[at(i, j)];
    if (step === 1) {
      if (wordSimilarity(tokens[i - 1]!.word, recognized[j - 1]!.word) > 0)
        matchOf[i - 1] = j - 1;
      i--;
      j--;
    } else if (step === 2) {
      i--;
    } else {
      j--;
    }
  }

  // Typical sung word length, to back-date a line whose first words were missed.
  const durations = recognized
    .map((word) => word.end - word.start)
    .filter((d) => d > 0);
  const wordLength = Math.min(
    0.6,
    durations.length
      ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]!
      : 0.35,
  );

  const starts: (number | null)[] = lyricLines.map(() => null);
  tokens.forEach((token, index) => {
    const match = matchOf[index]!;
    if (match < 0 || starts[token.line] !== null) return;
    starts[token.line] = Math.max(
      0,
      recognized[match]!.start - token.position * wordLength,
    );
  });

  const matched = matchOf.filter((match) => match >= 0).length;
  return {
    lines: fillGaps(lyricLines, starts, recognized.at(-1)?.end ?? 0),
    coverage: n ? matched / n : 0,
  };
}

/** Gives unmatched lines a time between their timed neighbours, keeping order. */
function fillGaps(
  texts: string[],
  starts: (number | null)[],
  audioEnd: number,
): LyricLine[] {
  const times = [...starts];
  // Enforce increasing anchors: an out-of-order match is dropped.
  let last = -Infinity;
  for (let k = 0; k < times.length; k++) {
    if (times[k] === null) continue;
    if (times[k]! <= last) times[k] = null;
    else last = times[k]!;
  }
  const anchors = times.flatMap((time, index) =>
    time === null ? [] : [index],
  );
  if (anchors.length === 0) {
    const step = audioEnd > 0 ? audioEnd / (texts.length + 1) : 3;
    return texts.map((text, index) => ({
      text,
      time: round(step * (index + 0.5)),
    }));
  }
  const weight = (index: number) => Math.max(1, texts[index]!.length);
  for (let k = 0; k < times.length; k++) {
    if (times[k] !== null) continue;
    const before = anchors.filter((a) => a < k).at(-1);
    const after = anchors.find((a) => a > k);
    if (before !== undefined && after !== undefined) {
      // Share the time between anchors by line length.
      let total = 0;
      let upTo = 0;
      for (let x = before; x < after; x++) {
        total += weight(x);
        if (x < k) upTo += weight(x);
      }
      times[k] =
        times[before]! + ((times[after]! - times[before]!) * upTo) / total;
    } else if (after !== undefined) {
      times[k] = Math.max(0, times[after]! - (after - k) * 3);
    } else {
      times[k] = times[before!]! + (k - before!) * 3;
    }
  }
  // Interpolation can still tie: nudge to strictly increasing.
  for (let k = 1; k < times.length; k++) {
    if (times[k]! <= times[k - 1]!) times[k] = times[k - 1]! + 0.1;
  }
  return texts.map((text, index) => ({ text, time: round(times[index]!) }));
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Lines from raw recognized words, when there are no lyrics to align:
 * break at pauses, at sentence ends, or when a line gets long.
 */
export function wordsToLines(words: TimedWord[]): LyricLine[] {
  const lines: LyricLine[] = [];
  let current: TimedWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const text = current
      .map((word) => word.text.trim())
      .join(" ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();
    if (text)
      lines.push({ time: round(current[0]!.start), text: capitalize(text) });
    current = [];
  };
  words.forEach((word, index) => {
    const previous = words[index - 1];
    if (previous && current.length > 0) {
      const pause = word.start - previous.end;
      const sentenceEnd = /[.!?]$/.test(previous.text.trim());
      if (
        pause > 0.7 ||
        current.length >= 9 ||
        (sentenceEnd && current.length >= 3)
      )
        flush();
    }
    current.push(word);
  });
  flush();
  return lines;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
