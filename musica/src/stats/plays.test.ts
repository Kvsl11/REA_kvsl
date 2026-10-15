import { describe, expect, it } from "vitest";
import type { ShowSession } from "../show/session";
import {
  countsAsPlay,
  showEntriesAsPlays,
  statsSource,
  summarize,
  trackHistory,
  type PlayRecord,
} from "./plays";

const DAY = 86_400_000;
const T0 = new Date(2026, 9, 10, 12, 0, 0).getTime();

let next = 0;
function play(overrides: Partial<PlayRecord>): PlayRecord {
  next++;
  return {
    id: `p${next}`,
    trackId: "t1",
    source: "local",
    title: "Música 1",
    artist: "Banda",
    album: "",
    startedAt: T0,
    endedAt: T0,
    seconds: 60,
    duration: 200,
    completed: false,
    showId: null,
    ...overrides,
  };
}

describe("countsAsPlay", () => {
  it("needs 30 s, half of a short song, or reaching the end", () => {
    expect(countsAsPlay({ seconds: 29, duration: 200, completed: false })).toBe(
      false,
    );
    expect(countsAsPlay({ seconds: 30, duration: 200, completed: false })).toBe(
      true,
    );
    expect(countsAsPlay({ seconds: 21, duration: 40, completed: false })).toBe(
      true,
    );
    expect(countsAsPlay({ seconds: 5, duration: 0, completed: true })).toBe(
      true,
    );
    expect(countsAsPlay({ seconds: 25, duration: 0, completed: false })).toBe(
      false,
    );
  });
});

describe("summarize", () => {
  const plays = [
    play({ trackId: "t1", seconds: 200, completed: true }),
    play({ trackId: "t1", seconds: 10 }), // skipped: minutes count, play doesn't
    play({
      trackId: "t2",
      title: "Outra",
      artist: "Solo",
      seconds: 90,
      startedAt: T0 + DAY,
    }),
    play({
      trackId: "t2",
      title: "Outra",
      artist: "Solo",
      seconds: 90,
      startedAt: T0 + DAY,
    }),
    play({ trackId: "t3", artist: "", seconds: 40, startedAt: T0 - 40 * DAY }),
  ];

  it("totals minutes, plays and distinct songs", () => {
    const summary = summarize(plays);
    expect(summary.seconds).toBe(430);
    expect(summary.plays).toBe(4);
    expect(summary.distinctTracks).toBe(3);
  });

  it("ranks songs by plays, then minutes", () => {
    const summary = summarize(plays);
    expect(
      summary.tracks.map((track) => [
        track.trackId,
        track.plays,
        track.seconds,
      ]),
    ).toEqual([
      ["t2", 2, 180],
      ["t1", 1, 210],
      ["t3", 1, 40],
    ]);
  });

  it("groups artists and names unknown ones", () => {
    const names = summarize(plays).artists.map((artist) => artist.artist);
    expect(names).toContain("Artista desconhecido");
    expect(
      summarize(plays).artists.find((a) => a.artist === "Banda")?.tracks,
    ).toBe(1);
  });

  it("filters by period", () => {
    expect(summarize(plays, { from: T0 - DAY }).distinctTracks).toBe(2);
  });

  it("sums minutes per local day", () => {
    const days = summarize(plays).days;
    expect(days).toHaveLength(3);
    expect(days.at(-1)?.seconds).toBe(180);
  });
});

describe("show plays", () => {
  const session: ShowSession = {
    id: "show1",
    name: "Show",
    venue: "",
    setlistId: null,
    setlistName: "",
    mode: "live",
    planned: [],
    startedAt: T0,
    endedAt: T0 + 600_000,
    entries: [
      {
        trackId: "t1",
        title: "Música 1",
        artist: "Banda",
        plannedIndex: 0,
        plannedSeconds: 200,
        startedAt: T0,
        endedAt: T0 + 210_000,
      },
      {
        trackId: "local:x",
        title: "Errei",
        artist: "Banda",
        plannedIndex: 1,
        plannedSeconds: 200,
        startedAt: T0 + 210_000,
        endedAt: T0 + 215_000,
      },
    ],
    breaks: [],
    notes: "",
    updatedAt: T0,
  };

  it("turn performed songs into plays tagged with the show", () => {
    const plays = showEntriesAsPlays([session], T0);
    expect(
      plays.map((item) => [item.trackId, item.seconds, item.showId]),
    ).toEqual([
      ["t1", 210, "show1"],
      ["local:x", 5, "show1"],
    ]);
    expect(plays[1]?.source).toBe("local");
  });

  it("count each performance once, not again from the player log", () => {
    const playerLog = [
      play({ trackId: "t1", showId: "show1", seconds: 210 }),
      play({ trackId: "t1", showId: null, seconds: 100 }),
    ];
    const source = statsSource(playerLog, [session], T0);
    const summary = summarize(source, { scope: "shows" });
    expect(summary.plays).toBe(1); // the 5 s mistake doesn't count
    expect(summarize(source, { scope: "listening" }).seconds).toBe(100);
    expect(trackHistory(source, "t1")).toMatchObject({
      plays: 2,
      showPlays: 1,
      seconds: 310,
    });
  });
});
