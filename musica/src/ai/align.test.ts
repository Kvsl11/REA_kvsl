import { describe, expect, it } from "vitest";
import {
  alignLyrics,
  normalizeWord,
  wordSimilarity,
  wordsToLines,
  type TimedWord,
} from "./align";

/** Words as a recognizer would return them, one every `gap` seconds from `start`. */
function speak(text: string, start: number, gap = 0.4): TimedWord[] {
  return text
    .split(" ")
    .map((word, i) => ({
      text: word,
      start: start + i * gap,
      end: start + i * gap + gap * 0.8,
    }));
}

describe("normalizeWord / wordSimilarity", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeWord("Coração,")).toBe("coracao");
    expect(normalizeWord("D'água")).toBe("dagua");
  });

  it("gives credit to near misses only", () => {
    expect(wordSimilarity("cancao", "cancao")).toBe(1);
    expect(wordSimilarity("cancao", "cansao")).toBeGreaterThan(0.7);
    expect(wordSimilarity("amor", "dor")).toBe(0);
  });
});

describe("alignLyrics", () => {
  const lyrics = [
    "Abre a cortina do passado",
    "Tira a mãe preta do cerrado",
    "Bota o rei congo no congado",
    "Brasil",
  ];

  it("times each line where it is sung", () => {
    const heard = [
      ...speak("abre a cortina do passado", 10),
      ...speak("tira a mãe preta do cerrado", 15),
      ...speak("bota o rei congo no congado", 20),
      ...speak("brasil", 26),
    ];
    const result = alignLyrics(lyrics, heard);
    expect(result.coverage).toBe(1);
    expect(result.lines.map((line) => line.time)).toEqual([10, 15, 20, 26]);
  });

  it("tolerates recognition mistakes, missed words and noise", () => {
    const heard = [
      ...speak("uh yeah", 2),
      ...speak("abri a cortina do passado", 10), // "abri" ≈ "abre"
      ...speak("tira mãe preta cerrado", 15.4), // missed words: start is back-dated
      ...speak("bota o rei conga no congado", 20),
      ...speak("brazil", 26),
    ];
    const result = alignLyrics(lyrics, heard);
    expect(result.coverage).toBeGreaterThan(0.75);
    const [first, second, third, fourth] = result.lines.map(
      (line) => line.time,
    );
    expect(first).toBeCloseTo(10, 0);
    expect(second).toBeGreaterThan(14.5);
    expect(second).toBeLessThan(15.6);
    expect(third).toBeCloseTo(20, 0);
    expect(fourth).toBeCloseTo(26, 0);
  });

  it("places lines the singer skipped between their neighbours", () => {
    const heard = [
      ...speak("abre a cortina do passado", 10),
      ...speak("brasil", 30),
    ];
    const times = alignLyrics(lyrics, heard).lines.map((line) => line.time);
    expect(times[0]).toBe(10);
    expect(times[3]).toBe(30);
    expect(times[1]).toBeGreaterThan(10);
    expect(times[2]).toBeGreaterThan(times[1]!);
    expect(times[2]).toBeLessThan(30);
  });

  it("still returns increasing times when nothing matches", () => {
    const result = alignLyrics(["um", "dois", "três"], speak("la la la", 0));
    expect(result.coverage).toBe(0);
    const times = result.lines.map((line) => line.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("wordsToLines", () => {
  it("breaks lines at pauses and sentence ends", () => {
    const words = [
      ...speak("eu vou cantar.", 0),
      ...speak("e você vai ouvir", 1.3),
      ...speak("depois da pausa", 5),
    ];
    expect(wordsToLines(words)).toEqual([
      { time: 0, text: "Eu vou cantar." },
      { time: 1.3, text: "E você vai ouvir" },
      { time: 5, text: "Depois da pausa" },
    ]);
  });

  it("splits long runs of words", () => {
    const words = speak(
      "um dois três quatro cinco seis sete oito nove dez onze",
      0,
      0.3,
    );
    const lines = wordsToLines(words);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text.split(" ")).toHaveLength(9);
  });
});
