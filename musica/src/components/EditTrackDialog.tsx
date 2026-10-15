import { useRef, useState, type FormEvent } from "react";
import type { Track } from "../api/types";
import { formatTime } from "../format";
import { imageToDataUrl } from "../local/importer";
import { useLocal } from "../local/LocalContext";
import { Cover } from "./Cover";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

/** Musical keys offered as suggestions; any text is accepted. */
const KEYS = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
  "Cm",
  "C#m",
  "Dm",
  "D#m",
  "Ebm",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "A#m",
  "Bbm",
  "Bm",
];

/** Parses "3:45", "3.45" or "225" (seconds) into seconds. */
export function parseDuration(text: string): number | null {
  const value = text.trim();
  if (value === "") return null;
  const match = /^(\d+)[:.](\d{1,2})$/.exec(value);
  if (match) {
    const seconds = Number(match[2]);
    return seconds < 60 ? Number(match[1]) * 60 + seconds : null;
  }
  return /^\d+$/.test(value) ? Number(value) : null;
}

export function EditTrackDialog({
  track,
  onClose,
}: {
  track: Track;
  onClose: () => void;
}) {
  const local = useLocal();
  const toast = useToast();
  const record =
    track.source === "local" ? local.getRecord(track.id) : undefined;
  const info = local.info(track.id);
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(record?.title ?? track.title);
  const [artist, setArtist] = useState(record?.artist ?? track.artist);
  const [album, setAlbum] = useState(record?.album ?? track.album);
  const [year, setYear] = useState(record?.year ?? "");
  const [genre, setGenre] = useState(record?.genre ?? "");
  const [duration, setDuration] = useState(
    record && record.duration > 0 ? formatTime(record.duration) : "",
  );
  const [cover, setCover] = useState(record?.cover ?? track.cover);
  const [key, setKey] = useState(info?.key ?? "");
  const [bpm, setBpm] = useState(info?.bpm ? String(info.bpm) : "");
  const [notes, setNotes] = useState(info?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const editable = record !== undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    const parsedDuration = parseDuration(duration);
    if (editable && duration.trim() !== "" && parsedDuration === null) {
      setProblem("Duração inválida. Use minutos:segundos, por exemplo 3:45.");
      return;
    }
    const parsedBpm = bpm.trim() === "" ? null : Number(bpm.replace(",", "."));
    if (
      parsedBpm !== null &&
      (!Number.isFinite(parsedBpm) || parsedBpm <= 0 || parsedBpm > 400)
    ) {
      setProblem("BPM deve ser um número entre 1 e 400.");
      return;
    }
    if (editable && title.trim() === "") {
      setProblem("A música precisa de um título.");
      return;
    }
    setSaving(true);
    try {
      if (record) {
        await local.updateLocal(record.id, {
          title: title.trim(),
          artist: artist.trim(),
          album: album.trim(),
          year: year.trim(),
          genre: genre.trim(),
          cover,
          ...(parsedDuration !== null ? { duration: parsedDuration } : {}),
        });
      }
      await local.saveInfo(track.id, { key, bpm: parsedBpm, notes });
      toast("Informações salvas");
      onClose();
    } catch (cause) {
      setProblem(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editable ? "Editar música" : "Informações de show"}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="button-outline" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            form="edit-track"
            className="button-primary"
            disabled={saving}
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <form id="edit-track" className="edit-form" onSubmit={submit}>
        {editable ? (
          <div className="edit-grid">
            <div className="edit-cover">
              <Cover src={cover} alt="Capa" />
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const url = await imageToDataUrl(file);
                  if (url) setCover(url);
                  else setProblem("Não foi possível ler essa imagem.");
                }}
              />
              <button
                type="button"
                className="button-outline"
                onClick={() => fileInput.current?.click()}
              >
                Trocar capa
              </button>
              {cover && (
                <button
                  type="button"
                  className="button-text"
                  onClick={() => setCover("")}
                >
                  Remover capa
                </button>
              )}
            </div>
            <div className="edit-fields">
              <label>
                Título
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </label>
              <label>
                Artista
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                />
              </label>
              <label>
                Álbum
                <input
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                />
              </label>
              <div className="edit-row">
                <label>
                  Ano
                  <input
                    value={year}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
                <label>
                  Gênero
                  <input
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  />
                </label>
                <label>
                  Duração
                  <input
                    value={duration}
                    placeholder="3:45"
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </label>
              </div>
              <p className="field-hint">Arquivo: {record.fileName}</p>
            </div>
          </div>
        ) : (
          <div className="edit-readonly">
            <Cover src={track.cover} alt="" />
            <div>
              <strong>{track.title}</strong>
              <span>{track.artist}</span>
              <p className="field-hint">
                Dados do Jamendo não podem ser alterados; as informações de show
                abaixo ficam só com você.
              </p>
            </div>
          </div>
        )}

        <fieldset className="edit-show">
          <legend>Para o show</legend>
          <div className="edit-row">
            <label>
              Tom
              <input
                value={key}
                list="musical-keys"
                placeholder="ex.: Am"
                onChange={(e) => setKey(e.target.value)}
              />
              <datalist id="musical-keys">
                {KEYS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </label>
            <label>
              BPM
              <input
                value={bpm}
                inputMode="decimal"
                placeholder="ex.: 120"
                onChange={(e) => setBpm(e.target.value)}
              />
            </label>
          </div>
          <label>
            Notas (aparecem em letra grande no modo show)
            <textarea
              value={notes}
              rows={3}
              placeholder="ex.: entrada só voz e violão; capo na 2ª casa; repetir refrão 2x"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </fieldset>
        {problem && (
          <p className="form-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Modal>
  );
}
