// End-to-end test of the app: catalog playback, imported files, editing,
// setlists, live and playback shows, reports, statistics, backup, mobile.
// Show timing uses Playwright's clock to jump minutes ahead.
// Usage: node e2e/smoke.mjs [--screenshots DIR] (after `vite build`).
import assert from "node:assert/strict";
import {
  audioFile,
  baseUrl,
  finish,
  jamendoRequests,
  newPage,
  resetJamendoRequests,
  shot,
  skipSetup,
  step,
} from "./harness.mjs";

let failure;
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
  resetJamendoRequests();
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
} catch (error) {
  failure = error;
} finally {
  await finish(failure);
}
