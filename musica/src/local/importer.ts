import type { Track } from "../api/types";

export interface LocalTrackRecord {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  /** data: URL (resized JPEG) or "". */
  cover: string;
  /** Seconds. */
  duration: number;
  fileName: string;
  mimeType: string;
  size: number;
  importedAt: number;
  updatedAt: number;
}

export function localToTrack(record: LocalTrackRecord): Track {
  return {
    id: record.id,
    source: "local",
    title: record.title,
    artist: record.artist,
    artistId: "",
    album: record.album,
    albumId: "",
    cover: record.cover,
    audioUrl: "",
    duration: record.duration,
    licenseUrl: "",
  };
}

const AUDIO_EXTENSIONS = [
  "mp3",
  "m4a",
  "aac",
  "mp4",
  "ogg",
  "oga",
  "opus",
  "wav",
  "flac",
  "webm",
  "weba",
];

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isAudioFile(file: { name: string; type: string }): boolean {
  return (
    file.type.startsWith("audio/") ||
    AUDIO_EXTENSIONS.includes(extension(file.name))
  );
}

/**
 * Best guess from a file name such as "03 - Artista - Música (Ao Vivo).mp3"
 * or "Artista_-_Música.flac", used when the file has no tags.
 */
export function parseFileName(name: string): { title: string; artist: string } {
  let base = name
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, " ")
    .trim();
  // Leading track number: "03 - ", "03. ", "03 ".
  base = base.replace(/^\d{1,3}\s*(?:[-.)]\s*|\s+)(?=\S)/, "").trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    const artist = parts[0]!.trim();
    const title = parts.slice(1).join(" - ").trim();
    if (artist && title) return { title, artist };
  }
  return { title: base || name, artist: "" };
}

interface Tags {
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  duration: number;
  picture: { data: Uint8Array; format: string } | null;
}

async function readTags(file: File): Promise<Tags | null> {
  try {
    // Loaded on demand: the parser is only needed when importing.
    const { parseBlob } = await import("music-metadata");
    const metadata = await parseBlob(file, { duration: true });
    const { common, format } = metadata;
    const picture = common.picture?.[0];
    return {
      title: common.title?.trim() ?? "",
      artist: (common.artist ?? common.albumartist ?? "").trim(),
      album: common.album?.trim() ?? "",
      year: common.year ? String(common.year) : "",
      genre: common.genre?.[0]?.trim() ?? "",
      duration:
        format.duration && Number.isFinite(format.duration)
          ? format.duration
          : 0,
      picture: picture ? { data: picture.data, format: picture.format } : null,
    };
  } catch {
    // Unreadable or untagged file: fall back to the file name.
    return null;
  }
}

/** Shrinks an image to a square-ish JPEG data URL so covers stay small in storage. */
export async function imageToDataUrl(
  blob: Blob,
  maxSize = 400,
): Promise<string> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    // Can't decode here (old browser, odd format): keep the original if it is small.
    if (blob.size > 300_000) return "";
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  }
}

/** Asks the browser for the duration when the tags don't say. */
function durationFromAudio(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    if (typeof Audio === "undefined") {
      resolve(0);
      return;
    }
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const done = (value: number) => {
      clearTimeout(timer);
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    const timer = setTimeout(() => done(0), 10_000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

export function newLocalId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local:${random}`;
}

export async function readLocalFile(
  file: File,
  now = Date.now(),
): Promise<LocalTrackRecord> {
  const tags = await readTags(file);
  const fromName = parseFileName(file.name);
  const duration = tags?.duration || (await durationFromAudio(file));
  const cover = tags?.picture
    ? await imageToDataUrl(
        new Blob([tags.picture.data as BlobPart], {
          type: tags.picture.format,
        }),
      )
    : "";
  return {
    id: newLocalId(),
    title: tags?.title || fromName.title,
    artist: tags?.artist || fromName.artist,
    album: tags?.album ?? "",
    year: tags?.year ?? "",
    genre: tags?.genre ?? "",
    cover,
    duration,
    fileName: file.name,
    mimeType: file.type || `audio/${extension(file.name)}`,
    size: file.size,
    importedAt: now,
    updatedAt: now,
  };
}
