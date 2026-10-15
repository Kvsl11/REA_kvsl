/// <reference lib="webworker" />
import {
  chromagram,
  detectChords,
  detectKey,
  type ChordSegment,
} from "./harmony";
import { detectTempo } from "./tempo";

export interface AnalysisRequest {
  samples: Float32Array;
  sampleRate: number;
}

export interface MusicAnalysis {
  bpm: number;
  bpmConfidence: number;
  beats: number[];
  key: string;
  keyConfidence: number;
  chords: ChordSegment[];
}

export type AnalysisMessage =
  | { type: "progress"; stage: "tempo" | "key" | "chords" }
  | { type: "done"; result: MusicAnalysis }
  | { type: "error"; message: string };

const post = (message: AnalysisMessage) => self.postMessage(message);

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  try {
    const { samples, sampleRate } = event.data;
    post({ type: "progress", stage: "tempo" });
    const tempo = detectTempo(samples, sampleRate);
    post({ type: "progress", stage: "key" });
    const chroma = chromagram(samples, sampleRate);
    const key = detectKey(chroma);
    post({ type: "progress", stage: "chords" });
    const chords = detectChords(chroma, key, tempo.beats);
    post({
      type: "done",
      result: {
        bpm: tempo.bpm,
        bpmConfidence: tempo.confidence,
        beats: tempo.beats,
        key: key.key,
        keyConfidence: key.confidence,
        chords,
      },
    });
  } catch (cause) {
    post({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
