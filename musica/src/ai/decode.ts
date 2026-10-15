import type { Track } from "../api/types";
import * as db from "../db/db";

/** The raw bytes of a track: the imported file, or a download of the stream. */
export async function trackAudio(track: Track): Promise<ArrayBuffer> {
  if (track.source === "local") {
    const blob = await db.get<Blob>("audio", track.id);
    if (!blob)
      throw new Error(
        "Arquivo de áudio não encontrado. Importe a música de novo.",
      );
    return blob.arrayBuffer();
  }
  let response: Response;
  try {
    response = await fetch(track.audioUrl);
  } catch {
    throw new Error(
      "Não foi possível baixar o áudio desta música para analisar. Importe o arquivo em “Suas músicas”.",
    );
  }
  if (!response.ok)
    throw new Error(`O áudio respondeu com erro ${response.status}.`);
  return response.arrayBuffer();
}

export async function decodeAudio(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const Context =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Context)
    throw new Error("Este navegador não consegue decodificar áudio.");
  const context = new Context();
  try {
    return await context.decodeAudioData(bytes);
  } catch {
    throw new Error("Formato de áudio não suportado por este navegador.");
  } finally {
    void context.close();
  }
}

/** Mono samples at `rate` Hz (the analysis and the speech model want fixed rates). */
export async function resampleMono(
  buffer: AudioBuffer,
  rate: number,
): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil(buffer.duration * rate));
  const offline = new OfflineAudioContext(1, length, rate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}
