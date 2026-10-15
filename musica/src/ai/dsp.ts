/** Small DSP toolkit: FFT and framed magnitude spectra. */

/** In-place iterative radix-2 FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const angle = step * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const a = start + k;
        const b = a + half;
        const tre = re[b]! * cos - im[b]! * sin;
        const tim = re[b]! * sin + im[b]! * cos;
        re[b] = re[a]! - tre;
        im[b] = im[a]! - tim;
        re[a] = re[a]! + tre;
        im[a] = im[a]! + tim;
      }
    }
  }
}

export function hann(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++)
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  return window;
}

/**
 * Calls `onFrame(magnitudes, frameIndex)` for each hop-spaced window.
 * `magnitudes` has size/2 + 1 bins and is reused between calls.
 */
export function forEachSpectrum(
  samples: Float32Array,
  size: number,
  hop: number,
  onFrame: (magnitudes: Float64Array, frame: number) => void,
): number {
  const window = hann(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const magnitudes = new Float64Array(size / 2 + 1);
  let frame = 0;
  for (let start = 0; start + size <= samples.length; start += hop, frame++) {
    for (let i = 0; i < size; i++) {
      re[i] = samples[start + i]! * window[i]!;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k <= size / 2; k++)
      magnitudes[k] = Math.hypot(re[k]!, im[k]!);
    onFrame(magnitudes, frame);
  }
  return frame;
}
