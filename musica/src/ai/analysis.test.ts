import { describe, expect, it } from "vitest";
import { fft } from "./dsp";
import { chromagram, detectChords, detectKey, transposeChord } from "./harmony";
import { detectTempo } from "./tempo";

const RATE = 22050;
const NOTE = (name: string, octave: number) => {
  const index = [
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
  ].indexOf(name);
  return 440 * 2 ** ((index - 9) / 12 + (octave - 4));
};

const CHORDS: Record<string, [string, number][]> = {
  C: [
    ["C", 3],
    ["E", 3],
    ["G", 3],
    ["C", 4],
  ],
  G: [
    ["G", 2],
    ["B", 2],
    ["D", 3],
    ["G", 3],
  ],
  Am: [
    ["A", 2],
    ["C", 3],
    ["E", 3],
    ["A", 3],
  ],
  F: [
    ["F", 2],
    ["A", 2],
    ["C", 3],
    ["F", 3],
  ],
};

/** A little "band": sustained chords with harmonics plus a kick on every beat. */
function song(
  progression: string[],
  secondsPerChord: number,
  bpm: number,
): Float32Array {
  const samples = new Float32Array(
    Math.round(progression.length * secondsPerChord * RATE),
  );
  progression.forEach((name, index) => {
    const start = Math.round(index * secondsPerChord * RATE);
    const length = Math.round(secondsPerChord * RATE);
    for (const [note, octave] of CHORDS[name]!) {
      const frequency = NOTE(note, octave);
      for (let i = 0; i < length; i++) {
        const t = i / RATE;
        const envelope = Math.min(1, t * 50) * Math.exp(-t * 0.4);
        samples[start + i] =
          samples[start + i]! +
          0.08 *
            envelope *
            (Math.sin(2 * Math.PI * frequency * t) +
              0.4 * Math.sin(4 * Math.PI * frequency * t) +
              0.2 * Math.sin(6 * Math.PI * frequency * t));
      }
    }
  });
  const beat = 60 / bpm;
  for (let time = 0; time < samples.length / RATE; time += beat) {
    const start = Math.round(time * RATE);
    for (let i = 0; i < 0.08 * RATE && start + i < samples.length; i++) {
      const t = i / RATE;
      samples[start + i] =
        samples[start + i]! +
        0.6 * Math.exp(-t * 40) * Math.sin(2 * Math.PI * 60 * t);
    }
  }
  return samples;
}

describe("fft", () => {
  it("finds a pure tone in the right bin", () => {
    const n = 1024;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 64 * i) / n);
    fft(re, im);
    const magnitudes = Array.from({ length: n / 2 }, (_, k) =>
      Math.hypot(re[k]!, im[k]!),
    );
    expect(magnitudes.indexOf(Math.max(...magnitudes))).toBe(64);
  });
});

describe("audio analysis on a synthesized song", () => {
  const progression = ["C", "G", "Am", "F", "C", "G", "Am", "F"];
  const audio = song(progression, 2.4, 100);

  it("detects the tempo", () => {
    const tempo = detectTempo(audio, RATE);
    expect(tempo.bpm).toBeGreaterThan(97);
    expect(tempo.bpm).toBeLessThan(103);
    expect(tempo.beats.length).toBeGreaterThan(25);
    // Beats 0.6 s apart.
    const gaps = tempo.beats.slice(1).map((beat, i) => beat - tempo.beats[i]!);
    const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
    expect(median).toBeCloseTo(0.6, 1);
  });

  it("detects the key of a I–V–vi–IV song in C", () => {
    const key = detectKey(chromagram(audio, RATE));
    expect(["C", "Am"]).toContain(key.key);
    expect(key.confidence).toBeGreaterThan(0.5);
  });

  it("detects the chord progression", () => {
    const chroma = chromagram(audio, RATE);
    const key = detectKey(chroma);
    const tempo = detectTempo(audio, RATE);
    const chords = detectChords(chroma, key, tempo.beats).filter(
      (segment) => segment.chord !== "N",
    );
    expect(chords.map((segment) => segment.chord)).toEqual(progression);
    // Changes land within half a second of the real change.
    chords.slice(1).forEach((segment, index) => {
      expect(Math.abs(segment.start - (index + 1) * 2.4)).toBeLessThan(0.5);
    });
  });

  it("reports silence as no chord", () => {
    const silence = new Float32Array(RATE * 3);
    const chroma = chromagram(silence, RATE);
    const chords = detectChords(chroma, detectKey(chroma));
    expect(chords.every((segment) => segment.chord === "N")).toBe(true);
  });
});

describe("transposeChord", () => {
  it.each([
    ["C", 2, "D"],
    ["Am", 3, "Cm"],
    ["F#m7/C#", 2, "G#m7/Eb"],
    ["Bb", 1, "B"],
    ["Db", 0, "Db"],
    ["E", -5, "B"],
    ["N", 3, "N"],
  ])("%s %+d → %s", (chord, steps, expected) => {
    expect(transposeChord(chord, steps)).toBe(expected);
  });
});
