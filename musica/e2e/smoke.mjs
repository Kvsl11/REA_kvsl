// End-to-end test: serves the production build and drives it in Chromium.
// Jamendo is replaced by canned responses (so the test runs offline and
// deterministically); audio is generated WAV so the browser really plays
// it, and "imported" files are generated WAVs too. Show timing uses
// Playwright's clock to jump minutes ahead.
// Usage: npm run test:e2e [-- --screenshots DIR]
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

let jamendoRequests = 0;

async function newPage(viewport, { clock = false } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.route("https://api.jamendo.com/**", (route) => {
    jamendoRequests++;
    return route.fulfill({ json: jamendo(new URL(route.request().url())) });
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

/** Files as the import dialog would hand them over. */
const audioFile = (name, seconds = 3) => ({
  name,
  mimeType: "audio/wav",
  buffer: wav(seconds),
});

async function skipSetup(page) {
  await page.goto(baseUrl);
  await page
    .getByRole("button", { name: "Pular — usar só minhas músicas" })
    .click();
  await page
    .getByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite)$/ })
    .waitFor();
}

try {
  // ---------------------------------------------------------------- Jamendo
  const page = await newPage({ width: 1280, height: 800 });
  const playerBar = page.locator(".player-bar");

  await step(
    "asks for the Jamendo client ID (optional) on first visit",
    async () => {
      await page.goto(baseUrl);
      await page
        .getByRole("heading", { name: "Bem-vindo ao Sonora" })
        .waitFor();
      await page
        .getByRole("button", { name: "Pular — usar só minhas músicas" })
        .waitFor();
      await shot(page, "01-boas-vindas");
    },
  );

  await step("connects Jamendo and shows the catalog shelves", async () => {
    assert.equal(
      await page.getByRole("button", { name: "Começar a ouvir" }).isDisabled(),
      true,
    );
    await page.getByLabel("Client ID do Jamendo").fill("test-client");
    await page.getByRole("button", { name: "Começar a ouvir" }).click();
    await page.getByRole("heading", { name: "Em alta esta semana" }).waitFor();
    await page.getByText("Luz da Manhã").first().waitFor();
  });

  await step("plays a catalog track and really plays the audio", async () => {
    await page
      .getByRole("button", { name: "Tocar Luz da Manhã" })
      .first()
      .click();
    await playerBar.getByText("Luz da Manhã").waitFor();
    await playerBar.getByRole("button", { name: "Pausar" }).waitFor();
    await page.waitForFunction(
      () => document.querySelector(".player-bar .time")?.textContent !== "0:00",
      null,
      { timeout: 5000 },
    );
  });

  await step("pauses, skips, and auto-advances when a track ends", async () => {
    await playerBar.getByRole("button", { name: "Pausar" }).click();
    await playerBar
      .getByRole("button", { name: "Tocar", exact: true })
      .waitFor();
    await playerBar.getByRole("button", { name: "Próxima" }).click();
    await playerBar.getByText("Ondas").waitFor();
    await playerBar.getByText("Cidade Neon").waitFor({ timeout: 8000 });
    await shot(page, "02-inicio-tocando");
  });

  await step(
    "likes the playing track and lists it in Liked Songs",
    async () => {
      await playerBar.getByRole("button", { name: "Curtir" }).click();
      await page.goto(`${baseUrl}#/curtidas`);
      await page.locator(".track-list").getByText("Cidade Neon").waitFor();
    },
  );

  await step("searches the catalog", async () => {
    await page.goto(`${baseUrl}#/buscar`);
    await page.getByLabel("Buscar").fill("aurora");
    await page.locator(".track-list").getByText("Horizonte").waitFor();
    await page.getByRole("heading", { name: "Artistas" }).waitFor();
    assert.match(page.url(), /q=aurora/);
  });

  await step(
    "adds a catalog track to a new playlist from its menu",
    async () => {
      await page
        .getByRole("button", { name: "Mais opções para Horizonte" })
        .click();
      await page
        .getByRole("menuitem", { name: "Adicionar à playlist ou setlist…" })
        .click();
      await page.getByRole("menuitem", { name: "+ Nova playlist" }).click();
      await page.locator(".sidebar").getByText("Minha playlist nº 1").click();
      await page.locator(".track-list").getByText("Horizonte").waitFor();
    },
  );

  await step("opens album and artist pages", async () => {
    await page.goto(`${baseUrl}#/album/200`);
    await page.getByRole("heading", { name: "Primeira Luz" }).waitFor();
    await page.goto(`${baseUrl}#/artista/10`);
    await page.getByRole("heading", { name: "Discografia" }).waitFor();
  });

  await step("shows Jamendo's error when the client ID is wrong", async () => {
    const bad = await newPage({ width: 1280, height: 800 });
    await bad.goto(baseUrl);
    await bad.getByLabel("Client ID do Jamendo").fill("wrong");
    await bad.getByRole("button", { name: "Começar a ouvir" }).click();
    await bad.getByText("Your credential is not authorized.").first().waitFor();
    await bad.context().close();
  });
  await page.context().close();

  // ------------------------------------------------- Own files + live show
  jamendoRequests = 0;
  const band = await newPage({ width: 1280, height: 860 }, { clock: true });
  const bandPlayer = band.locator(".player-bar");

  await step("works without Jamendo and never calls it", async () => {
    await skipSetup(band);
    await band
      .getByRole("heading", { name: "Descubra mais músicas" })
      .waitFor();
    await band.getByRole("heading", { name: "Importe suas músicas" }).waitFor();
  });

  await step(
    "imports audio files, reading names and skipping non-audio",
    async () => {
      await band.goto(`${baseUrl}#/suas-musicas`);
      await band
        .getByRole("heading", { name: "Traga suas próprias músicas" })
        .waitFor();
      await band
        .getByTestId("import-input")
        .first()
        .setInputFiles([
          audioFile("01 - Banda Teste - Abertura.wav"),
          audioFile("Banda Teste - Segunda.wav", 4),
          audioFile("Final.wav", 2),
          {
            name: "notas.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("oi"),
          },
        ]);
      await band.getByText("3 músicas importadas").waitFor();
      await band.getByText("notas.txt — não é um arquivo de áudio").waitFor();
      const list = band.locator(".track-list");
      await list.getByText("Abertura").waitFor();
      await list.getByText("Banda Teste").first().waitFor();
      await list.getByText("Final").waitFor();
    },
  );

  await step("skips a file that was already imported", async () => {
    await band
      .getByTestId("import-input")
      .first()
      .setInputFiles([audioFile("Final.wav", 2)]);
    await band.getByText("Final.wav — já estava importada").waitFor();
    assert.equal(await band.locator(".track-list .track-row").count(), 3);
  });

  await step(
    "edits missing data and stage info of an imported song",
    async () => {
      await band
        .getByRole("button", { name: "Mais opções para Final" })
        .click();
      await band.getByRole("menuitem", { name: "Editar informações" }).click();
      const dialog = band.getByRole("dialog", { name: "Editar música" });
      await dialog.getByLabel("Título").fill("Final (Bis)");
      await dialog.getByLabel("Artista").fill("Banda Teste");
      await dialog.getByLabel("Álbum").fill("Ao Vivo");
      await dialog.getByLabel("Ano").fill("2026");
      await dialog.getByLabel("Tom").fill("Am");
      await dialog.getByLabel("BPM").fill("96");
      await dialog.getByLabel(/Notas/).fill("Encerrar com o público cantando");
      await shot(band, "03-editar-musica");
      await dialog.getByRole("button", { name: "Salvar" }).click();
      await band.getByText("Informações salvas").waitFor();
      const row = band.locator(".track-row", { hasText: "Final (Bis)" });
      await row.getByText("Am").waitFor();
      await row.getByText("96 bpm").waitFor();
    },
  );

  await step("rejects invalid edits with a message", async () => {
    await band
      .getByRole("button", { name: "Mais opções para Abertura" })
      .click();
    await band.getByRole("menuitem", { name: "Editar informações" }).click();
    const dialog = band.getByRole("dialog", { name: "Editar música" });
    await dialog.getByLabel("BPM").fill("muito rápido");
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await dialog.getByText("BPM deve ser um número entre 1 e 400.").waitFor();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
  });

  await step("plays an imported file from browser storage", async () => {
    await band.getByRole("button", { name: "Tocar Abertura" }).click();
    await bandPlayer.getByText("Abertura").waitFor();
    await bandPlayer.getByRole("button", { name: "Pausar" }).waitFor();
    // 3 s file, then the queue moves on by itself.
    await bandPlayer.getByText("Segunda").waitFor({ timeout: 10000 });
    await bandPlayer.getByRole("button", { name: "Pausar" }).click();
    await shot(band, "04-suas-musicas");
  });

  await step("builds a setlist and reorders it", async () => {
    await band.goto(`${baseUrl}#/shows`);
    await band.getByRole("button", { name: "Criar setlist" }).click();
    await band.getByRole("heading", { name: "Setlist nº 1" }).waitFor();
    await band
      .getByRole("button", { name: "Adicionar músicas" })
      .first()
      .click();
    const picker = band.getByRole("dialog", { name: "Adicionar ao setlist" });
    for (const title of ["Abertura", "Segunda", "Final (Bis)"]) {
      await picker
        .getByRole("button", { name: `Adicionar ${title}`, exact: true })
        .click();
    }
    await picker.getByRole("button", { name: /Pronto/ }).click();
    await band.getByRole("button", { name: "Descer Abertura" }).click();
    const order = await band
      .locator(".track-list .track-title")
      .allTextContents();
    assert.deepEqual(order, ["Segunda", "Abertura", "Final (Bis)"]);
    await shot(band, "05-setlist");
  });

  await step(
    "starts a live show and records each song with real timing",
    async () => {
      await band.getByRole("button", { name: "Iniciar show" }).click();
      const dialog = band.getByRole("dialog", { name: "Iniciar show" });
      await dialog.getByLabel("Nome do show").fill("Sexta no Bar do Zé");
      await dialog.getByLabel("Local (opcional)").fill("Bar do Zé");
      await dialog.getByRole("button", { name: "Começar a gravar" }).click();
      await band.getByRole("heading", { name: "Sexta no Bar do Zé" }).waitFor();
      await band.getByText("Pronto para começar").waitFor();

      await band.clock.fastForward("00:30"); // talking before the first song
      await band.getByRole("button", { name: "Começar: Segunda" }).click();
      await band.locator(".live-title", { hasText: "Segunda" }).waitFor();
      await band.clock.fastForward("03:10");
      await band.getByRole("button", { name: "Próxima música" }).click();
      await band.locator(".live-title", { hasText: "Abertura" }).waitFor();
      await band.clock.fastForward("02:00");
      await band
        .getByRole("button", { name: "Intervalo", exact: true })
        .click();
      await band.getByText("Na volta: Final (Bis)").waitFor();
      await band.clock.fastForward("10:00");
      await band.getByRole("button", { name: "Voltar do intervalo" }).click();
      await band.getByRole("button", { name: "Começar: Final (Bis)" }).click();
      // Stage info shows big for the song on stage.
      await band.locator(".live-stage").getByText("Am").waitFor();
      await band
        .locator(".live-notes", { hasText: "público cantando" })
        .waitFor();
      await band.clock.fastForward("01:40");
      await band.waitForFunction(
        () =>
          document.querySelector(".live-total-time")?.textContent === "17:20",
        null,
        { timeout: 5000 },
      );
      await shot(band, "06-show-ao-vivo");
    },
  );

  await step("keeps a show in progress across a reload", async () => {
    await band.reload();
    await band.locator(".live-title", { hasText: "Final (Bis)" }).waitFor();
    await band.locator(".sidebar .nav-live").waitFor();
  });

  await step("ends the show and opens a song-by-song report", async () => {
    await band.getByRole("button", { name: "Encerrar show" }).click();
    await band
      .getByRole("alertdialog")
      .getByRole("button", { name: "Encerrar show" })
      .click();
    await band.getByText("Relatório do show").waitFor();
    const cards = band.locator(".stat-card");
    await cards
      .filter({ hasText: "duração total" })
      .getByText("17:20")
      .waitFor();
    await cards.filter({ hasText: "1 intervalo" }).getByText("10:00").waitFor();
    await cards.filter({ hasText: "do setlist" }).getByText("3/3").waitFor();
    const rows = band.locator(".data-table tbody tr");
    assert.equal(await rows.count(), 3);
    await rows.nth(0).getByText("03:10").waitFor();
    await rows.nth(1).getByText("02:00").waitFor();
    await band.getByLabel("Nome do show").waitFor();
    await band
      .locator(".notes-area")
      .fill("Público animado, repetir a abertura");
    await band.locator(".notes-area").blur();
    await band.getByText("Anotações salvas").waitFor();
    await shot(band, "07-relatorio-show");
  });

  await step("exports the show as a spreadsheet", async () => {
    const [download] = await Promise.all([
      band.waitForEvent("download"),
      band.getByRole("button", { name: "Exportar planilha (CSV)" }).click(),
    ]);
    assert.equal(download.suggestedFilename(), "Sexta no Bar do Ze.csv");
    const path = await download.path();
    const { readFile } = await import("node:fs/promises");
    const csv = await readFile(path, "utf8");
    assert.match(csv, /Duração total;17:2\d/); // the clock keeps running during the test
    assert.match(csv, /Segunda;Banda Teste;[^;]+;3:10/);
  });

  await step("counts show songs and listening in statistics", async () => {
    await band.goto(`${baseUrl}#/estatisticas`);
    await band.getByRole("heading", { name: "Estatísticas" }).waitFor();
    await band.getByRole("heading", { name: "Músicas mais tocadas" }).waitFor();
    const top = band.locator(".rank-list").first();
    await top.getByText("Segunda").waitFor();
    await band.getByRole("button", { name: "Em shows" }).click();
    const showCard = band.locator(".stat-card", { hasText: "vezes tocadas" });
    await showCard.getByText("3", { exact: true }).waitFor();
    await band.getByRole("button", { name: "Ver tabela" }).click();
    await band.locator(".chart-panel .data-table").waitFor();
    await band.getByRole("button", { name: "Ver gráfico" }).click();
    await band.getByRole("button", { name: "Tudo" }).first().click();
    await band.getByRole("heading", { name: "Tocadas recentemente" }).waitFor();
    await band.locator("table").last().getByText("Abertura").waitFor();
    await shot(band, "08-estatisticas");
  });

  await step("shows per-song details with plays in shows", async () => {
    await band
      .locator(".rank-list")
      .first()
      .getByRole("link", { name: "Final (Bis)" })
      .click();
    await band.getByRole("heading", { name: "Final (Bis)" }).waitFor();
    await band
      .locator(".stat-card", { hasText: "vezes em shows" })
      .getByText("1")
      .waitFor();
    await band
      .locator(".facts")
      .getByText("Encerrar com o público cantando")
      .waitFor();
    await band.getByText("Show: Sexta no Bar do Zé").waitFor();
  });

  await step(
    "lists past shows and keeps everything after a reload",
    async () => {
      await band.reload();
      await band.goto(`${baseUrl}#/shows`);
      await band.getByRole("link", { name: "Sexta no Bar do Zé" }).waitFor();
      await band.goto(`${baseUrl}#/suas-musicas`);
      assert.equal(await band.locator(".track-list .track-row").count(), 3);
    },
  );

  await step("records a playback show from the player by itself", async () => {
    await band.goto(`${baseUrl}#/shows`);
    await band.getByRole("button", { name: "Iniciar show" }).first().click();
    const dialog = band.getByRole("dialog", { name: "Iniciar show" });
    await dialog.getByLabel("Nome do show").fill("Playback");
    await dialog.getByText("Tocar as músicas").click();
    await dialog.getByRole("button", { name: "Começar a gravar" }).click();
    await band.locator(".live-title", { hasText: "Segunda" }).waitFor();
    // Files are 4 s, 3 s and 2 s long; the player advances and the show follows.
    await band
      .locator(".live-title", { hasText: "Abertura" })
      .waitFor({ timeout: 10000 });
    await band
      .locator(".live-title", { hasText: "Final (Bis)" })
      .waitFor({ timeout: 10000 });
    await band.waitForFunction(
      () => document.querySelectorAll(".live-setlist li.is-done").length === 3,
      null,
      { timeout: 10000 },
    );
    await band.getByRole("button", { name: "Encerrar show" }).click();
    await band
      .getByRole("alertdialog")
      .getByRole("button", { name: "Encerrar show" })
      .click();
    await band
      .locator(".stat-card", { hasText: "do setlist" })
      .getByText("3/3")
      .waitFor();
  });

  await step("exports and restores a full backup", async () => {
    await band.goto(`${baseUrl}#/configuracoes`);
    await band.getByLabel(/Incluir os arquivos de áudio/).check();
    const [download] = await Promise.all([
      band.waitForEvent("download"),
      band.getByRole("button", { name: "Exportar backup" }).click(),
    ]);
    const path = await download.path();
    const fresh = await newPage({ width: 1280, height: 800 });
    await skipSetup(fresh);
    await fresh.goto(`${baseUrl}#/configuracoes`);
    fresh.on("dialog", (dialog) => dialog.accept());
    await fresh
      .locator('input[type="file"][accept*="json"]')
      .setInputFiles(path);
    await fresh.getByText("Backup restaurado. Recarregando…").waitFor();
    await fresh.waitForLoadState("load");
    await fresh.goto(`${baseUrl}#/shows`);
    await fresh
      .getByRole("link", { name: "Sexta no Bar do Zé" })
      .waitFor({ timeout: 10000 });
    await fresh.goto(`${baseUrl}#/suas-musicas`);
    await fresh.locator(".track-list").getByText("Final (Bis)").waitFor();
    await fresh.context().close();
  });

  assert.equal(jamendoRequests, 0, "called Jamendo although it was skipped");

  await step(
    "works on a phone: mini player, bottom nav, live show",
    async () => {
      await band.setViewportSize({ width: 390, height: 844 });
      await band.goto(`${baseUrl}#/`);
      assert.equal(await band.locator(".sidebar").isVisible(), false);
      assert.equal(await band.locator(".bottom-nav").isVisible(), true);
      const overflow = await band.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(overflow, false, "page scrolls sideways on mobile");
      await shot(band, "09-celular-inicio");
      await band.goto(
        `${baseUrl}#/playlist/${await band.evaluate(() => {
          const library = JSON.parse(
            localStorage.getItem("sonora.library.v1") ?? "{}",
          );
          return library.playlists.find((item) => item.kind === "setlist").id;
        })}`,
      );
      await band.getByRole("button", { name: "Iniciar show" }).click();
      await band
        .getByRole("dialog", { name: "Iniciar show" })
        .getByRole("button", { name: "Começar a gravar" })
        .click();
      await band.getByRole("button", { name: "Começar: Segunda" }).click();
      await band.clock.fastForward("02:05");
      await band.locator(".live-title", { hasText: "Segunda" }).waitFor();
      const liveOverflow = await band.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(liveOverflow, false, "live show scrolls sideways on mobile");
      await shot(band, "10-celular-show");
      await band.getByRole("button", { name: "Encerrar show" }).click();
      await band
        .getByRole("alertdialog")
        .getByRole("button", { name: "Encerrar show" })
        .click();
      await band.getByText("Relatório do show").waitFor();
    },
  );

  assert.deepEqual(consoleErrors, [], "browser reported errors");
  console.log(`\n${steps.length} steps passed`);
} finally {
  await browser.close();
  await server.close();
}
