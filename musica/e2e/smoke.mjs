// End-to-end smoke test: serves the production build and drives it in
// Chromium. Jamendo is replaced by canned responses (so the test runs
// offline and deterministically); the audio is a generated WAV so the
// browser really plays it. Usage: npm run test:e2e [-- --screenshots DIR]
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotArg = process.argv.indexOf("--screenshots");
const screenshotDir =
  screenshotArg > 0
    ? resolve(process.argv[screenshotArg + 1] ?? "screenshots")
    : null;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium",
].filter(Boolean);

function wav(seconds = 3, rate = 8000) {
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

const server = await preview({
  root,
  preview: { port: 4317, strictPort: false, host: "127.0.0.1" },
});
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath,
  args: ["--autoplay-policy=no-user-gesture-required", "--no-proxy-server"],
});
const audio = wav();
const consoleErrors = [];

async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  await context.route("https://api.jamendo.com/**", (route) =>
    route.fulfill({ json: jamendo(new URL(route.request().url())) }),
  );
  await context.route("https://audio.test/**", (route) =>
    route.fulfill({ body: audio, contentType: "audio/wav" }),
  );
  await context.route("https://img.test/**", (route) => {
    const id = new URL(route.request().url()).pathname.match(/\d+/)?.[0] ?? "0";
    return route.fulfill({ body: coverSvg(id), contentType: "image/svg+xml" });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return page;
}

async function shot(page, name) {
  if (screenshotDir)
    await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
}

const steps = [];
async function step(name, run) {
  await run();
  steps.push(name);
  console.log(`  ✓ ${name}`);
}

try {
  const page = await newPage({ width: 1280, height: 800 });
  const playerBar = page.locator(".player-bar");

  await step("asks for the Jamendo client ID on first visit", async () => {
    await page.goto(baseUrl);
    await page.getByRole("heading", { name: "Bem-vindo ao Sonora" }).waitFor();
    await shot(page, "1-setup");
  });

  await step(
    "keeps the button disabled until an ID is entered, then shows the home shelves",
    async () => {
      assert.equal(
        await page
          .getByRole("button", { name: "Começar a ouvir" })
          .isDisabled(),
        true,
      );
      await page.getByLabel("Client ID do Jamendo").fill("test-client");
      await page.getByRole("button", { name: "Começar a ouvir" }).click();
      await page
        .getByRole("heading", { name: "Em alta esta semana" })
        .waitFor();
      await page.getByText("Luz da Manhã").first().waitFor();
      await shot(page, "2-inicio");
    },
  );

  await step(
    "plays a track from a card and really plays the audio",
    async () => {
      await page
        .getByRole("button", { name: "Tocar Luz da Manhã" })
        .first()
        .click();
      await playerBar.getByText("Luz da Manhã").waitFor();
      await playerBar.getByRole("button", { name: "Pausar" }).waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector(".player-bar .time")?.textContent !== "0:00",
        null,
        { timeout: 5000 },
      );
    },
  );

  await step(
    "pauses, skips to the next track, and auto-advances when one ends",
    async () => {
      await playerBar.getByRole("button", { name: "Pausar" }).click();
      await playerBar
        .getByRole("button", { name: "Tocar", exact: true })
        .waitFor();
      await playerBar.getByRole("button", { name: "Próxima" }).click();
      await playerBar.getByText("Ondas").waitFor();
      // Each fake track lasts 3 s; the player must move on by itself.
      await playerBar.getByText("Cidade Neon").waitFor({ timeout: 8000 });
      await shot(page, "3-tocando");
    },
  );

  await step(
    "likes the playing track and lists it in Liked Songs",
    async () => {
      await playerBar.getByRole("button", { name: "Curtir" }).click();
      await page.goto(`${baseUrl}#/curtidas`);
      await page.getByRole("heading", { name: "Músicas Curtidas" }).waitFor();
      await page.locator(".track-list").getByText("Cidade Neon").waitFor();
    },
  );

  await step("searches tracks, artists and albums", async () => {
    await page.goto(`${baseUrl}#/buscar`);
    await page.getByText("Navegar por gênero").waitFor();
    await page.getByLabel("Buscar").fill("aurora");
    await page.getByRole("heading", { name: "Músicas" }).waitFor();
    await page.locator(".track-list").getByText("Horizonte").waitFor();
    await page.getByRole("heading", { name: "Artistas" }).waitFor();
    assert.match(page.url(), /q=aurora/);
    await shot(page, "4-busca");
  });

  await step("adds a track to a new playlist from the track menu", async () => {
    await page
      .getByRole("button", { name: "Mais opções para Horizonte" })
      .click();
    await page.getByRole("menuitem", { name: "Adicionar à playlist…" }).click();
    await page.getByRole("menuitem", { name: "+ Nova playlist" }).click();
    await page.getByText("Adicionada a uma nova playlist").waitFor();
    await page.locator(".sidebar").getByText("Minha playlist nº 1").click();
    await page.locator(".track-list").getByText("Horizonte").waitFor();
  });

  await step("keeps playlists and likes after a reload", async () => {
    await page.reload();
    await page.locator(".track-list").getByText("Horizonte").waitFor();
    await page.goto(`${baseUrl}#/curtidas`);
    await page.locator(".track-list").getByText("Cidade Neon").waitFor();
  });

  await step("opens album and artist pages", async () => {
    await page.goto(`${baseUrl}#/album/200`);
    await page.getByRole("heading", { name: "Primeira Luz" }).waitFor();
    await shot(page, "5-album");
    await page.goto(`${baseUrl}#/artista/10`);
    await page.getByRole("heading", { name: "Aurora Vale" }).waitFor();
    await page.getByRole("heading", { name: "Discografia" }).waitFor();
  });

  await step("shows Jamendo's error when the client ID is wrong", async () => {
    const bad = await newPage({ width: 1280, height: 800 });
    await bad.goto(baseUrl);
    await bad.getByLabel("Client ID do Jamendo").fill("wrong");
    await bad.getByRole("button", { name: "Começar a ouvir" }).click();
    await bad.getByText("Your credential is not authorized.").first().waitFor();
    await bad.getByRole("button", { name: "Tentar de novo" }).first().waitFor();
    await bad.context().close();
  });

  await step("works on a phone-sized screen with the mini player", async () => {
    const phone = await newPage({ width: 390, height: 844 });
    await phone.goto(baseUrl);
    await phone.getByLabel("Client ID do Jamendo").fill("test-client");
    await phone.getByRole("button", { name: "Começar a ouvir" }).click();
    await phone.getByRole("heading", { name: "Em alta esta semana" }).waitFor();
    assert.equal(await phone.locator(".sidebar").isVisible(), false);
    assert.equal(await phone.locator(".bottom-nav").isVisible(), true);
    const overflow = await phone.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    assert.equal(overflow, false, "page scrolls sideways on mobile");
    await phone.getByRole("button", { name: "Tocar Ondas" }).first().click();
    await phone.locator(".mini-play").waitFor();
    await shot(phone, "6-celular-inicio");
    await phone.getByRole("button", { name: "Abrir player" }).click();
    await phone.getByRole("dialog", { name: "Tocando agora" }).waitFor();
    await shot(phone, "7-celular-player");
    await phone.context().close();
  });

  assert.deepEqual(consoleErrors, [], "browser reported errors");
  console.log(`\n${steps.length} steps passed`);
} finally {
  await browser.close();
  await server.close();
}
