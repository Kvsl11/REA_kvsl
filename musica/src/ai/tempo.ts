import { forEachSpectrum } from "./dsp";

export interface TempoResult {
  /** Beats per minute, one decimal. */
  bpm: number;
  /** 0–1: how clearly the beat stands out. */
  confidence: number;
  /** Beat positions in seconds. */
  beats: number[];
}

const FRAME = 1024;
const HOP = 256;

/**
 * Onset strength: how much the (log) spectrum grows from one frame to the
 * next, summed over frequencies. Peaks where notes and drums hit.
 */
export function onsetEnvelope(samples: Float32Array): Float64Array {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const envelope = new Float64Array(frames);
  let previous: Float64Array | null = null;
  forEachSpectrum(samples, FRAME, HOP, (magnitudes, frame) => {
    const current = new Float64Array(magnitudes.length);
    let flux = 0;
    for (let k = 0; k < magnitudes.length; k++) {
      current[k] = Math.log1p(100 * magnitudes[k]!);
      if (previous) flux += Math.max(0, current[k]! - previous[k]!);
    }
    envelope[frame] = flux;
    previous = current;
  });
  // Remove the slowly varying part (loudness), keep the hits.
  const radius = 16;
  const out = new Float64Array(frames);
  let sum = 0;
  for (let i = 0; i < Math.min(frames, radius); i++) sum += envelope[i]!;
  for (let i = 0; i < frames; i++) {
    if (i + radius < frames) sum += envelope[i + radius]!;
    if (i - radius - 1 >= 0) sum -= envelope[i - radius - 1]!;
    const count =
      Math.min(frames - 1, i + radius) - Math.max(0, i - radius) + 1;
    out[i] = Math.max(0, envelope[i]! - sum / count);
  }
  const max = out.reduce((m, v) => Math.max(m, v), 0) || 1;
  for (let i = 0; i < frames; i++) out[i] = out[i]! / max;
  return out;
}

/**
 * Tempo by autocorrelation of the onset envelope, favouring tempos near
 * 120 BPM (where most music sits) to settle half/double ambiguity, then
 * beat positions by dynamic programming (Ellis 2007).
 */
export function detectTempo(
  samples: Float32Array,
  sampleRate: number,
): TempoResult {
  const envelope = onsetEnvelope(samples);
  const frameRate = sampleRate / HOP;
  const minLag = Math.floor((60 / 200) * frameRate);
  const maxLag = Math.ceil((60 / 60) * frameRate);
  if (envelope.length < maxLag * 2) return { bpm: 0, confidence: 0, beats: [] };

  const raw = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let i = lag; i < envelope.length; i++)
      sum += envelope[i]! * envelope[i - lag]!;
    raw[lag] = sum / (envelope.length - lag);
  }
  // A tempo whose double-time lag also correlates is more likely the real beat.
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    const double = 2 * lag <= maxLag + 1 ? raw[2 * lag]! : 0;
    ac[lag] = raw[lag]! + 0.5 * double;
  }

  let bestLag = minLag;
  let bestScore = -Infinity;
  let total = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * frameRate) / lag;
    const weight = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const score = ac[lag]! * weight;
    total += ac[lag]!;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  // Parabolic interpolation around the peak for sub-frame precision.
  const a = ac[bestLag - 1]!;
  const b = ac[bestLag]!;
  const c = ac[bestLag + 1]!;
  const denominator = a - 2 * b + c;
  const shift = denominator !== 0 ? (0.5 * (a - c)) / denominator : 0;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  const bpm = Math.round(((60 * frameRate) / lag) * 10) / 10;
  const mean = total / (maxLag - minLag + 1);
  const confidence = Math.max(0, Math.min(1, (b - mean) / (b || 1)));

  return { bpm, confidence, beats: trackBeats(envelope, lag, frameRate) };
}

function trackBeats(
  envelope: Float64Array,
  period: number,
  frameRate: number,
): number[] {
  const n = envelope.length;
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const tightness = 100;
  for (let t = 0; t < n; t++) {
    let best = 0;
    let bestPrev = -1;
    const from = Math.max(0, Math.round(t - 2 * period));
    const to = Math.round(t - period / 2);
    for (let p = from; p <= to; p++) {
      const penalty = -tightness * Math.log((t - p) / period) ** 2;
      const candidate = score[p]! + penalty;
      if (candidate > best || bestPrev === -1) {
        best = candidate;
        bestPrev = p;
      }
    }
    score[t] = envelope[t]! + (bestPrev >= 0 ? Math.max(0, best) : 0);
    back[t] = bestPrev;
  }
  // Start from the best-scoring frame in the last beat period.
  let t = n - 1;
  for (let i = Math.max(0, Math.floor(n - period)); i < n; i++)
    if (score[i]! > score[t]!) t = i;
  const beats: number[] = [];
  while (t >= 0) {
    beats.push((t * HOP + FRAME / 2) / (frameRate * HOP));
    t = back[t]!;
  }
  return beats.reverse();
}
