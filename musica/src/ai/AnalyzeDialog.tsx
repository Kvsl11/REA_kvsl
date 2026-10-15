import { useEffect, useRef, useState } from "react";
import type { Track } from "../api/types";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { formatTime } from "../format";
import { useLocal } from "../local/LocalContext";
import { toLrc } from "../lyrics/lrc";
import { useLyricsStore, useTrackLyrics } from "../lyrics/LyricsContext";
import { navigate } from "../router/router";
import { useAnalysisStore } from "./AnalysisContext";
import {
  analyzeTrack,
  type AnalyzeOptions,
  type AnalyzeProgress,
  type AnalyzeResult,
  type Stage,
  type WhisperModel,
} from "./analyze";

const MODELS: { id: WhisperModel; label: string; hint: string }[] = [
  {
    id: "Xenova/whisper-base",
    label: "Rápida",
    hint: "download de ~80 MB, bom para sincronizar",
  },
  {
    id: "Xenova/whisper-small",
    label: "Mais precisa",
    hint: "download de ~250 MB, melhor para reconhecer do zero",
  },
];

const LANGUAGES: { id: string | null; label: string }[] = [
  { id: "portuguese", label: "Português" },
  { id: "english", label: "Inglês" },
  { id: "spanish", label: "Espanhol" },
  { id: null, label: "Detectar sozinha" },
];

const STAGES: {
  id: Stage;
  label: string;
  lyrics?: boolean;
  music?: boolean;
}[] = [
  { id: "audio", label: "Lendo o áudio" },
  { id: "tempo", label: "Medindo o andamento (BPM)", music: true },
  { id: "key", label: "Descobrindo o tom", music: true },
  { id: "chords", label: "Reconhecendo os acordes", music: true },
  { id: "model", label: "Preparando a IA de voz", lyrics: true },
  { id: "listening", label: "Ouvindo a voz", lyrics: true },
  { id: "aligning", label: "Sincronizando a letra", lyrics: true },
];

const PREFS_KEY = "sonora.aiPrefs";

function readPrefs(): { model: WhisperModel; language: string | null } {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as {
      model?: WhisperModel;
      language?: string | null;
    };
    return {
      model: MODELS.some((model) => model.id === stored.model)
        ? stored.model!
        : "Xenova/whisper-base",
      language: stored.language === undefined ? "portuguese" : stored.language,
    };
  } catch {
    return { model: "Xenova/whisper-base", language: "portuguese" };
  }
}

