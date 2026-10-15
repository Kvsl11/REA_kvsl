import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  clearClientId,
  clientIdFromEnv,
  getClientId,
  saveClientId,
} from "../api/jamendo";
import { createBackup, parseBackup, restoreBackup } from "../backup";
import { useToast } from "../components/Toast";
import { requestPersistence, storageEstimate } from "../db/db";
import { formatBytes, formatDateTime } from "../format";
import { useLibrary } from "../library/LibraryContext";
import { useLocal } from "../local/LocalContext";

function JamendoSettings() {
  const toast = useToast();
  const [current, setCurrent] = useState(getClientId());
  const [value, setValue] = useState("");
  const fromEnv = clientIdFromEnv();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    saveClientId(value);
    setCurrent(getClientId());
    setValue("");
    toast("Client ID salvo");
  };

  return (
    <section className="panel">
      <h2>Catálogo do Jamendo</h2>
      <p className="field-hint">
        Com um Client ID gratuito do{" "}
        <a
          href="https://devportal.jamendo.com"
          target="_blank"
          rel="noreferrer"
        >
          Jamendo
        </a>
        , o app mostra mais de 600 mil músicas livres além das suas.
      </p>
      {current ? (
        <p>
          Conectado com o Client ID <code>{current.slice(0, 4)}…</code>
          {fromEnv && " (definido no arquivo .env)"}
        </p>
      ) : (
        <p>Desligado: o app usa só as suas músicas.</p>
      )}
      {!fromEnv && (
        <form className="inline-form" onSubmit={submit}>
          <input
            aria-label="Novo Client ID do Jamendo"
            placeholder={current ? "Trocar Client ID" : "Colar Client ID"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="button-outline"
            disabled={!value.trim()}
          >
            Salvar
          </button>
          {current && (
            <button
              type="button"
              className="button-text"
              onClick={() => {
                clearClientId();
                setCurrent("");
                toast("Jamendo desligado");
              }}
            >
              Desligar
            </button>
          )}
        </form>
      )}
    </section>
  );
}

function BackupSettings() {
  const library = useLibrary();
  const local = useLocal();
  const toast = useToast();
  const [includeAudio, setIncludeAudio] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const audioBytes = local.records.reduce(
    (sum, record) => sum + record.size,
    0,
  );

  const exportBackup = async () => {
    setProblem(null);
    setBusy("Preparando backup…");
    try {
      const backup = await createBackup(
        { liked: library.liked, playlists: library.playlists },
        includeAudio,
      );
      const blob = new Blob([JSON.stringify(backup)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const day = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `sonora-backup-${day}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Backup exportado");
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "Falha ao exportar.");
    } finally {
      setBusy(null);
    }
  };

  const importBackup = async (file: File) => {
    setProblem(null);
    setBusy("Restaurando backup…");
    try {
      const backup = parseBackup(await file.text());
      const ok = window.confirm(
        `Restaurar o backup de ${formatDateTime(backup.exportedAt)}? ` +
          "Playlists e curtidas atuais serão substituídas; histórico e shows serão somados.",
      );
      if (!ok) return;
      await restoreBackup(backup);
      library.replaceAll(backup.library);
      toast("Backup restaurado. Recarregando…");
      setTimeout(() => window.location.reload(), 800);
    } catch (cause) {
      setProblem(
        cause instanceof Error ? cause.message : "Falha ao restaurar.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel">
      <h2>Backup</h2>
      <p className="field-hint">
        Tudo fica guardado só neste navegador. Exporte um backup para não perder
        seus setlists, shows e histórico, ou para levar para outro aparelho.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={includeAudio}
          onChange={(event) => setIncludeAudio(event.target.checked)}
        />
        Incluir os arquivos de áudio importados
        {audioBytes > 0 && ` (~${formatBytes(audioBytes * 1.37)})`}
      </label>
      <div className="button-row">
        <button
          type="button"
          className="button-primary"
          disabled={busy !== null}
          onClick={() => void exportBackup()}
        >
          Exportar backup
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importBackup(file);
          }}
        />
        <button
          type="button"
          className="button-outline"
          disabled={busy !== null}
          onClick={() => input.current?.click()}
        >
          Restaurar backup
        </button>
      </div>
      {busy && <p className="field-hint">{busy}</p>}
      {problem && (
        <p className="form-error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

function StorageSettings() {
  const [estimate, setEstimate] = useState<{
    usage: number;
    quota: number;
  } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void storageEstimate().then(setEstimate);
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted, () => setPersisted(null));
  }, []);
  return (
    <section className="panel">
      <h2>Armazenamento</h2>
      {estimate ? (
        <p>
          Usando {formatBytes(estimate.usage)} de {formatBytes(estimate.quota)}{" "}
          disponíveis neste navegador.
        </p>
      ) : (
        <p>Não foi possível medir o espaço usado.</p>
      )}
      {persisted === false && (
        <>
          <p className="field-hint">
            O navegador pode apagar os dados se faltar espaço no aparelho. Peça
            para mantê-los:
          </p>
          <button
            type="button"
            className="button-outline"
            onClick={() => void requestPersistence().then(setPersisted)}
          >
            Proteger meus dados
          </button>
        </>
      )}
      {persisted && (
        <p className="field-hint">
          Os dados estão protegidos contra limpeza automática.
        </p>
      )}
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className="page">
      <h1 className="page-title">Configurações</h1>
      <div className="settings-stack">
        <JamendoSettings />
        <BackupSettings />
        <StorageSettings />
      </div>
    </div>
  );
}
