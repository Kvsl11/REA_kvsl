/// <reference lib="webworker" />
/**
 * Speech recognition in the browser with Whisper (transformers.js). The
 * model is downloaded from Hugging Face on first use and cached by the
 * browser; audio never leaves the device.
 */
import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

export type WhisperModel = "Xenova/whisper-base" | "Xenova/whisper-small";

export interface WhisperRequest {
  samples: Float32Array; // 16 kHz mono
  model: WhisperModel;
  /** "portuguese", "english", … or null to auto-detect. */
  language: string | null;
}

export interface RecognizedWord {
  text: string;
  start: number;
  end: number;
}

export type WhisperMessage =
  | { type: "download"; progress: number; file: string }
  | { type: "transcribing" }
  | { type: "done"; words: RecognizedWord[]; wordLevel: boolean }
  | { type: "error"; message: string };

const post = (message: WhisperMessage) => self.postMessage(message);

let loaded: { model: string; asr: AutomaticSpeechRecognitionPipeline } | null =
  null;

async function load(
  model: WhisperModel,
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (loaded?.model === model) return loaded.asr;
  const files = new Map<string, { loaded: number; total: number }>();
  const device = "gpu" in navigator ? "webgpu" : "wasm";
  const asr = (await pipeline("automatic-speech-recognition", model, {
    device,
    progress_callback: (info: {
      status: string;
      file?: string;
      loaded?: number;
      total?: number;
    }) => {
      if (info.status !== "progress" || !info.file) return;
      files.set(info.file, {
        loaded: info.loaded ?? 0,
        total: info.total ?? 0,
      });
      let done = 0;
      let total = 0;
      for (const item of files.values()) {
        done += item.loaded;
        total += item.total;
      }
      post({
        type: "download",
        progress: total ? done / total : 0,
        file: info.file,
      });
    },
  })) as AutomaticSpeechRecognitionPipeline;
  loaded = { model, asr };
  return asr;
}

interface Chunk {
  text: string;
  timestamp: [number, number | null];
}

function toWords(chunks: Chunk[], duration: number): RecognizedWord[] {
  return chunks
    .map((chunk) => ({
      text: chunk.text.trim(),
      start: chunk.timestamp[0] ?? 0,
      end: chunk.timestamp[1] ?? duration,
    }))
    .filter((word) => word.text !== "");
}

/** Phrase timestamps spread over their words by length, when word timing isn't available. */
function splitPhrases(chunks: Chunk[], duration: number): RecognizedWord[] {
  const words: RecognizedWord[] = [];
  for (const phrase of toWords(chunks, duration)) {
    const parts = phrase.text.split(/\s+/).filter(Boolean);
    const letters = parts.reduce((sum, part) => sum + part.length, 0) || 1;
    let cursor = phrase.start;
    for (const part of parts) {
      const length = ((phrase.end - phrase.start) * part.length) / letters;
      words.push({ text: part, start: cursor, end: cursor + length });
      cursor += length;
    }
  }
  return words;
}

self.onmessage = async (event: MessageEvent<WhisperRequest>) => {
  const { samples, model, language } = event.data;
  try {
    const asr = await load(model);
    post({ type: "transcribing" });
    const duration = samples.length / 16000;
    const options = {
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(language ? { language } : {}),
    };
    try {
      const output = (await asr(samples, {
        ...options,
        return_timestamps: "word",
      })) as {
        chunks?: Chunk[];
      };
      post({
        type: "done",
        words: toWords(output.chunks ?? [], duration),
        wordLevel: true,
      });
    } catch {
      // Some model builds can't do word timing: fall back to phrases.
      const output = (await asr(samples, {
        ...options,
        return_timestamps: true,
      })) as {
        chunks?: Chunk[];
      };
      post({
        type: "done",
        words: splitPhrases(output.chunks ?? [], duration),
        wordLevel: false,
      });
    }
  } catch (cause) {
    post({
      type: "error",
      message:
        cause instanceof Error
          ? `Falha no reconhecimento de voz: ${cause.message}`
          : "Falha no reconhecimento de voz.",
    });
  }
};
