import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JamendoError,
  getTracks,
  saveClientId,
  searchAll,
  toTrack,
} from "./jamendo";

const rawTrack = {
  id: "168",
  name: "Proud",
  duration: 220,
  artist_id: "7",
  artist_name: "Both",
  album_name: "Simple Exercice",
  album_id: "24",
  album_image: "https://img.test/24.jpg",
  audio: "https://audio.test/168.mp3",
  license_ccurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
};

function respond(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const ok = (results: unknown[]) => ({
  headers: { status: "success", code: 0, error_message: "" },
  results,
});

describe("toTrack", () => {
  it("maps Jamendo fields", () => {
    expect(toTrack(rawTrack)).toEqual({
      id: "168",
      source: "jamendo",
      title: "Proud",
      artist: "Both",
      artistId: "7",
      album: "Simple Exercice",
      albumId: "24",
      cover: "https://img.test/24.jpg",
      audioUrl: "https://audio.test/168.mp3",
      duration: 220,
      licenseUrl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
    });
  });

  it("drops tracks without a stream URL", () => {
    expect(toTrack({ ...rawTrack, audio: "" })).toBeNull();
  });

  it("tolerates numeric ids and string durations", () => {
    const track = toTrack({ ...rawTrack, id: 168, duration: "95" });
    expect(track?.id).toBe("168");
    expect(track?.duration).toBe(95);
  });
});

describe("requests", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses to call the API without a client ID", async () => {
    await expect(getTracks({})).rejects.toMatchObject({
      kind: "missing-client-id",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the client ID and filters, and parses results", async () => {
    saveClientId("  abc123 ");
    fetchMock.mockImplementation(() => respond(ok([rawTrack])));

    const tracks = await getTracks({
      tag: "rock",
      order: "popularity_month",
      limit: 5,
    });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe(
      "https://api.jamendo.com/v3.0/tracks/",
    );
    expect(url.searchParams.get("client_id")).toBe("abc123");
    expect(url.searchParams.get("tags")).toBe("rock");
    expect(url.searchParams.get("order")).toBe("popularity_month");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(tracks.map((track) => track.id)).toEqual(["168"]);
  });

  it("surfaces Jamendo's own error message", async () => {
    saveClientId("bad");
    fetchMock.mockImplementation(() =>
      respond({
        headers: {
          status: "failed",
          error_message: "Your credential is not authorized.",
        },
      }),
    );
    const error = await getTracks({}).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(JamendoError);
    expect((error as JamendoError).message).toBe(
      "Your credential is not authorized.",
    );
  });

  it("reports HTTP and network failures", async () => {
    saveClientId("abc");
    fetchMock.mockImplementationOnce(() => respond({}, 500));
    await expect(getTracks({})).rejects.toMatchObject({ kind: "api" });
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    await expect(getTracks({})).rejects.toMatchObject({ kind: "network" });
  });

  it("searches tracks, albums and artists together", async () => {
    saveClientId("abc");
    fetchMock.mockImplementation((input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/tracks/")) return respond(ok([rawTrack]));
      if (path.endsWith("/albums/")) {
        return respond(
          ok([{ id: "24", name: "Simple Exercice", artist_name: "Both" }]),
        );
      }
      return respond(ok([{ id: "7", name: "Both", image: "" }]));
    });

    const result = await searchAll("both");
    expect(result.tracks).toHaveLength(1);
    expect(result.albums[0]?.title).toBe("Simple Exercice");
    expect(result.artists[0]?.name).toBe("Both");
  });
});
