import { describe, expect, it } from "vitest";
import type { Track } from "../api/types";
import * as Q from "./queue";

const track = (id: string): Track => ({
  id,
  title: `Música ${id}`,
  artist: "Artista",
  artistId: "1",
  album: "Álbum",
  albumId: "2",
  cover: "",
  audioUrl: `https://example.test/${id}.mp3`,
  duration: 180,
  licenseUrl: "",
});

const list = ["a", "b", "c", "d", "e"].map(track);
const ids = (tracks: Track[]) => tracks.map((item) => item.id);
// Deterministic "random": always picks the lowest index, so the shuffle is a rotation.
const lowest = () => 0;

describe("playList", () => {
  it("starts at the chosen track", () => {
    const state = Q.playList(Q.emptyQueue, list, 2);
    expect(Q.currentTrack(state)?.id).toBe("c");
    expect(ids(state.queue)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("puts the chosen track first and keeps every track when shuffling", () => {
    const shuffleOn = { ...Q.emptyQueue, shuffle: true };
    const state = Q.playList(shuffleOn, list, 3, Math.random);
    expect(Q.currentTrack(state)?.id).toBe("d");
    expect(state.index).toBe(0);
    expect([...ids(state.queue)].sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids(state.original)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("ignores an empty list", () => {
    expect(Q.playList(Q.emptyQueue, [], 0)).toBe(Q.emptyQueue);
  });
});

describe("next", () => {
  const atEnd = Q.playList(Q.emptyQueue, list, 4);

  it("advances in order", () => {
    expect(
      Q.currentTrack(Q.next(Q.playList(Q.emptyQueue, list, 0), false)!)?.id,
    ).toBe("b");
  });

  it("stops at the end when repeat is off", () => {
    expect(Q.next(atEnd, true)).toBeNull();
  });

  it("wraps around when repeating all", () => {
    expect(Q.next({ ...atEnd, repeat: "all" }, true)?.index).toBe(0);
  });

  it("replays the same track on repeat-one only when it ends by itself", () => {
    const one = {
      ...Q.playList(Q.emptyQueue, list, 1),
      repeat: "one" as const,
    };
    expect(Q.next(one, true)?.index).toBe(1);
    expect(Q.next(one, false)?.index).toBe(2);
  });
});

describe("previous", () => {
  it("goes back one track", () => {
    expect(Q.previous(Q.playList(Q.emptyQueue, list, 2)).index).toBe(1);
  });

  it("stays on the first track unless repeating all", () => {
    const first = Q.playList(Q.emptyQueue, list, 0);
    expect(Q.previous(first).index).toBe(0);
    expect(Q.previous({ ...first, repeat: "all" }).index).toBe(4);
  });
});

describe("toggleShuffle", () => {
  it("keeps the current track playing and restores order when turned off", () => {
    const playing = Q.playList(Q.emptyQueue, list, 2);
    const on = Q.toggleShuffle(playing, lowest);
    expect(on.shuffle).toBe(true);
    expect(Q.currentTrack(on)?.id).toBe("c");

    const off = Q.toggleShuffle(on);
    expect(off.shuffle).toBe(false);
    expect(ids(off.queue)).toEqual(["a", "b", "c", "d", "e"]);
    expect(Q.currentTrack(off)?.id).toBe("c");
  });
});

describe("cycleRepeat", () => {
  it("cycles off → all → one → off", () => {
    let state = Q.emptyQueue;
    const seen: Q.RepeatMode[] = [];
    for (let i = 0; i < 3; i++) {
      state = Q.cycleRepeat(state);
      seen.push(state.repeat);
    }
    expect(seen).toEqual(["all", "one", "off"]);
  });
});

describe("playNext and enqueue", () => {
  const playing = Q.playList(Q.emptyQueue, list, 1);
  const extra = track("x");

  it("inserts right after the current track", () => {
    expect(ids(Q.playNext(playing, extra).queue)).toEqual([
      "a",
      "b",
      "x",
      "c",
      "d",
      "e",
    ]);
  });

  it("appends to the end", () => {
    expect(ids(Q.enqueue(playing, extra).queue)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "x",
    ]);
  });

  it("starts playing when the queue was empty", () => {
    expect(Q.currentTrack(Q.enqueue(Q.emptyQueue, extra))?.id).toBe("x");
    expect(Q.currentTrack(Q.playNext(Q.emptyQueue, extra))?.id).toBe("x");
  });

  it("keeps queued tracks after shuffle is turned off", () => {
    const shuffled = Q.toggleShuffle(playing, lowest);
    const withExtra = Q.enqueue(shuffled, extra);
    expect(ids(Q.toggleShuffle(withExtra).queue)).toContain("x");
  });
});

describe("removeAt and jumpTo", () => {
  const playing = Q.playList(Q.emptyQueue, list, 2);

  it("removes an upcoming track without changing what plays", () => {
    const state = Q.removeAt(playing, 4);
    expect(ids(state.queue)).toEqual(["a", "b", "c", "d"]);
    expect(Q.currentTrack(state)?.id).toBe("c");
  });

  it("shifts the index when removing an earlier track", () => {
    const state = Q.removeAt(playing, 0);
    expect(Q.currentTrack(state)?.id).toBe("c");
    expect(state.index).toBe(1);
  });

  it("never removes the playing track", () => {
    expect(Q.removeAt(playing, 2)).toBe(playing);
  });

  it("jumps within bounds only", () => {
    expect(Q.jumpTo(playing, 4).index).toBe(4);
    expect(Q.jumpTo(playing, 9)).toBe(playing);
  });
});
