import { useEffect, useRef, useState, type DragEvent } from "react";
import { CollectionHeader, PlayAllBar } from "../components/CollectionHeader";
import { UploadIcon } from "../components/Icons";
import { Empty, Loading } from "../components/Status";
import { TrackList } from "../components/TrackList";
import { useToast } from "../components/Toast";
import { storageEstimate } from "../db/db";
import { formatBytes, formatTotal, plural } from "../format";
import { useLocal, type ImportResult } from "../local/LocalContext";

export function useImporter() {
  const local = useLocal();
  const toast = useToast();
  const [result, setResult] = useState<ImportResult | null>(null);
  const run = async (files: File[]) => {
    if (files.length === 0) return;
    const outcome = await local.importFiles(files);
    setResult(outcome);
    if (outcome.imported.length > 0) {
      toast(
        plural(
          outcome.imported.length,
          "música importada",
          "músicas importadas",
        ),
      );
    } else if (outcome.skipped.length > 0) {
      toast("Nenhuma música importada");
    }
  };
  return { run, result, clear: () => setResult(null) };
}

export function ImportReport({
  result,
  onClose,
}: {
  result: ImportResult | null;
  onClose: () => void;
}) {
  if (!result || result.skipped.length === 0) return null;
  return (
    <div className="import-report" role="status">
      <strong>
        {plural(
          result.skipped.length,
          "arquivo não importado",
          "arquivos não importados",
        )}
        :
      </strong>
      <ul>
        {result.skipped.slice(0, 8).map((item) => (
          <li key={item.name}>
            {item.name} — {item.reason}
          </li>
        ))}
        {result.skipped.length > 8 && (
          <li>e mais {result.skipped.length - 8}…</li>
        )}
      </ul>
      <button type="button" className="button-text" onClick={onClose}>
        Fechar
      </button>
    </div>
  );
}

export function ImportButton({
  onFiles,
  className = "button-primary",
}: {
  onFiles: (files: File[]) => void;
  className?: string;
}) {
  const local = useLocal();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac,.webm"
        multiple
        hidden
        data-testid="import-input"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          onFiles(files);
        }}
      />
      <button
        type="button"
        className={className}
        disabled={local.importing !== null}
        onClick={() => input.current?.click()}
      >
        <UploadIcon size={18} />
        {local.importing
          ? `Importando ${local.importing.done}/${local.importing.total}…`
          : "Importar músicas"}
      </button>
    </>
  );
}

/** Accepts files dropped anywhere on the page while this view is open. */
export function DropListener({
  onFiles,
}: {
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: globalThis.DragEvent) =>
      [...(event.dataTransfer?.types ?? [])].includes("Files");
    const enter = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return;
      depth++;
      setOver(true);
    };
    const leave = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const over = (event: globalThis.DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const drop = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      onFilesRef.current([...(event.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  if (!over) return null;
  return (
    <div
      className="drop-overlay"
      onDragOver={(event: DragEvent) => event.preventDefault()}
    >
      <UploadIcon size={48} />
      Solte os arquivos de áudio para importar
    </div>
  );
}

export function LocalMusicPage() {
  const local = useLocal();
  const [filter, setFilter] = useState("");
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(
    null,
  );
  const toast = useToast();
  const importer = useImporter();

  useEffect(() => {
    void storageEstimate().then(setUsage);
  }, [local.records.length]);

  if (!local.loaded) return <Loading />;

  const query = filter.trim().toLowerCase();
  const tracks = query
    ? local.tracks.filter((track) =>
        `${track.title} ${track.artist} ${track.album}`
          .toLowerCase()
          .includes(query),
      )
    : local.tracks;
  const total = local.tracks.reduce((sum, track) => sum + track.duration, 0);
  const bytes = local.records.reduce((sum, record) => sum + record.size, 0);

  return (
    <div className="page">
      <CollectionHeader
        kind="Arquivos do seu aparelho"
        title="Suas músicas"
        coverNode={
          <div className="collection-cover local-cover-large">
            <UploadIcon size={64} />
          </div>
        }
        meta={
          <>
            {plural(local.tracks.length, "música", "músicas")}
            {total > 0 && `, ${formatTotal(total)}`}
            {bytes > 0 && ` • ${formatBytes(bytes)}`}
            {usage && usage.quota > 0 && (
              <>
                {" "}
                • espaço usado no navegador:{" "}
                {Math.round((usage.usage / usage.quota) * 100)}%
              </>
            )}
          </>
        }
      />
      {local.error && (
        <p className="form-error" role="alert">
          {local.error}
        </p>
      )}
      <DropListener onFiles={(files) => void importer.run(files)} />
      <PlayAllBar tracks={tracks}>
        {local.tracks.length > 0 && (
          <ImportButton
            className="button-outline"
            onFiles={(files) => void importer.run(files)}
          />
        )}
      </PlayAllBar>
      <ImportReport result={importer.result} onClose={importer.clear} />
      {local.tracks.length === 0 ? (
        <div className="empty-hero">
          <UploadIcon size={40} />
          <h2>Traga suas próprias músicas</h2>
          <p>
            Importe MP3, M4A, FLAC, WAV, OGG… O título, o artista, o álbum e a
            capa são lidos do arquivo. Se faltar algo, você pode editar depois.
            Os arquivos ficam guardados neste navegador e funcionam sem
            internet.
          </p>
          <ImportButton onFiles={(files) => void importer.run(files)} />
          <p className="field-hint">
            Dica: você também pode arrastar os arquivos para esta página.
          </p>
        </div>
      ) : (
        <>
          <input
            type="search"
            className="filter-input"
            placeholder="Filtrar suas músicas"
            aria-label="Filtrar suas músicas"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          {tracks.length === 0 ? (
            <Empty>Nenhuma música com “{filter}”.</Empty>
          ) : (
            <TrackList
              tracks={tracks}
              showStageInfo
              removeLabel="Excluir do aparelho"
              onRemove={(track) => {
                if (
                  window.confirm(
                    `Excluir “${track.title}” deste navegador? Ela também sai das playlists e setlists.`,
                  )
                ) {
                  void local
                    .deleteLocal(track.id)
                    .then(() => toast("Música excluída"));
                }
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
