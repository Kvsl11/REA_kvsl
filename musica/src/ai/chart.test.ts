import { describe, expect, it } from "vitest";
import { buildChart, chartToText, chordAt, chordRow } from "./chart";
import type { ChordSegment } from "./harmony";

const seg = (start: number, end: number, chord: string): ChordSegment => ({
  start,
  end,
  chord,
});

const chords = [
  seg(0, 2, "N"),
  seg(2, 6, "C"),
  seg(6, 10, "G"),
  seg(10, 12, "Am"),
  seg(12, 14, "F"),
  seg(14, 30, "C"),
];

const lines = [
  { time: 6, text: "Primeira linha da música" },
  { time: 10, text: "Segunda linha cantada" },
  { time: 22, text: "Depois do solo" },
];

describe("buildChart", () => {
  const chart = buildChart(lines, chords);

  it("collects chords before the first line as an intro", () => {
    expect(chart[0]).toMatchObject({ label: "Intro", text: "" });
    expect(chart[0]!.chords.map((c) => c.chord)).toEqual(["C"]);
  });

  it("puts each change over the word being sung", () => {
    const first = chart.find((line) => line.text.startsWith("Primeira"))!;
    expect(first.chords.map((c) => [c.chord, c.column])).toEqual([["G", 0]]);
    const second = chart.find((line) => line.text.startsWith("Segunda"))!;
    expect(second.chords[0]).toMatchObject({ chord: "Am", column: 0 });
    // F comes ~2 s into the line: sits at a word start, after "Am".
    const f = second.chords.find((c) => c.chord === "F")!;
    expect(f.column).toBeGreaterThan(2);
    expect(second.text[f.column - 1] === " " || f.column === 0).toBe(true);
  });

  it("shows the ringing chord at a line start only when it changed", () => {
    const last = chart.find((line) => line.text === "Depois do solo")!;
    // C started at 14 s, inside the previous line's tail; it was already shown.
    expect(last.chords).toEqual([]);
  });

  it("transposes", () => {
    const up = buildChart(lines, chords, 2);
    expect(up.flatMap((line) => line.chords.map((c) => c.chord))).toEqual([
      "D",
      "A",
      "Bm",
      "G",
      "D",
    ]);
  });

  it("makes an instrumental chart when there are no lyrics", () => {
    const only = buildChart([], chords);
    expect(only).toHaveLength(1);
    expect(only[0]!.chords.map((c) => c.chord)).toEqual([
      "C",
      "G",
      "Am",
      "F",
      "C",
    ]);
  });
});

describe("text output", () => {
  it("aligns chords above the lyric columns", () => {
    expect(
      chordRow({
        time: 0,
        text: "Abre a cortina",
        chords: [
          { chord: "C", time: 0, column: 0 },
          { chord: "Am", time: 1, column: 7 },
        ],
      }),
    ).toBe("C      Am");
  });

  it("writes a pasteable chart with key and BPM", () => {
    const text = chartToText(buildChart(lines, chords), {
      title: "Canção",
      artist: "Banda",
      key: "C",
      bpm: 96,
    });
    expect(text.split("\n").slice(0, 4)).toEqual([
      "Canção — Banda",
      "Tom: C  BPM: 96",
      "",
      "[Intro] C",
    ]);
    expect(text).toContain("G\nPrimeira linha da música");
  });
});

describe("chordAt", () => {
  it("returns the current and the next different chord", () => {
    expect(chordAt(chords, 7)).toEqual({ current: "G", next: "Am", nextIn: 3 });
    expect(chordAt(chords, 1)).toEqual({ current: null, next: "C", nextIn: 1 });
    expect(chordAt(chords, 40)).toMatchObject({ current: null, next: null });
  });
});
