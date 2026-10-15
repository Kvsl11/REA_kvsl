// End-to-end test of the AI analysis on a synthesized song (chords
// C–G–Am–F twice, kick drum at 100 BPM): tempo, key and chord detection
// run for real in the browser; only the speech model is replaced by
// canned words (a real Whisper download is too big for CI).
// Usage: node e2e/ai.mjs [--screenshots DIR] (after `vite build`).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  baseUrl,
  finish,
  modelRequests,
  newPage,
  shot,
  skipSetup,
  songWav,
  step,
} from "./harness.mjs";

const PROGRESSION = ["C", "G", "Am", "F", "C", "G", "Am", "F"];
const SECONDS_PER_CHORD = 2.4;

/** What the "singer" sings, as a recognizer would time it. */
const SUNG = [
  ["abre", 2.5],
  ["a", 2.8],
  ["cortina", 3.0],
  ["o", 7.3],
  ["show", 7.5],
  ["vai", 7.8],
  ["começar", 8.0],
  ["canta", 12.0],
  ["comigo", 12.4],
  ["até", 17.0],
  ["o", 17.3],
  ["fim", 17.5],
].map(([text, start]) => ({ text, start, end: start + 0.3 }));

let failure;
try {
  const page = await newPage(
    { width: 1280, height: 860 },
    { fakeTranscriber: SUNG },
  );
  const dialog = page.getByRole("dialog", { name: /Analisar com IA/ });

  await step("imports a song and adds its lyrics", async () => {
    await skipSetup(page);
    await page.goto(`${baseUrl}#/suas-musicas`);
    await page
      .getByTestId("import-input")
      .first()
      .setInputFiles([
        {
          name: "Banda Teste - Progressão.wav",
          mimeType: "audio/wav",
          buffer: songWav(PROGRESSION, SECONDS_PER_CHORD, 100),
        },
        {
          name: "Banda Teste - Sem Letra.wav",
          mimeType: "audio/wav",
          buffer: songWav(["C", "G", "C", "G"], SECONDS_PER_CHORD, 100),
        },
      ]);
    await page.getByText("2 músicas importadas").waitFor();
    await page
      .getByRole("button", { name: "Mais opções para Progressão" })
      .click();
    await page.getByRole("menuitem", { name: "Letra…" }).click();
    const editor = page.getByRole("dialog", { name: /Letra:/ });
    await editor.getByRole("tab", { name: "Escrever ou colar" }).click();
    await editor
      .getByLabel("Letra")
      .fill("Abre a cortina\nO show vai começar\nCanta comigo\nAté o fim");
    await editor.getByRole("button", { name: "Salvar letra" }).click();
  });

  await step(
    "analyzes tempo, key and chords and syncs the lyrics to the voice",
    async () => {
      await page
        .getByRole("button", { name: "Mais opções para Progressão" })
        .click();
      await page.getByRole("menuitem", { name: /Analisar com IA/ }).click();
      // With lyrics saved, syncing them becomes the default once they load.
      await dialog
        .locator("input[type=radio]:checked")
        .and(
          dialog.getByRole("radio", { name: /Sincronizar a letra com a voz/ }),
        )
        .waitFor();
      await dialog
        .getByRole("button", { name: "Analisar", exact: true })
        .and(page.locator(":enabled"))
        .waitFor();
      await shot(page, "15-ia-opcoes");
      await dialog
        .getByRole("button", { name: "Analisar", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Salvar" })
        .waitFor({ timeout: 60000 });
      const bpm = Number(
        await dialog
          .locator(".stat-card")
          .first()
          .locator(".stat-value")
          .textContent(),
      );
      assert.ok(bpm > 97 && bpm < 103, `BPM ${bpm}`);
      const key = await dialog
        .locator(".stat-card")
        .nth(1)
        .locator(".stat-value")
        .textContent();
      assert.ok(["C", "Am"].includes(key), `key ${key}`);
      const chords = await dialog.locator(".ai-chords .chip").allTextContents();
      assert.deepEqual(chords, PROGRESSION);
      await dialog.getByText("Letra sincronizada (4 linhas)").waitFor();
      await shot(page, "16-ia-resultado");
      assert.equal(modelRequests, 0, "the fake transcriber should be used");
    },
  );

  await step("saves and shows the chord chart over the lyrics", async () => {
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await page.getByText("Análise salva").waitFor();
    const chart = page.getByTestId("chart");
    await chart.getByText("Abre a cortina").waitFor();
    const chordRows = await chart.locator(".chart-chords").allTextContents();
    const allChords = [
      ...(await chart.locator(".chart-chord").allTextContents()),
      ...chordRows.flatMap((row) => row.trim().split(/\s+/)),
    ];
    for (const chord of ["C", "G", "Am", "F"])
      assert.ok(allChords.includes(chord), `missing ${chord}`);
    await page.locator(".cifra-fact", { hasText: "BPM" }).waitFor();
    await shot(page, "17-cifra");
  });

  await step("transposes the chart and exports it as text", async () => {
    await page.getByRole("button", { name: "Meio tom acima" }).click();
    await page.getByRole("button", { name: "Meio tom acima" }).click();
    await page.getByText("+1 tom").waitFor();
    const rows = (
      await page.getByTestId("chart").locator(".chart-chords").allTextContents()
    ).join(" ");
    assert.match(rows, /\bA\b|\bBm\b|\bG\b|\bD\b/);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar .txt" }).click(),
    ]);
    const text = await readFile(await download.path(), "utf8");
    assert.match(text, /Tom: (D|Bm)/);
    assert.match(text, /Abre a cortina/);
  });

  await step(
    "keeps the AI-synced lyrics, key and BPM with the song",
    async () => {
      await page
        .locator(".cifra-page")
        .getByRole("button", { name: "Tocar" })
        .click();
      await page
        .locator(".player-bar")
        .getByRole("button", { name: "Letra" })
        .click();
      await page.getByText(/Sincronizada pela IA/).waitFor();
      await page
        .getByTestId("lyrics")
        .locator(".lyrics-line.is-active", { hasText: "O show vai começar" })
        .waitFor({ timeout: 15000 });
      await page.goto(`${baseUrl}#/suas-musicas`);
      const row = page.locator(".track-row", { hasText: "Progressão" });
      await row.locator(".chip").first().waitFor();
      const chips = await row.locator(".chip").allTextContents();
      assert.ok(chips.some((chip) => /bpm/.test(chip)));
    },
  );

  await step(
    "shows the current chord and the chart during a live show",
    async () => {
      await page.goto(`${baseUrl}#/shows`);
      await page.getByRole("button", { name: "Criar setlist" }).click();
      await page
        .getByRole("button", { name: "Adicionar músicas" })
        .first()
        .click();
      const picker = page.getByRole("dialog", { name: "Adicionar ao setlist" });
      await picker
        .getByRole("button", { name: "Adicionar Progressão", exact: true })
        .click();
      await picker.getByRole("button", { name: /Pronto/ }).click();
      await page.getByRole("button", { name: "Iniciar show" }).click();
      await page
        .getByRole("dialog", { name: "Iniciar show" })
        .getByText("Tocar as músicas")
        .click();
      await page
        .getByRole("dialog", { name: "Iniciar show" })
        .getByRole("button", { name: "Começar a gravar" })
        .click();
      await page.locator(".chord-now-current").waitFor();
      await page
        .locator(".stage-lyrics")
        .getByTestId("chart")
        .getByText("Canta comigo")
        .waitFor();
      await page
        .locator(".chord-now-current", { hasText: /^Agora(G|Am|F|C)$/ })
        .waitFor({ timeout: 15000 });
      await shot(page, "18-show-cifra");
      await page.getByRole("button", { name: "Encerrar show" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Encerrar show" })
        .click();
    },
  );

  await step(
    "writes lyrics from the voice when the song has none",
    async () => {
      await page.goto(`${baseUrl}#/suas-musicas`);
      await page
        .getByRole("button", { name: "Mais opções para Sem Letra" })
        .click();
      await page.getByRole("menuitem", { name: /Analisar com IA/ }).click();
      // No lyrics anywhere: once the lookup ends, only "from the voice" is possible.
      await dialog
        .getByRole("button", { name: "Analisar", exact: true })
        .and(page.locator(":enabled"))
        .waitFor();
      assert.equal(
        await dialog
          .getByRole("radio", { name: /Sincronizar a letra com a voz/ })
          .isDisabled(),
        true,
      );
      await dialog
        .getByRole("button", { name: "Analisar", exact: true })
        .click();
      await dialog
        .getByText("Letra reconhecida (4 linhas)")
        .waitFor({ timeout: 60000 });
      await dialog.getByText("Abre a cortina").waitFor();
      const chords = await dialog.locator(".ai-chords .chip").allTextContents();
      assert.deepEqual(chords, ["C", "G", "C", "G"]);
      await dialog.getByRole("button", { name: "Salvar" }).click();
      await page.getByTestId("chart").getByText("O show vai começar").waitFor();
    },
  );
} catch (error) {
  failure = error;
} finally {
  await finish(failure);
}
