import { describe, expect, it } from "vitest";
import type { Track } from "../api/types";
import * as S from "./session";

const song = (id: string, duration: number): Track => ({
  id,
  source: "local",
  title: `Música ${id}`,
  artist: "Banda",
  artistId: "",
  album: "",
  albumId: "",
  cover: "",
  audioUrl: "",
  duration,
  licenseUrl: "",
});

const setlist = [
  song("a", 180),
  song("b", 240),
  song("c", 200),
  song("d", 150),
];
const T0 = Date.UTC(2026, 9, 15, 21, 0, 0);
const at = (seconds: number) => T0 + seconds * 1000;

function newShow(mode: S.ShowMode = "live") {
  return S.createShow(
    {
      id: "s1",
      name: "  Bar do Zé  ",
      setlistId: "p1",
      setlistName: "Sexta",
      mode,
      tracks: setlist,
    },
    T0,
  );
}

describe("createShow", () => {
  it("snapshots the setlist and starts the clock", () => {
    const show = newShow();
    expect(show.name).toBe("Bar do Zé");
    expect(show.planned.map((item) => item.trackId)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(show.planned[1]?.seconds).toBe(240);
    expect(S.isLive(show)).toBe(true);
    expect(S.nextPlannedIndex(show)).toBe(0);
  });
});

describe("a live show, start to finish", () => {
  let show = newShow();
  show = S.startPlanned(show, 0, at(30)); // talk for 30 s, then song a
  show = S.startPlanned(show, 1, at(220)); // a ran 190 s
  show = S.startBreak(show, at(480)); // b ran 260 s, then a break
  show = S.endBreak(show, at(1080)); // 10 min break
  show = S.startPlanned(show, 3, at(1100)); // skip c, play d
  show = S.endShow(show, at(1260)); // d ran 160 s

  const summary = S.summarizeShow(show, at(9999));

  it("measures the whole show and its parts", () => {
    expect(summary.totalSeconds).toBe(1260);
    expect(summary.musicSeconds).toBe(190 + 260 + 160);
    expect(summary.breakSeconds).toBe(600);
    expect(summary.gapSeconds).toBe(1260 - 610 - 600);
  });

  it("times each song against its planned length", () => {
    expect(summary.entries.map((entry) => entry.actualSeconds)).toEqual([
      190, 260, 160,
    ]);
    expect(summary.entries.map((entry) => entry.diffSeconds)).toEqual([
      10, 20, 10,
    ]);
    expect(summary.entries[2]?.offsetSeconds).toBe(1100);
    expect(summary.longest?.trackId).toBe("b");
  });

  it("lists what was skipped", () => {
    expect(summary.playedFromSetlist).toBe(3);
    expect(summary.skipped.map((item) => item.trackId)).toEqual(["c"]);
  });

  it("is frozen once ended", () => {
    expect(S.isLive(show)).toBe(false);
    expect(S.startPlanned(show, 2, at(2000))).toBe(show);
    expect(S.summarizeShow(show, at(99999)).totalSeconds).toBe(1260);
  });

  it("exports a spreadsheet with one row per song", () => {
    const csv = S.showToCsv(show, at(9999));
    expect(csv).toContain("Duração total;21:00");
    expect(csv).toContain("Música b;Banda");
    expect(csv).toContain("4:20;4:00;0:20");
    expect(csv).toContain("Não tocadas");
  });
});

describe("nextPlannedIndex", () => {
  it("continues after the last setlist song played and wraps to skipped ones", () => {
    let show = newShow();
    show = S.startPlanned(show, 2, at(10));
    expect(S.nextPlannedIndex(show)).toBe(3);
    show = S.startPlanned(show, 3, at(20));
    expect(S.nextPlannedIndex(show)).toBe(0);
    show = S.startPlanned(show, 0, at(30));
    show = S.startPlanned(show, 1, at(40));
    expect(S.nextPlannedIndex(show)).toBe(-1);
  });
});

describe("playback shows", () => {
  it("matches player tracks to setlist slots, and marks others as extras", () => {
    let show = newShow("playback");
    const meta = (track: Track) => ({
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      seconds: track.duration,
    });
    show = S.startSong(show, meta(setlist[0]!), at(0));
    show = S.startSong(show, meta(song("x", 100)), at(100));
    show = S.startSong(show, meta(setlist[1]!), at(200));
    expect(show.entries.map((entry) => entry.plannedIndex)).toEqual([0, -1, 1]);
    expect(show.entries[1]?.plannedSeconds).toBe(100);
    expect(S.summarizeShow(show, at(300)).extras).toBe(1);
  });

  it("attributes a repeated song (bis) to its setlist slot", () => {
    let show = newShow("playback");
    const a = { trackId: "a", title: "A", artist: "", seconds: 180 };
    show = S.startSong(show, a, at(0));
    show = S.startSong(show, a, at(200));
    expect(show.entries.map((entry) => entry.plannedIndex)).toEqual([0, 0]);
  });
});

describe("breaks", () => {
  it("close the current song and can't nest", () => {
    let show = newShow();
    show = S.startPlanned(show, 0, at(0));
    show = S.startBreak(show, at(100));
    expect(S.currentEntry(show)).toBeNull();
    expect(S.startBreak(show, at(150))).toBe(show);
    show = S.startPlanned(show, 1, at(200));
    expect(S.currentBreak(show)).toBeNull();
    expect(show.breaks[0]?.endedAt).toBe(at(200));
  });

  it("count while still running", () => {
    let show = newShow();
    show = S.startBreak(show, at(60));
    expect(S.summarizeShow(show, at(90)).breakSeconds).toBe(30);
  });
});
