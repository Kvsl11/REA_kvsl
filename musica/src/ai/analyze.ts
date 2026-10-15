import type { Track } from "../api/types";
import { linesForSync, type LyricLine } from "../lyrics/lrc";
import { alignLyrics, wordsToLines, type TimedWord } from "./align";
import type { AnalysisMessage, MusicAnalysis } from "./analysis.worker";
import { decodeAudio, resampleMono, trackAudio } from "./decode";
import type { WhisperMessage, WhisperModel } from "./whisper.worker";

export type { MusicAnalysis } from "./analysis.worker";
export type { WhisperModel } from "./whisper.worker";

export type Stage =
  | "audio"
  | "tempo"
  | "key"
  | "chords"
  | "model"
  | "listening"
  | "aligning";

export interface AnalyzeProgress {
  stage: Stage;
  /** 0–1 when known (model download). */
  progress?: number;
}

export interface AnalyzeOptions {
  music: boolean;
  /** align: time the given lyrics against the voice; transcribe: write them from the voice. */
  lyrics: "none" | "align" | "transcribe";
  knownLyrics: string;
  model: WhisperModel;
  language: string | null;
}

export interface LyricsResult {
  lines: LyricLine[];
  mode: "align" | "transcribe";
  /** For alignment: share of lyric words heard (quality hint). */
  coverage: number;
  wordLevel: boolean;
}

export interface AnalyzeResult {
  music: MusicAnalysis | null;
  lyrics: LyricsResult | null;
}

const ANALYSIS_RATE = 22050;
const SPEECH_RATE = 16000;

class Cancelled extends Error {
  constructor() {
    super("Análise cancelada.");
    this.name = "AbortError";
  }
}

function runAnalysisWorker(
  samples: Float32Array,
  onProgress: (progress: AnalyzeProgress) => void,
  signal: AbortSignal,
): Promise<MusicAnalysis> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./analysis.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    const stop = () => {
      worker.terminate();
      reject(new Cancelled());
    };
    signal.addEventListener("abort", stop, { once: true });
    worker.onmessage = (event: MessageEvent<AnalysisMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress({ stage: message.stage });
        return;
      }
      signal.removeEventListener("abort", stop);
      worker.terminate();
      if (message.type === "done") resolve(message.result);
      else reject(new Error(message.message));
    };
    worker.onerror = (event) => {
      signal.removeEventListener("abort", stop);
      worker.terminate();
      reject(new Error(event.message || "Falha na análise do áudio."));
    };
    worker.postMessage({ samples, sampleRate: ANALYSIS_RATE }, [
      samples.buffer,
    ]);
  });
}

/** Kept alive between runs so the speech model loads only once per visit. */
let whisperWorker: Worker | null = null;

/** Test seam: browser tests replace the speech model with canned words. */
type FakeTranscriber = (samples: Float32Array) => Promise<TimedWord[]>;
const fakeTranscriber = () =>
  (globalThis as { __sonoraFakeTranscriber?: FakeTranscriber })
    .__sonoraFakeTranscriber;

function runWhisper(
  samples: Float32Array,
  speech: { model: WhisperModel; language: string | null },
  onProgress: (progress: AnalyzeProgress) => void,
  signal: AbortSignal,
): Promise<{ words: TimedWord[]; wordLevel: boolean }> {
  const { model, language } = speech;
  const fake = fakeTranscriber();
  if (fake) {
    onProgress({ stage: "listening" });
    return fake(samples).then((words) => ({ words, wordLevel: true }));
  }
  return new Promise((resolve, reject) => {
    whisperWorker ??= new Worker(
      new URL("./whisper.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    const worker = whisperWorker;
    const stop = () => {
      // The only way to interrupt the model is to drop the worker.
      worker.terminate();
      whisperWorker = null;
      reject(new Cancelled());
    };
    signal.addEventListener("abort", stop, { once: true });
    onProgress({ stage: "model", progress: 0 });
    worker.onmessage = (event: MessageEvent<WhisperMessage>) => {
      const message = event.data;
      if (message.type === "download") {
        onProgress({ stage: "model", progress: message.progress });
      } else if (message.type === "transcribing") {
        onProgress({ stage: "listening" });
      } else {
        signal.removeEventListener("abort", stop);
        if (message.type === "done")
          resolve({ words: message.words, wordLevel: message.wordLevel });
        else reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      signal.removeEventListener("abort", stop);
      worker.terminate();
      whisperWorker = null;
      reject(
        new Error(
          event.message || "Falha ao carregar o reconhecimento de voz.",
        ),
      );
    };
    worker.postMessage({ samples, model, language }, [samples.buffer]);
  });
}

export async function analyzeTrack(
  track: Track,
  options: AnalyzeOptions,
  onProgress: (progress: AnalyzeProgress) => void,
  signal: AbortSignal,
): Promise<AnalyzeResult> {
  onProgress({ stage: "audio" });
  const decoded = await decodeAudio(await trackAudio(track));
  if (signal.aborted) throw new Cancelled();

  let music: MusicAnalysis | null = null;
  if (options.music) {
    const samples = await resampleMono(decoded, ANALYSIS_RATE);
    music = await runAnalysisWorker(samples, onProgress, signal);
  }

  let lyrics: LyricsResult | null = null;
  if (options.lyrics !== "none") {
    const known = linesForSync(options.knownLyrics);
    const mode =
      options.lyrics === "align" && known.length > 0 ? "align" : "transcribe";
    const speech = await resampleMono(decoded, SPEECH_RATE);
    const { words, wordLevel } = await runWhisper(
      speech,
      { model: options.model, language: options.language },
      onProgress,
      signal,
    );
    if (signal.aborted) throw new Cancelled();
    onProgress({ stage: "aligning" });
    if (mode === "align") {
      const aligned = alignLyrics(known, words);
      lyrics = {
        lines: aligned.lines,
        mode,
        coverage: aligned.coverage,
        wordLevel,
      };
    } else {
      lyrics = { lines: wordsToLines(words), mode, coverage: 1, wordLevel };
    }
  }
  return { music, lyrics };
}
