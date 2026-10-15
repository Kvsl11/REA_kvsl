export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  cover: string;
  audioUrl: string;
  /** Seconds. */
  duration: number;
  licenseUrl: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  cover: string;
  releaseDate: string;
}

export interface Artist {
  id: string;
  name: string;
  image: string;
}
