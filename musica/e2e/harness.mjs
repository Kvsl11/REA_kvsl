// Shared setup for the browser tests: serves the production build, starts
// Chromium, and answers the app's network calls with canned data so the
// tests run offline and deterministically:
// - Jamendo (catalog), with a few fake tracks and covers;
// - LRCLIB (lyrics), with synced lyrics for some of those tracks;
// - generated WAV audio, so the browser really plays sound.
// Pass --screenshots DIR to save screenshots.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotArg = process.argv.indexOf("--screenshots");
export const screenshotDir =
  screenshotArg > 0
    ? resolve(process.argv[screenshotArg + 1] ?? "screenshots")
    : null;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium",
].filter(Boolean);

export function wav(seconds = 3, rate = 8000) {
  const samples = seconds * rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(
      Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 3000),
      44 + i * 2,
    );
  }
  return buffer;
}

const COLORS = [
  "#e8115b",
  "#7358ff",
  "#1e3264",
  "#148a08",
  "#bc5900",
  "#af2896",
];
function coverSvg(id) {
  const color = COLORS[Number(id) % COLORS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="${color}"/><circle cx="150" cy="150" r="70" fill="rgba(0,0,0,.25)"/><circle cx="150" cy="150" r="14" fill="rgba(255,255,255,.7)"/></svg>`;
}

const NAMES = [
  ["Luz da Manhã", "Aurora Vale"],
  ["Ondas", "Maré Alta"],
  ["Cidade Neon", "Pulso"],
  ["Estrada Velha", "Os Viajantes"],
  ["Café às Três", "Lia Mendes"],
  ["Horizonte", "Aurora Vale"],
  ["Noturno nº 2", "Quarteto Sul"],
  ["Batida Solar", "Pulso"],
];

const tracks = NAMES.map(([name, artist], i) => ({
  id: String(1000 + i),
  name,
  duration: 3,
  artist_id: String(10 + (artist === "Aurora Vale" ? 0 : i)),
  artist_name: artist,
  album_id: String(200 + (i % 3)),
  album_name: ["Primeira Luz", "Correntes", "Eletricidade"][i % 3],
  album_image: `https://img.test/${i}.svg`,
  audio: `https://audio.test/${1000 + i}.wav`,
  license_ccurl: "https://creativecommons.org/licenses/by/3.0/",
}));

const ok = (results) => ({ headers: { status: "success", code: 0 }, results });

function jamendo(url) {
  const path = url.pathname.replace(/\/+$/, "");
  const q = url.searchParams;
  if (q.get("client_id") !== "test-client") {
    return {
      headers: {
        status: "failed",
        error_message: "Your credential is not authorized.",
      },
    };
  }
  if (path.endsWith("/tracks")) {
    let results = tracks;
    const search = (q.get("search") ?? "").toLowerCase();
    if (search) {
      results = tracks.filter((t) =>
        `${t.name} ${t.artist_name}`.toLowerCase().includes(search),
      );
    }
    if (q.get("artist_id"))
      results = tracks.filter((t) => t.artist_id === q.get("artist_id"));
    if (q.get("album_id"))
      results = tracks.filter((t) => t.album_id === q.get("album_id"));
    if (q.get("order") === "releasedate_desc") results = [...results].reverse();
    return ok(results.slice(0, Number(q.get("limit") ?? 20)));
  }
  if (path.endsWith("/albums")) {
    const albums = [
      ...new Map(tracks.map((t) => [t.album_id, t])).values(),
    ].map((t) => ({
      id: t.album_id,
      name: t.album_name,
      artist_id: t.artist_id,
      artist_name: t.artist_name,
      image: t.album_image,
      releasedate: "2024-05-01",
    }));
    const name = (q.get("namesearch") ?? "").toLowerCase();
    return ok(
      albums.filter(
        (a) =>
          (!q.get("id") || a.id === q.get("id")) &&
          (!q.get("artist_id") || a.artist_id === q.get("artist_id")) &&
          (!name || a.name.toLowerCase().includes(name)),
      ),
    );
  }
  if (path.endsWith("/artists")) {
    const artists = [
      ...new Map(tracks.map((t) => [t.artist_id, t])).values(),
    ].map((t) => ({
      id: t.artist_id,
      name: t.artist_name,
      image: t.album_image,
    }));
    const name = (q.get("namesearch") ?? "").toLowerCase();
    return ok(
      artists.filter(
        (a) =>
          (!q.get("id") || a.id === q.get("id")) &&
          (!name || a.name.toLowerCase().includes(name)),
      ),
    );
  }
  return ok([]);
}

const executablePath = CHROMIUM_CANDIDATES.find((path) => existsSync(path));
assert.ok(executablePath, "Chromium not found; set CHROMIUM_PATH");

export const server = await preview({
  root,
  preview: { port: 4317, strictPort: false, host: "127.0.0.1" },
});
export const baseUrl = server.resolvedUrls.local[0];
export const browser = await chromium.launch({
  executablePath,
  args: ["--autoplay-policy=no-user-gesture-required", "--no-proxy-server"],
});
const audio = wav();
export const consoleErrors = [];

export let jamendoRequests = 0;
export const resetJamendoRequests = () => {
  jamendoRequests = 0;
};
export let lrclibRequests = 0;

/** Lyrics LRCLIB "knows", keyed by lowercase title. */
const LYRICS = {
  "luz da manhã": {
    id: 501,
    artistName: "Aurora Vale",
    duration: 3,
    syncedLyrics:
      "[00:00.10]Primeira luz do dia\n[00:01.10]Segunda linha da manhã\n[00:02.10]Terceira e última",
    plainLyrics:
      "Primeira luz do dia\nSegunda linha da manhã\nTerceira e última",
  },
  ondas: {
    id: 502,
    artistName: "Maré Alta",
    duration: 3,
    syncedLyrics: "",
    plainLyrics: "Vai e vem\nComo as ondas",
  },
};

