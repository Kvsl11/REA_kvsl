import { describe, expect, it } from "vitest";
import { parseDuration } from "../components/EditTrackDialog";
import { isAudioFile, localToTrack, parseFileName } from "./importer";

describe("parseFileName", () => {
  it.each([
    ["Artista - Música.mp3", { artist: "Artista", title: "Música" }],
    [
      "03 - Artista - Música (Ao Vivo).flac",
      { artist: "Artista", title: "Música (Ao Vivo)" },
    ],
    ["07. Só o Título.m4a", { artist: "", title: "Só o Título" }],
    ["Artista_-_Faixa_Legal.ogg", { artist: "Artista", title: "Faixa Legal" }],
    [
      "Banda – Canção – Parte 2.wav",
      { artist: "Banda", title: "Canção - Parte 2" },
    ],
    ["1999.mp3", { artist: "", title: "1999" }],
    ["semextensao", { artist: "", title: "semextensao" }],
  ])("%s", (name, expected) => {
    expect(parseFileName(name)).toEqual(expected);
  });
});

describe("isAudioFile", () => {
  it("accepts audio MIME types and known extensions", () => {
    expect(isAudioFile({ name: "x.bin", type: "audio/mpeg" })).toBe(true);
    expect(isAudioFile({ name: "Show.FLAC", type: "" })).toBe(true);
    expect(isAudioFile({ name: "capa.jpg", type: "image/jpeg" })).toBe(false);
    expect(isAudioFile({ name: "notas.txt", type: "" })).toBe(false);
  });
});

describe("localToTrack", () => {
  it("has no artist or album page and no stream URL", () => {
    const track = localToTrack({
      id: "local:1",
      title: "T",
      artist: "A",
      album: "B",
      year: "",
      genre: "",
      cover: "data:image/jpeg;base64,xx",
      duration: 12,
      fileName: "t.mp3",
      mimeType: "audio/mpeg",
      size: 1,
      importedAt: 0,
      updatedAt: 0,
    });
    expect(track).toMatchObject({
      source: "local",
      artistId: "",
      albumId: "",
      audioUrl: "",
    });
  });
});

describe("parseDuration", () => {
  it.each([
    ["3:45", 225],
    ["3.05", 185],
    ["225", 225],
    [" 0:59 ", 59],
    ["", null],
    ["3:75", null],
    ["abc", null],
  ])("%s → %s", (text, expected) => {
    expect(parseDuration(text)).toBe(expected);
  });
});

describe("safeFileName", () => {
  it("drops accents and characters file systems reject", async () => {
    const { safeFileName } = await import("../pages/ShowReport");
    expect(safeFileName("Sexta no Bar do Zé: ação/2")).toBe(
      "Sexta no Bar do Ze- acao-2",
    );
    expect(safeFileName("   ")).toBe("show");
  });
});
