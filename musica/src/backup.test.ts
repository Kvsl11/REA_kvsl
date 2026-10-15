import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createBackup, parseBackup, restoreBackup } from "./backup";
import * as db from "./db/db";
import { normalizeLibrary } from "./library/LibraryContext";

async function wipe() {
  for (const store of [
    "localTracks",
    "audio",
    "trackInfo",
    "plays",
    "shows",
    "lyrics",
  ] as const) {
    await db.clear(store);
  }
}

describe("database", () => {
  beforeEach(wipe);

  it("writes several stores atomically", async () => {
    await db.writeAll([
      {
        store: "trackInfo",
        value: { trackId: "1", key: "Am", bpm: 90, notes: "", updatedAt: 0 },
      },
      { store: "audio", value: new Blob(["abc"]), key: "local:1" },
    ]);
    expect((await db.get<{ key: string }>("trackInfo", "1"))?.key).toBe("Am");
    expect(await db.get("audio", "local:1")).toBeDefined();
    await db.writeAll([{ store: "trackInfo", key: "1", delete: true }]);
    expect(await db.get("trackInfo", "1")).toBeUndefined();
  });
});

describe("backup", () => {
  beforeEach(wipe);

  it("round-trips history, shows and stage info", async () => {
    await db.put("trackInfo", {
      trackId: "9",
      key: "D",
      bpm: 120,
      notes: "capo 2",
      updatedAt: 1,
    });
    await db.put("plays", {
      id: "p1",
      trackId: "9",
      startedAt: 1,
      seconds: 40,
    });
    const library = { liked: [], playlists: [] };
    const backup = await createBackup(library, false);
    const text = JSON.stringify(backup);

    await wipe();
    await restoreBackup(parseBackup(text));
    expect((await db.get<{ notes: string }>("trackInfo", "9"))?.notes).toBe(
      "capo 2",
    );
    expect(await db.getAll("plays")).toHaveLength(1);
  });

  it("leaves imported-file records out unless the audio goes too", async () => {
    await db.put("localTracks", { id: "local:1", title: "T", importedAt: 0 });
    const backup = await createBackup({ liked: [], playlists: [] }, false);
    expect(backup.localTracks).toEqual([]);
  });

  it("rejects files that aren't backups", () => {
    expect(() => parseBackup("not json")).toThrow(/JSON/);
    expect(() => parseBackup('{"format":"other"}')).toThrow(/não é um backup/);
    expect(() =>
      parseBackup('{"format":"sonora-backup","version":99}'),
    ).toThrow(/mais nova/);
  });
});

describe("normalizeLibrary", () => {
  it("upgrades data saved by the first version", () => {
    const old = {
      liked: [{ id: "123", title: "x" }],
      playlists: [
        {
          id: "p",
          name: "Velha",
          tracks: [{ id: "local:9", title: "y" }],
          createdAt: 1,
        },
      ],
    };
    const library = normalizeLibrary(old);
    expect(library.liked[0]?.source).toBe("jamendo");
    expect(library.playlists[0]).toMatchObject({
      kind: "playlist",
      description: "",
    });
    expect(library.playlists[0]?.tracks[0]?.source).toBe("local");
  });

  it("drops malformed playlists", () => {
    expect(
      normalizeLibrary({ playlists: [{ name: "sem id" }, null] }).playlists,
    ).toEqual([]);
  });
});
