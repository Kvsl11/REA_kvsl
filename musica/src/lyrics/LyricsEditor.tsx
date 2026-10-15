import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Track } from "../api/types";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { formatTime, plural } from "../format";
import { isLrc, linesForSync, lrcToPlain, parseLrc } from "./lrc";
import {
  cleanTitle,
  LyricsLookupError,
  searchLyrics,
  type LrclibResult,
} from "./lrclib";
import { useLyricsStore, useTrackLyrics } from "./LyricsContext";

type Tab = "search" | "write";

function SearchTab({ track, onDone }: { track: Track; onDone: () => void }) {
  const store = useLyricsStore();
  const toast = useToast();
  const [title, setTitle] = useState(cleanTitle(track.title) || track.title);
  const [artist, setArtist] = useState(track.artist);
  const [results, setResults] = useState<LrclibResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const search = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const found = await searchLyrics({
        title: title.trim(),
        artist: artist.trim(),
      });
      // Synced first, then closest in length to this recording.
      const distance = (item: LrclibResult) =>
        track.duration > 0 && item.duration > 0
          ? Math.abs(item.duration - track.duration)
          : 999;
      setResults(
        found.sort(
          (a, b) =>
            Number(!!b.synced) - Number(!!a.synced) ||
            distance(a) - distance(b),
        ),
      );
    } catch (cause) {
      setProblem(
        cause instanceof LyricsLookupError
          ? cause.message
          : "Não foi possível buscar a letra.",
      );
    } finally {
      setBusy(false);
    }
  };

  const use = async (result: LrclibResult) => {
    await store.save(track.id, {
      synced: result.synced,
      plain: result.plain || lrcToPlain(result.synced),
      instrumental: result.instrumental,
      source: "lrclib",
      lrclibId: result.id,
    });
    toast(result.synced ? "Letra sincronizada salva" : "Letra salva");
    onDone();
  };

  return (
    <div className="edit-form">
      <form className="lyrics-search-form" onSubmit={search}>
        <label>
          Música
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Artista
          <input
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="button-primary"
          disabled={busy || !title.trim()}
        >
          {busy ? "Buscando…" : "Buscar"}
        </button>
      </form>
      {problem && (
        <p className="form-error" role="alert">
          {problem}
        </p>
      )}
      {results && results.length === 0 && (
        <p className="empty">
          Nenhuma letra encontrada. Confira o nome da música e do artista, ou
          cole a letra na aba “Escrever”.
        </p>
      )}
      {results && results.length > 0 && (
        <ul className="lyrics-results">
          {results.slice(0, 20).map((result) => {
            const diff =
              track.duration > 0 && result.duration > 0
                ? Math.round(result.duration - track.duration)
                : null;
            return (
              <li key={result.id}>
                <span className="lyrics-result-text">
                  <strong>{result.title}</strong>
                  <span>
                    {result.artist}
                    {result.album && ` • ${result.album}`} •{" "}
                    {formatTime(result.duration)}
                    {diff !== null &&
                      Math.abs(diff) >= 2 &&
                      ` (${diff > 0 ? "+" : ""}${diff} s)`}
                  </span>
                  <span className="lyrics-result-badges">
                    {result.synced ? (
                      <span className="badge badge-accent">sincronizada</span>
                    ) : result.instrumental ? (
                      <span className="badge">instrumental</span>
                    ) : (
                      <span className="badge">só texto</span>
                    )}
                  </span>
                  {(result.plain || result.synced) && (
                    <span className="lyrics-result-preview">
                      {lrcToPlain(result.plain || result.synced)
                        .split("\n")
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(" / ")}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="button-outline button-small"
                  aria-label={`Usar a letra de ${result.title} (${result.artist})`}
                  onClick={() => void use(result)}
                >
                  Usar
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!results && !problem && (
        <p className="field-hint">
          As letras vêm do LRCLIB, uma base aberta e gratuita, muitas já
          sincronizadas.
        </p>
      )}
    </div>
  );
}

function WriteTab({ track, onDone }: { track: Track; onDone: () => void }) {
  const store = useLyricsStore();
  const lyrics = useTrackLyrics(track, false);
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(
    lyrics.record?.synced || lyrics.record?.plain || "",
  );
  const [fromFile, setFromFile] = useState(false);
  const touched = useRef(false);
  const stored = lyrics.record?.synced || lyrics.record?.plain || "";
  useEffect(() => {
    // Stored lyrics may finish loading after the dialog opened.
    if (!touched.current && stored) setText(stored);
  }, [stored]);
  const synced = isLrc(text);
  const count = synced
    ? parseLrc(text).lines.length
    : linesForSync(text).length;

  const save = async () => {
    await store.save(track.id, {
      synced: synced ? text : "",
      plain: synced ? lrcToPlain(text) : text,
      source: fromFile ? "arquivo" : "manual",
    });
    toast("Letra salva");
    onDone();
  };

  return (
    <div className="edit-form">
      <label>
        Letra
        <textarea
          className="lyrics-textarea"
          rows={12}
          value={text}
          placeholder={
            "Cole a letra aqui.\n\nTambém aceita o formato sincronizado (LRC):\n[00:12.30]Primeira linha\n[00:15.80]Segunda linha"
          }
          onChange={(event) => {
            touched.current = true;
            setText(event.target.value);
            setFromFile(false);
          }}
        />
      </label>
      <p className="field-hint">
        {text.trim()
          ? synced
            ? `Letra sincronizada: ${plural(count, "linha", "linhas")} com tempo.`
            : `Letra sem sincronia: ${plural(count, "linha", "linhas")}. Depois de salvar, use “Sincronizar” para marcar o tempo de cada linha.`
          : "Dica: arquivos .lrc trazem a letra já sincronizada."}
      </p>
      <input
        ref={fileInput}
        type="file"
        accept=".lrc,.txt,text/plain"
        hidden
        data-testid="lyrics-file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          touched.current = true;
          setText(await file.text());
          setFromFile(true);
        }}
      />
      <div className="button-row">
        <button
          type="button"
          className="button-outline"
          onClick={() => fileInput.current?.click()}
        >
          Importar arquivo .lrc / .txt
        </button>
        {lyrics.record && (
          <button
            type="button"
            className="button-text button-danger-text"
            onClick={() => {
              if (window.confirm("Remover a letra desta música?")) {
                void store.remove(track.id).then(() => {
                  toast("Letra removida");
                  onDone();
                });
              }
            }}
          >
            Remover letra
          </button>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="button-primary"
          disabled={!text.trim()}
          onClick={() => void save()}
        >
          Salvar letra
        </button>
      </div>
    </div>
  );
}

export function LyricsEditor({
  track,
  initialTab,
  onClose,
}: {
  track: Track;
  initialTab: Tab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <Modal title={`Letra: ${track.title}`} onClose={onClose} wide>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "search"}
          className={`tab ${tab === "search" ? "is-active" : ""}`}
          onClick={() => setTab("search")}
        >
          Buscar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "write"}
          className={`tab ${tab === "write" ? "is-active" : ""}`}
          onClick={() => setTab("write")}
        >
          Escrever ou colar
        </button>
      </div>
      {tab === "search" ? (
        <SearchTab track={track} onDone={onClose} />
      ) : (
        <WriteTab track={track} onDone={onClose} />
      )}
    </Modal>
  );
}