export function AnalyzeDialog({
  track,
  onClose,
}: {
  track: Track;
  onClose: () => void;
}) {
  const local = useLocal();
  const lyricsStore = useLyricsStore();
  const analysisStore = useAnalysisStore();
  const toast = useToast();
  // Loads stored lyrics or looks them up online, so they can be aligned.
  const lyrics = useTrackLyrics(track);
  const hasLyrics =
    Boolean(lyrics.plain.trim()) && !lyrics.record?.instrumental;
  // Until we know whether lyrics exist, the right lyrics option isn't known either.
  const lyricsPending =
    lyrics.status === "loading" || lyrics.status === "searching";
  const prefs = readPrefs();

  const [music, setMusic] = useState(true);
  const [lyricsMode, setLyricsMode] =
    useState<AnalyzeOptions["lyrics"]>("transcribe");
  const [model, setModel] = useState<WhisperModel>(prefs.model);
  const [language, setLanguage] = useState<string | null>(prefs.language);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const [done, setDone] = useState<Stage[]>([]);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [save, setSave] = useState({
    bpm: true,
    key: true,
    chords: true,
    lyrics: true,
  });
  const controller = useRef<AbortController | null>(null);
  const userPicked = useRef(false);

  // Once lyrics are known, aligning them is the better default.
  useEffect(() => {
    if (!userPicked.current) setLyricsMode(hasLyrics ? "align" : "transcribe");
  }, [hasLyrics]);

  useEffect(() => () => controller.current?.abort(), []);

  const running = progress !== null && result === null && problem === null;

  const start = async () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ model, language }));
    } catch {
      // Only a preference.
    }
    controller.current = new AbortController();
    setProblem(null);
    setResult(null);
    setDone([]);
    let last: Stage | null = null;
    try {
      const outcome = await analyzeTrack(
        track,
        {
          music,
          lyrics: lyricsMode,
          knownLyrics: lyrics.plain,
          model,
          language,
        },
        (next) => {
          if (last && last !== next.stage) setDone((list) => [...list, last!]);
          last = next.stage;
          setProgress(next);
        },
        controller.current.signal,
      );
      if (last) setDone((list) => [...list, last!]);
      setBpm(outcome.music?.bpm ?? null);
      setResult(outcome);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setProblem(cause instanceof Error ? cause.message : "A análise falhou.");
    }
  };

  const apply = async () => {
    if (!result) return;
    const info = local.info(track.id);
    if (result.music && (save.bpm || save.key)) {
      await local.saveInfo(track.id, {
        key: save.key ? result.music.key : (info?.key ?? ""),
        bpm: save.bpm && bpm ? bpm : (info?.bpm ?? null),
        notes: info?.notes ?? "",
      });
    }
    if (result.music && save.chords) {
      await analysisStore.save({
        trackId: track.id,
        bpm: bpm ?? result.music.bpm,
        key: result.music.key,
        chords: result.music.chords,
        beats: result.music.beats,
        analyzedAt: Date.now(),
      });
    }
    if (result.lyrics && save.lyrics && result.lyrics.lines.length > 0) {
      const plain =
        result.lyrics.mode === "align"
          ? lyrics.plain
          : result.lyrics.lines.map((line) => line.text).join("\n");
      await lyricsStore.save(track.id, {
        synced: toLrc(result.lyrics.lines, {
          title: track.title,
          artist: track.artist,
        }),
        plain,
        source: "ia",
        offsetMs: 0,
      });
    }
    toast("Análise salva");
    onClose();
    if (result.music && save.chords)
      navigate(`/cifra/${encodeURIComponent(track.id)}`);
  };

  const stages = STAGES.filter(
    (stage) =>
      (!stage.music || music) && (!stage.lyrics || lyricsMode !== "none"),
  );
  const coverage =
    result?.lyrics?.mode === "align" ? result.lyrics.coverage : null;

  return (
    <Modal
      title={`Analisar com IA: ${track.title}`}
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
      wide
      footer={
        result ? (
          <>
            <button
              type="button"
              className="button-outline"
              onClick={() => void start()}
            >
              Analisar de novo
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => void apply()}
            >
              Salvar
            </button>
          </>
        ) : running ? (
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              controller.current?.abort();
              setProgress(null);
            }}
          >
            Cancelar
          </button>
        ) : (
          <>
            <button type="button" className="button-outline" onClick={onClose}>
              Fechar
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={
                (!music && lyricsMode === "none") ||
                (lyricsPending && lyricsMode !== "none")
              }
              onClick={() => void start()}
            >
              {lyricsPending && lyricsMode !== "none"
                ? "Procurando a letra…"
                : "Analisar"}
            </button>
          </>
        )
      }
    >
      {!progress && !result && (
        <div className="edit-form">
          <p className="field-hint">
            Tudo roda aqui no seu aparelho: a música não é enviada para nenhum
            servidor.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={music}
              onChange={(e) => setMusic(e.target.checked)}
            />
            Descobrir BPM, tom e acordes (cifra)
          </label>
          <fieldset className="mode-options">
            <legend>Letra</legend>
            {(
              [
                ["none", "Não mexer na letra", ""],
                [
                  "align",
                  "Sincronizar a letra com a voz",
                  hasLyrics
                    ? `Usa a letra que você já tem (${lyrics.plain.split("\n").filter(Boolean).length} linhas) e acha quando cada linha é cantada. É o jeito mais preciso.`
                    : lyrics.status === "loading" ||
                        lyrics.status === "searching"
                      ? "Procurando a letra…"
                      : "Sem letra salva para esta música. Adicione a letra antes, ou reconheça do zero.",
                ],
                [
                  "transcribe",
                  "Reconhecer a letra pela voz",
                  "A IA escreve a letra ouvindo a música. Com instrumentos altos ela pode errar palavras: revise depois.",
                ],
              ] as const
            ).map(([id, label, hint]) => (
              <label
                key={id}
                className={`mode-option ${lyricsMode === id ? "is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="lyrics-mode"
                  checked={lyricsMode === id}
                  disabled={id === "align" && !hasLyrics}
                  onChange={() => {
                    userPicked.current = true;
                    setLyricsMode(id);
                  }}
                />
                <span>
                  <strong>{label}</strong>
                  {hint}
                </span>
              </label>
            ))}
          </fieldset>
          {lyricsMode !== "none" && (
            <div className="edit-row">
              <label>
                Modelo de voz
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as WhisperModel)}
                >
                  {MODELS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} ({item.hint})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Idioma
                <select
                  value={language ?? ""}
                  onChange={(e) => setLanguage(e.target.value || null)}
                >
                  {LANGUAGES.map((item) => (
                    <option key={item.label} value={item.id ?? ""}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {lyricsMode !== "none" && (
            <p className="field-hint">
              Na primeira vez a IA de voz é baixada (uma vez só; fica guardada
              no navegador). Uma música de 4 minutos leva de 1 a 5 minutos,
              conforme o aparelho.
            </p>
          )}
        </div>
      )}

      {progress && !result && (
        <ol className="ai-stages" aria-live="polite">
          {stages.map((stage) => {
            const isDone = done.includes(stage.id);
            const isNow = progress.stage === stage.id && !problem;
            return (
              <li
                key={stage.id}
                className={`${isDone ? "is-done" : ""} ${isNow ? "is-now" : ""}`}
              >
                <span className="ai-stage-mark" aria-hidden="true">
                  {isDone ? (
                    "✓"
                  ) : isNow ? (
                    <span className="spinner spinner-small" />
                  ) : (
                    "•"
                  )}
                </span>
                {stage.label}
                {isNow &&
                  stage.id === "model" &&
                  progress.progress !== undefined && (
                    <span className="ai-stage-progress">
                      <span
                        style={{
                          width: `${Math.round(progress.progress * 100)}%`,
                        }}
                      />
                      <small>{Math.round(progress.progress * 100)}%</small>
                    </span>
                  )}
              </li>
            );
          })}
        </ol>
      )}

      {problem && (
        <div className="form-error" role="alert">
          <p>{problem}</p>
          <button
            type="button"
            className="button-text"
            onClick={() => setProgress(null)}
          >
            Voltar às opções
          </button>
        </div>
      )}

      {result && (
        <div className="ai-result">
          {result.music && (
            <div className="stat-cards">
              <label className="stat-card ai-pick">
                <input
                  type="checkbox"
                  checked={save.bpm}
                  onChange={(e) => setSave({ ...save, bpm: e.target.checked })}
                />
                <span className="stat-value">{bpm}</span>
                <span className="stat-label">
                  BPM{" "}
                  <button
                    type="button"
                    className="button-text"
                    onClick={() =>
                      setBpm((v) => v && Math.round((v / 2) * 10) / 10)
                    }
                  >
                    ÷2
                  </button>{" "}
                  <button
                    type="button"
                    className="button-text"
                    onClick={() =>
                      setBpm((v) => v && Math.round(v * 2 * 10) / 10)
                    }
                  >
                    ×2
                  </button>
                </span>
              </label>
              <label className="stat-card ai-pick">
                <input
                  type="checkbox"
                  checked={save.key}
                  onChange={(e) => setSave({ ...save, key: e.target.checked })}
                />
                <span className="stat-value">{result.music.key}</span>
                <span className="stat-label">
                  tom{result.music.keyConfidence < 0.6 ? " (incerto)" : ""}
                </span>
              </label>
              <label className="stat-card ai-pick">
                <input
                  type="checkbox"
                  checked={save.chords}
                  onChange={(e) =>
                    setSave({ ...save, chords: e.target.checked })
                  }
                />
                <span className="stat-value">
                  {
                    new Set(
                      result.music.chords
                        .filter((c) => c.chord !== "N")
                        .map((c) => c.chord),
                    ).size
                  }
                </span>
                <span className="stat-label">acordes diferentes</span>
              </label>
            </div>
          )}
          {result.music && (
            <p className="ai-chords" aria-label="Acordes encontrados">
              {result.music.chords
                .filter((c) => c.chord !== "N")
                .slice(0, 24)
                .map((c, index) => (
                  <span key={index} className="chip">
                    {c.chord}
                  </span>
                ))}
              {result.music.chords.length > 24 && " …"}
            </p>
          )}
          {result.lyrics && (
            <section className="panel">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={save.lyrics}
                  onChange={(e) =>
                    setSave({ ...save, lyrics: e.target.checked })
                  }
                />
                <strong>
                  {result.lyrics.mode === "align"
                    ? "Letra sincronizada"
                    : "Letra reconhecida"}{" "}
                  ({result.lyrics.lines.length} linhas)
                </strong>
              </label>
              {coverage !== null && coverage < 0.5 && (
                <p className="form-error">
                  A IA reconheceu só {Math.round(coverage * 100)}% das palavras:
                  confira a sincronia (ou use “Sincronizar” para ajustar à mão).
                </p>
              )}
              {result.lyrics.lines.length === 0 ? (
                <p className="empty">Nenhuma voz reconhecida nesta música.</p>
              ) : (
                <ol className="ai-lyrics">
                  {result.lyrics.lines.slice(0, 8).map((line, index) => (
                    <li key={index}>
                      <span className="sync-time">{formatTime(line.time)}</span>{" "}
                      {line.text}
                    </li>
                  ))}
                  {result.lyrics.lines.length > 8 && <li>…</li>}
                </ol>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
