import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeLine,
  isLrc,
  linesForSync,
  lrcToPlain,
  parseLrc,
  toLrc,
} from "./lrc";
import { bestMatch, cleanTitle, findLyrics, type LrclibResult } from "./lrclib";

const SONG = `[ar:Banda]
[ti:Canção]
[offset:+500]
[00:12.30]Primeira linha
[00:15.8]Segunda linha
[00:20.123][01:05.00]Refrão que repete
[00:24.00]
[00:26.00]<00:26.00>Palavra <00:26.50>por <00:27.00>palavra`;

describe("parseLrc", () => {
  const { lines, offsetMs } = parseLrc(SONG);

  it("reads timestamps with 1–3 fraction digits and the file offset", () => {
    expect(offsetMs).toBe(500);
    expect(lines[0]).toEqual({ time: 12.3, text: "Primeira linha" });
    expect(lines[1]?.time).toBeCloseTo(15.8);
    expect(lines[2]?.time).toBeCloseTo(20.123);
  });

  it("expands lines with several timestamps and sorts by time", () => {
    expect(lines.map((line) => line.text)).toEqual([
      "Primeira linha",
      "Segunda linha",
      "Refrão que repete",
      "",
      "Palavra por palavra",
      "Refrão que repete",
    ]);
    expect(lines.at(-1)?.time).toBe(65);
  });

  it("ignores metadata tags and strips word timings", () => {
    expect(lines.some((line) => line.text.includes("ar:"))).toBe(false);
    expect(lines[4]?.text).toBe("Palavra por palavra");
  });
});

describe("activeLine", () => {
  const { lines } = parseLrc(SONG);

  it("finds the line being sung", () => {
    expect(activeLine(lines, 5)).toBe(-1);
    expect(activeLine(lines, 12.3)).toBe(0);
    expect(activeLine(lines, 17)).toBe(1);
    expect(activeLine(lines, 70)).toBe(5);
  });

  it("applies the offset (positive shows lines earlier)", () => {
    expect(activeLine(lines, 11.9, 500)).toBe(0);
    expect(activeLine(lines, 12.5, -500)).toBe(-1);
  });
});

describe("conversions", () => {
  it("detects LRC", () => {
    expect(isLrc(SONG)).toBe(true);
    expect(isLrc("Só uma letra\ncomum")).toBe(false);
  });

  it("turns LRC into plain text and lines to tap-sync", () => {
    expect(lrcToPlain("[00:01.00]A\n[00:02.00]B")).toBe("A\nB");
    expect(linesForSync("  Verso um \n\n Verso dois\n")).toEqual([
      "Verso um",
      "Verso dois",
    ]);
  });

  it("writes LRC that reads back the same", () => {
    const lrc = toLrc(
      [
        { time: 65.555, text: "Depois" },
        { time: 3.2, text: "Antes" },
      ],
      { title: "T", artist: "A" },
    );
    expect(lrc).toBe("[ar:A]\n[ti:T]\n[00:03.20]Antes\n[01:05.56]Depois");
    expect(parseLrc(lrc).lines.map((line) => line.text)).toEqual([
      "Antes",
      "Depois",
    ]);
  });
});

describe("cleanTitle", () => {
  it.each([
    ["Garota de Ipanema (Ao Vivo)", "Garota de Ipanema"],
    ["Song - Remastered 2011", "Song"],
    ["Track [Live at Wembley]", "Track"],
    ["Canção feat. Fulano", "Canção"],
    ["Música (Versão Acústica)", "Música"],
    ["Normal Title", "Normal Title"],
  ])("%s → %s", (input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });
});

const result = (overrides: Partial<LrclibResult>): LrclibResult => ({
  id: 1,
  title: "T",
  artist: "A",
  album: "",
  duration: 200,
  instrumental: false,
  plain: "x",
  synced: "",
  ...overrides,
});

describe("bestMatch", () => {
  it("prefers synced lyrics, then the closest duration", () => {
    const picked = bestMatch(
      [
        result({ id: 1, duration: 200 }),
        result({ id: 2, duration: 210, synced: "[00:01.00]x" }),
        result({ id: 3, duration: 203, synced: "[00:01.00]x" }),
      ],
      201,
    );
    expect(picked?.id).toBe(3);
  });

  it("rejects recordings far from the track's length", () => {
    expect(
      bestMatch([result({ duration: 400, synced: "[00:01.00]x" })], 200),
    ).toBeNull();
  });

  it("ignores empty results", () => {
    expect(bestMatch([result({ plain: "", synced: "" })], 200)).toBeNull();
  });
});

describe("findLyrics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the exact match when LRCLIB has one", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/get");
      expect(url.searchParams.get("duration")).toBe("200");
      return new Response(
        JSON.stringify({
          id: 9,
          trackName: "T",
          artistName: "A",
          duration: 200,
          syncedLyrics: "[00:01.00]oi",
          plainLyrics: "oi",
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const found = await findLyrics({
      title: "T",
      artist: "A",
      album: "",
      duration: 199.6,
    });
    expect(found?.synced).toBe("[00:01.00]oi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to searching with a cleaned title", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(`${url.pathname}?${url.searchParams.get("track_name")}`);
      if (url.pathname === "/api/get")
        return new Response("{}", { status: 404 });
      return new Response(
        JSON.stringify([
          {
            id: 4,
            trackName: "Música",
            artistName: "A",
            duration: 180,
            plainLyrics: "letra",
          },
        ]),
      );
    });
    const found = await findLyrics({
      title: "Música (Ao Vivo)",
      artist: "A",
      album: "",
      duration: 185,
    });
    expect(found?.id).toBe(4);
    expect(calls).toEqual(["/api/get?Música (Ao Vivo)", "/api/search?Música"]);
  });

  it("reports connection problems", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      findLyrics({ title: "T", artist: "", album: "", duration: 0 }),
    ).rejects.toThrow(/conectar/);
  });
});