function lrclib(url) {
  const title = (
    url.searchParams.get("track_name") ??
    url.searchParams.get("q") ??
    ""
  )
    .toLowerCase()
    .trim();
  const entries = Object.entries(LYRICS)
    .filter(([name]) => title && (name === title || name.includes(title)))
    .map(([name, item]) => ({
      trackName: name.replace(/^./, (c) => c.toUpperCase()),
      albumName: "",
      instrumental: false,
      ...item,
    }));
  if (url.pathname.endsWith("/get")) {
    const exact = entries.find(
      (item) => item.trackName.toLowerCase() === title,
    );
    return exact
      ? { status: 200, json: exact }
      : { status: 404, json: { message: "not found" } };
  }
  return { status: 200, json: entries };
}

export let modelRequests = 0;

/**
 * `fakeTranscriber`: words the "speech model" will return, so tests don't
 * download a real model (the app reads it from a documented test seam).
 */
export async function newPage(
  viewport,
  { clock = false, fakeTranscriber = null } = {},
) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  if (fakeTranscriber) {
    await context.addInitScript((words) => {
      window.__sonoraFakeTranscriber = async () => words;
    }, fakeTranscriber);
  }
  await context.route(/huggingface\.co|hf\.co/, (route) => {
    modelRequests++;
    return route.abort();
  });
  await context.route("https://api.jamendo.com/**", (route) => {
    jamendoRequests++;
    return route.fulfill({ json: jamendo(new URL(route.request().url())) });
  });
  await context.route("https://lrclib.net/**", (route) => {
    lrclibRequests++;
    const { status, json } = lrclib(new URL(route.request().url()));
    return route.fulfill({ status, json });
  });
  await context.route("https://audio.test/**", (route) =>
    route.fulfill({ body: audio, contentType: "audio/wav" }),
  );
  await context.route("https://img.test/**", (route) => {
    const id = new URL(route.request().url()).pathname.match(/\d+/)?.[0] ?? "0";
    return route.fulfill({ body: coverSvg(id), contentType: "image/svg+xml" });
  });
  const page = await context.newPage();
  if (clock) await page.clock.install();
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // "No lyrics for this song" is a 404 from LRCLIB: expected, not a bug.
    if (message.location().url.startsWith("https://lrclib.net/")) return;
    consoleErrors.push(message.text());
  });
  return page;
}

export async function shot(page, name) {
  if (screenshotDir)
    await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
}

export const steps = [];
export async function step(name, run) {
  await run();
  steps.push(name);
  console.log(`  ✓ ${name}`);
}

/** Files as the import dialog would hand them over. */
export const audioFile = (name, seconds = 3) => ({
  name,
  mimeType: "audio/wav",
  buffer: wav(seconds),
});

export async function skipSetup(page) {
  await page.goto(baseUrl);
  await page
    .getByRole("button", { name: "Pular — usar só minhas músicas" })
    .click();
  await page
    .getByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite)$/ })
    .waitFor();
}

/**
 * Prints the summary and shuts everything down. A step's own failure is
 * reported first; browser console errors fail an otherwise passing run.
 */
export async function finish(failure) {
  try {
    if (failure) throw failure;
    assert.deepEqual(consoleErrors, [], "browser reported errors");
    console.log(`\n${steps.length} steps passed`);
  } finally {
    await browser.close();
    await server.close();
  }
}

const NOTE_INDEX = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const CHORD_NOTES = {
  C: [
    ["C", 3],
    ["E", 3],
    ["G", 3],
    ["C", 4],
  ],
  G: [
    ["G", 2],
    ["B", 2],
    ["D", 3],
    ["G", 3],
  ],
  Am: [
    ["A", 2],
    ["C", 3],
    ["E", 3],
    ["A", 3],
  ],
  F: [
    ["F", 2],
    ["A", 2],
    ["C", 3],
    ["F", 3],
  ],
};

/**
 * A synthesized "band" as a WAV file: sustained chords with harmonics and
 * a kick drum on every beat, so tempo, key and chord detection have
 * something real to analyze.
 */
export function songWav(progression, secondsPerChord, bpm, rate = 22050) {
  const total = Math.round(progression.length * secondsPerChord * rate);
  const samples = new Float32Array(total);
  progression.forEach((name, index) => {
    const start = Math.round(index * secondsPerChord * rate);
    const length = Math.round(secondsPerChord * rate);
    for (const [note, octave] of CHORD_NOTES[name]) {
      const frequency =
        440 * 2 ** ((NOTE_INDEX.indexOf(note) - 9) / 12 + (octave - 4));
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        const envelope = Math.min(1, t * 50) * Math.exp(-t * 0.4);
        samples[start + i] +=
          0.08 *
          envelope *
          (Math.sin(2 * Math.PI * frequency * t) +
            0.4 * Math.sin(4 * Math.PI * frequency * t) +
            0.2 * Math.sin(6 * Math.PI * frequency * t));
      }
    }
  });
  for (let time = 0; time < total / rate; time += 60 / bpm) {
    const start = Math.round(time * rate);
    for (let i = 0; i < 0.08 * rate && start + i < total; i++) {
      const t = i / rate;
      samples[start + i] +=
        0.6 * Math.exp(-t * 40) * Math.sin(2 * Math.PI * 60 * t);
    }
  }
  const buffer = Buffer.alloc(44 + total * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + total * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) {
    buffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))),
      44 + i * 2,
    );
  }
  return buffer;
}
