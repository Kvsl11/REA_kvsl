/** Jamendo tags shown as browse categories. */
export const GENRES = [
  { tag: "pop", name: "Pop", color: "#e8115b" },
  { tag: "rock", name: "Rock", color: "#bc5900" },
  { tag: "electronic", name: "Eletrônica", color: "#7358ff" },
  { tag: "hiphop", name: "Hip-Hop", color: "#ba5d07" },
  { tag: "jazz", name: "Jazz", color: "#1e3264" },
  { tag: "classical", name: "Clássica", color: "#8d67ab" },
  { tag: "ambient", name: "Ambiente", color: "#477d95" },
  { tag: "lounge", name: "Lounge", color: "#056952" },
  { tag: "folk", name: "Folk", color: "#608108" },
  { tag: "metal", name: "Metal", color: "#4b4b4b" },
  { tag: "reggae", name: "Reggae", color: "#148a08" },
  { tag: "latin", name: "Latina", color: "#e1118b" },
  { tag: "soundtrack", name: "Trilha sonora", color: "#503750" },
  { tag: "relaxation", name: "Relaxar", color: "#27856a" },
  { tag: "funk", name: "Funk", color: "#af2896" },
  { tag: "blues", name: "Blues", color: "#0d73ec" },
] as const;

export function genreName(tag: string): string {
  return GENRES.find((genre) => genre.tag === tag)?.name ?? tag;
}
