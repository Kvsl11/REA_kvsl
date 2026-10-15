// End-to-end test of lyrics: automatic lookup with synced highlighting,
// seeking from a line, timing offset, pasting plain lyrics and syncing
// them by tapping, importing a .lrc file, the mobile player card, and the
// teleprompter in show mode.
// Usage: node e2e/lyrics.mjs [--screenshots DIR] (after `vite build`).
import assert from "node:assert/strict";
import {
  audioFile,
  baseUrl,
  finish,
  lrclibRequests,
  newPage,
  shot,
  skipSetup,
  step,
} from "./harness.mjs";

let failure;
try {
  const page = await newPage({ width: 1280, height: 800 });
  const playerBar = page.locator(".player-bar");
  const lyrics = page.getByTestId("lyrics");

  await step(
    "finds synced lyrics online and follows the song line by line",
    async () => {
      await page.goto(baseUrl);
      await page.getByLabel("Client ID do Jamendo").fill("test-client");
      await page.getByRole("button", { name: "Começar a ouvir" }).click();
      await page
        .getByRole("button", { name: "Tocar Luz da Manhã" })
        .first()
        .click();
      await playerBar.getByText("Luz da Manhã").waitFor();
      await playerBar.getByRole("button", { name: "Letra" }).click();
      await page
        .getByRole("heading", { name: /Luz da Manhã/ })
        .or(page.locator(".lyrics-header"))
        .first()
        .waitFor();
      await lyrics.getByText("Primeira luz do dia").waitFor();
      // The 3 s track has lines at 0.1 s, 1.1 s and 2.1 s.
      await lyrics
        .locator(".lyrics-line.is-active", {
          hasText: "Segunda linha da manhã",
        })
        .waitFor();
      await lyrics
        .locator(".lyrics-line.is-active", { hasText: "Terceira e última" })
        .waitFor();
      await page.getByText("Letra: LRCLIB").waitFor();
      assert.ok(lrclibRequests > 0);
    },
  );

  await step(
    "jumps to a line when it is tapped and adjusts the timing",
    async () => {
      await playerBar
        .getByRole("button", { name: "Pausar" })
        .click()
        .catch(() => {});
      await lyrics.getByRole("button", { name: "Primeira luz do dia" }).click();
      await lyrics
        .locator(".lyrics-line.is-active", { hasText: "Primeira luz do dia" })
        .waitFor();
      await page.getByRole("button", { name: "Letra mais cedo" }).click();
      await page
        .locator(".lyrics-offset-value", { hasText: "−0,25 s" })
        .waitFor();
      await page.getByRole("button", { name: "Letra mais tarde" }).click();
      await page
        .locator(".lyrics-offset-value", { hasText: "sincronia" })
        .waitFor();
      await shot(page, "11-letra-sincronizada");
    },
  );

  await step("shows plain lyrics and offers to sync them", async () => {
    await playerBar.getByRole("button", { name: "Próxima" }).click();
    await playerBar.getByText("Ondas").waitFor();
    await page.getByText("Esta letra não está sincronizada.").waitFor();
    await page.locator(".lyrics-plain").getByText("Como as ondas").waitFor();
  });

  await step("searches lyrics by hand and picks a result", async () => {
    await page.getByRole("button", { name: "Editar" }).click();
    const dialog = page.getByRole("dialog", { name: /Letra:/ });
    await dialog.getByRole("tab", { name: "Buscar" }).click();
    await dialog.getByLabel("Música").fill("luz da manhã");
    await dialog.getByRole("button", { name: "Buscar", exact: true }).click();
    await dialog.getByText("sincronizada").first().waitFor();
    await dialog
      .getByRole("button", { name: /Usar a letra de/ })
      .first()
      .click();
    await page.getByText("Letra sincronizada salva").waitFor();
    // Saved for "Ondas" now: synced view replaces the plain one.
    await lyrics.getByText("Primeira luz do dia").waitFor();
  });
  await page.context().close();

  // ------------------------------------------------------ Own files + sync
  const band = await newPage({ width: 1280, height: 860 });
  const bandLyrics = band.getByTestId("lyrics");

  await step(
    "pastes lyrics for an imported song and syncs them by tapping",
    async () => {
      await skipSetup(band);
      await band.goto(`${baseUrl}#/suas-musicas`);
      await band
        .getByTestId("import-input")
        .first()
        .setInputFiles([
          audioFile("Banda Teste - Abertura.wav", 4),
          audioFile("Banda Teste - Segunda.wav", 4),
        ]);
      await band.getByText("2 músicas importadas").waitFor();
      await band.getByRole("button", { name: "Tocar Abertura" }).click();
      await band
        .locator(".player-bar")
        .getByRole("button", { name: "Letra" })
        .click();
      await band.getByText("Não encontramos a letra desta música").waitFor();
      await band.getByRole("button", { name: "Colar ou importar" }).click();
      const dialog = band.getByRole("dialog", { name: /Letra:/ });
      await dialog
        .getByLabel("Letra")
        .fill("Abre a cortina\n\nO show vai começar\nCanta comigo");
      await dialog
        .getByText("Letra sem sincronia: 3 linhas.", { exact: false })
        .waitFor();
      await dialog.getByRole("button", { name: "Salvar letra" }).click();
      await band.getByRole("button", { name: "Sincronizar agora" }).click();

      await band
        .getByRole("heading", { name: "Sincronizar: Abertura" })
        .waitFor();
      await band.getByRole("button", { name: "Tocar do início" }).click();
      for (const line of [
        "Abre a cortina",
        "O show vai começar",
        "Canta comigo",
      ]) {
        await band.waitForTimeout(700);
        await band.locator(".sync-line.is-cursor", { hasText: line }).waitFor();
        await band.keyboard.press("Space");
      }
      // Space marked lines instead of pausing the song.
      assert.equal(await band.locator(".sync-line.is-marked").count(), 3);
      await shot(band, "12-sincronizar");
      await band.getByRole("button", { name: "Salvar sincronia" }).click();
      await band.getByText("Letra sincronizada!").waitFor();
      await bandLyrics.locator(".lyrics-line").first().waitFor();
      assert.equal(await bandLyrics.locator(".lyrics-line").count(), 3);
      await band.getByText("Sincronizada por você").waitFor();
    },
  );

  await step("imports a .lrc file from the song menu", async () => {
    await band.goto(`${baseUrl}#/suas-musicas`);
    await band
      .getByRole("button", { name: "Mais opções para Segunda" })
      .click();
    await band.getByRole("menuitem", { name: "Letra…" }).click();
    const dialog = band.getByRole("dialog", { name: /Letra:/ });
    await dialog.getByRole("tab", { name: "Escrever ou colar" }).click();
    await dialog.getByTestId("lyrics-file").setInputFiles({
      name: "segunda.lrc",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "[00:00.50]Segunda canção, verso um\n[00:02.00]Verso dois do palco",
      ),
    });
    await dialog.getByText("Letra sincronizada: 2 linhas com tempo.").waitFor();
    await dialog.getByRole("button", { name: "Salvar letra" }).click();
    await band
      .getByRole("button", { name: "Mais opções para Segunda" })
      .click();
    await band
      .getByRole("menuitem", { name: "Detalhes e estatísticas" })
      .click();
    const panel = band.locator(".panel", { hasText: "Letra" }).first();
    await panel.getByText("Sincronizada").waitFor();
    await panel.getByText("Segunda canção, verso um").waitFor();
  });

  await step("shows lyrics as a teleprompter during a live show", async () => {
    await band.goto(`${baseUrl}#/shows`);
    await band.getByRole("button", { name: "Criar setlist" }).click();
    await band
      .getByRole("button", { name: "Adicionar músicas" })
      .first()
      .click();
    const picker = band.getByRole("dialog", { name: "Adicionar ao setlist" });
    await picker
      .getByRole("button", { name: "Adicionar Segunda", exact: true })
      .click();
    await picker
      .getByRole("button", { name: "Adicionar Abertura", exact: true })
      .click();
    await picker.getByRole("button", { name: /Pronto/ }).click();
    await band.getByRole("button", { name: "Iniciar show" }).click();
    await band
      .getByRole("dialog", { name: "Iniciar show" })
      .getByRole("button", { name: "Começar a gravar" })
      .click();
    await band.getByRole("button", { name: "Começar: Segunda" }).click();
    const stage = band.locator(".stage-lyrics");
    await stage.getByText("Segunda canção, verso um").waitFor();
    // Live: lines follow the song's stopwatch.
    await stage
      .locator(".lyrics-line.is-active", { hasText: "Verso dois do palco" })
      .waitFor({ timeout: 5000 });
    await shot(band, "13-show-letra");
    await band.getByRole("button", { name: "Próxima música" }).click();
    await stage.getByText("Abre a cortina").waitFor();
    await band.getByRole("button", { name: "Encerrar show" }).click();
    await band
      .getByRole("alertdialog")
      .getByRole("button", { name: "Encerrar show" })
      .click();
  });

  await step(
    "shows a lyrics card in the phone's full-screen player",
    async () => {
      await band.setViewportSize({ width: 390, height: 844 });
      await band.goto(`${baseUrl}#/suas-musicas`);
      // On phones a song plays by tapping its name.
      await band.locator(".track-title", { hasText: "Abertura" }).click();
      await band.getByRole("button", { name: "Abrir player" }).click();
      const card = band.locator(".now-playing-lyrics");
      await card.getByText("Abre a cortina").waitFor();
      await shot(band, "14-celular-letra");
      await card.getByRole("button", { name: "Mostrar tudo" }).click();
      await bandLyrics.getByText("Canta comigo").waitFor();
      const overflow = await band.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(overflow, false, "lyrics page scrolls sideways on mobile");
    },
  );
} catch (error) {
  failure = error;
} finally {
  await finish(failure);
}
