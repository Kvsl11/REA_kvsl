import { forEachSpectrum } from "./dsp";

/** Pop-music spelling: sharps except Eb, Ab, Bb. */
export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** Chord-chart spelling: minor chords take sharps (G#m), major ones Eb/Ab/Bb. */
export function noteName(pitchClass: number, minor = false): string {
  const pc = ((pitchClass % 12) + 12) % 12;
  return (minor ? SHARP_NAMES : NOTE_NAMES)[pc]!;
}

const FLAT_TO_SHARP: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

export interface Chroma {
  /** One 12-value pitch-class profile per frame (C … B), max-normalized. */
  frames: Float64Array[];
  /** Loudness of each frame, for skipping silence. */
  energy: Float64Array;
  /** Seconds between frames. */
  hop: number;
}

const CHROMA_FRAME = 4096;
const CHROMA_HOP = 2048;

/** How much of each pitch class sounds in each ~0.1 s frame (65 Hz – 2.1 kHz). */
export function chromagram(samples: Float32Array, sampleRate: number): Chroma {
  const bins = CHROMA_FRAME / 2 + 1;
  const pitchClass = new Int8Array(bins).fill(-1);
  for (let k = 1; k < bins; k++) {
    const frequency = (k * sampleRate) / CHROMA_FRAME;
    if (frequency < 65 || frequency > 2100) continue;
    const midi = Math.round(12 * Math.log2(frequency / 440) + 69);
    pitchClass[k] = ((midi % 12) + 12) % 12;
  }
  const frames: Float64Array[] = [];
  const energies: number[] = [];
  forEachSpectrum(samples, CHROMA_FRAME, CHROMA_HOP, (magnitudes) => {
    const chroma = new Float64Array(12);
    let energy = 0;
    for (let k = 1; k < bins; k++) {
      const pc = pitchClass[k]!;
      if (pc < 0) continue;
      const value = Math.log1p(10 * magnitudes[k]!);
      chroma[pc] = chroma[pc]! + value;
      energy += magnitudes[k]! * magnitudes[k]!;
    }
    const max = Math.max(...chroma) || 1;
    for (let i = 0; i < 12; i++) chroma[i] = chroma[i]! / max;
    frames.push(chroma);
    energies.push(Math.sqrt(energy));
  });
  return {
    frames,
    energy: Float64Array.from(energies),
    hop: CHROMA_HOP / sampleRate,
  };
}

// Krumhansl–Kessler key profiles.
const MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i]!;
    meanB += b[i]!;
  }
  meanA /= n;
  meanB /= n;
  let top = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - meanA;
    const y = b[i]! - meanB;
    top += x * y;
    da += x * x;
    db += y * y;
  }
  return da && db ? top / Math.sqrt(da * db) : 0;
}

export interface KeyResult {
  /** e.g. "C", "F#m". */
  key: string;
  tonic: number;
  minor: boolean;
  /** Correlation of the winner (−1…1); above ~0.6 is a clear key. */
  confidence: number;
}

export function detectKey(chroma: Chroma): KeyResult {
  const total = new Float64Array(12);
  const maxEnergy = Math.max(...chroma.energy, 1e-9);
  chroma.frames.forEach((frame, index) => {
    const weight = chroma.energy[index]! / maxEnergy;
    for (let i = 0; i < 12; i++) total[i] = total[i]! + frame[i]! * weight;
  });
  let best: KeyResult = { key: "C", tonic: 0, minor: false, confidence: -1 };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const profile = minor ? MINOR : MAJOR;
      const rotated = Array.from(
        { length: 12 },
        (_, i) => profile[(i - tonic + 12) % 12]!,
      );
      const score = correlation(total, rotated);
      if (score > best.confidence) {
        best = {
          key: noteName(tonic, minor) + (minor ? "m" : ""),
          tonic,
          minor,
          confidence: score,
        };
      }
    }
  }
  return best;
}

export interface ChordSegment {
  /** Seconds. */
  start: number;
  end: number;
  /** "C", "Am", or "N" for no chord. */
  chord: string;
}

interface Template {
  name: string;
  root: number;
  minor: boolean;
  vector: Float64Array;
}

function templates(): Template[] {
  const list: Template[] = [];
  for (let root = 0; root < 12; root++) {
    for (const minor of [false, true]) {
      const vector = new Float64Array(12);
      vector[root] = 1;
      vector[(root + (minor ? 3 : 4)) % 12] = 0.85;
      vector[(root + 7) % 12] = 0.85;
      list.push({
        name: noteName(root, minor) + (minor ? "m" : ""),
        root,
        minor,
        vector,
      });
    }
  }
  return list;
}

function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Chords of the key get a nudge: songs mostly stay in key. */
function diatonic(key: KeyResult): Set<string> {
  const steps = key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const qualities = key.minor
    ? ["m", "", "", "m", "m", "", ""]
    : ["", "m", "m", "", "", "m", ""];
  const set = new Set<string>();
  steps.forEach((step, i) => {
    if (qualities[i] === "" || qualities[i] === "m") {
      set.add(noteName(key.tonic + step, qualities[i] === "m") + qualities[i]);
    }
  });
  if (key.minor) set.add(noteName(key.tonic + 7)); // V major (harmonic minor)
  return set;
}

/**
 * Chord per frame by template matching, smoothed with Viterbi (changing
 * chord costs something, so noise doesn't flip it), then grouped into
 * segments aligned to beats when available.
 */
export function detectChords(
  chroma: Chroma,
  key: KeyResult,
  beats: number[] = [],
  minSeconds = 0.6,
): ChordSegment[] {
  const list = templates();
  const states = list.length + 1; // + "N"
  const frames = chroma.frames.length;
  if (frames === 0) return [];
  const inKey = diatonic(key);
  const maxEnergy = Math.max(...chroma.energy, 1e-9);
  const switchCost = 0.35;

  const emission = (frame: number, state: number) => {
    const quiet = chroma.energy[frame]! / maxEnergy < 0.04;
    if (state === list.length) return quiet ? 1 : 0.2;
    if (quiet) return 0;
    const template = list[state]!;
    return (
      cosine(chroma.frames[frame]!, template.vector) +
      (inKey.has(template.name) ? 0.06 : 0)
    );
  };

  let score = new Float64Array(states);
  const back: Int16Array[] = [];
  for (let s = 0; s < states; s++) score[s] = emission(0, s);
  for (let t = 1; t < frames; t++) {
    let bestPrev = 0;
    for (let s = 1; s < states; s++)
      if (score[s]! > score[bestPrev]!) bestPrev = s;
    const next = new Float64Array(states);
    const pointers = new Int16Array(states);
    for (let s = 0; s < states; s++) {
      const stay = score[s]!;
      const move = score[bestPrev]! - switchCost;
      if (stay >= move) {
        next[s] = stay + emission(t, s);
        pointers[s] = s;
      } else {
        next[s] = move + emission(t, s);
        pointers[s] = bestPrev;
      }
    }
    back.push(pointers);
    score = next;
  }
  let state = 0;
  for (let s = 1; s < states; s++) if (score[s]! > score[state]!) state = s;
  const path = new Int16Array(frames);
  path[frames - 1] = state;
  for (let t = frames - 1; t > 0; t--) {
    state = back[t - 1]![state]!;
    path[t - 1] = state;
  }
  const label = (s: number) => (s === list.length ? "N" : list[s]!.name);
  const timeOf = (frame: number) =>
    frame * chroma.hop + (CHROMA_FRAME / 2) * (chroma.hop / CHROMA_HOP);

  // Snap to beats: each beat interval takes its most common chord.
  let segments: ChordSegment[] = [];
  if (beats.length > 2) {
    for (let i = 0; i < beats.length; i++) {
      const start = beats[i]!;
      const end = beats[i + 1] ?? start + (beats[i]! - beats[i - 1]!);
      const counts = new Map<string, number>();
      for (let t = 0; t < frames; t++) {
        const time = timeOf(t);
        if (time >= start && time < end)
          counts.set(label(path[t]!), (counts.get(label(path[t]!)) ?? 0) + 1);
      }
      const chord =
        [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N";
      segments.push({ start, end, chord });
    }
    if (beats[0]! > 0.3)
      segments.unshift({ start: 0, end: beats[0]!, chord: "N" });
  } else {
    for (let t = 0; t < frames; t++) {
      segments.push({
        start: timeOf(t) - chroma.hop / 2,
        end: timeOf(t) + chroma.hop / 2,
        chord: label(path[t]!),
      });
    }
    segments[0]!.start = 0;
  }

  segments = merge(segments);
  // Very short chords are usually passing notes or noise: fold into a neighbour.
  let changed = true;
  while (changed && segments.length > 1) {
    changed = false;
    const index = segments.findIndex(
      (segment) => segment.end - segment.start < minSeconds,
    );
    if (index >= 0) {
      const target = index > 0 ? index - 1 : index + 1;
      const keep = segments[target]!;
      const removed = segments[index]!;
      keep.start = Math.min(keep.start, removed.start);
      keep.end = Math.max(keep.end, removed.end);
      segments.splice(index, 1);
      segments = merge(segments);
      changed = true;
    }
  }
  return segments.map((segment) => ({
    start: Math.round(segment.start * 100) / 100,
    end: Math.round(segment.end * 100) / 100,
    chord: segment.chord,
  }));
}

function merge(segments: ChordSegment[]): ChordSegment[] {
  const out: ChordSegment[] = [];
  for (const segment of segments) {
    const last = out.at(-1);
    if (last && last.chord === segment.chord) last.end = segment.end;
    else out.push({ ...segment });
  }
  return out;
}

/** Transposes a chord name, keeping its quality and bass: "F#m7/C#" +2 → "G#m7/D#". */
export function transposeChord(chord: string, semitones: number): string {
  if (chord === "N" || semitones % 12 === 0) return chord;
  const match = /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/.exec(
    chord.trim(),
  );
  if (!match) return chord;
  const [, root, quality = "", bass] = match;
  const shift = (note: string, minor: boolean) => {
    const index = FLAT_TO_SHARP[note];
    return index === undefined ? note : noteName(index + semitones, minor);
  };
  const minor = /^m(?!aj)/.test(quality);
  return shift(root!, minor) + quality + (bass ? `/${shift(bass, false)}` : "");
}

export function transposeKey(key: string, semitones: number): string {
  return transposeChord(key, semitones);
}
