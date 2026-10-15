import { useState, type FormEvent } from "react";
import { saveClientId } from "../api/jamendo";

const SETUP_DONE_KEY = "sonora.setupDone";

/** True once the user connected Jamendo or chose to skip it. */
export function setupDone(): boolean {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSetupDone() {
  try {
    localStorage.setItem(SETUP_DONE_KEY, "1");
  } catch {
    // Without storage the welcome screen just shows again next time.
  }
}

export function Setup({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() === "") return;
    saveClientId(value);
    markSetupDone();
    onDone();
  };

  return (
    <main className="setup">
      <div className="setup-card">
        <img src="./favicon.svg" alt="" width={56} height={56} />
        <h1>Bem-vindo ao Sonora</h1>
        <p>
          Ouça suas próprias músicas, monte setlists e grave seus shows.
          Opcionalmente, conecte o <strong>Jamendo</strong>, um catálogo de mais
          de 600 mil músicas independentes com licença livre.
        </p>
        <h2 className="setup-step">Conectar o Jamendo (opcional, gratuito)</h2>
        <ol>
          <li>
            Crie uma conta em{" "}
            <a
              href="https://devportal.jamendo.com"
              target="_blank"
              rel="noreferrer"
            >
              devportal.jamendo.com
            </a>
            .
          </li>
          <li>Crie um app (“Create a new app”) — qualquer nome serve.</li>
          <li>
            Copie o <em>Client ID</em> e cole abaixo.
          </li>
        </ol>
        <form onSubmit={submit}>
          <label htmlFor="client-id">Client ID do Jamendo</label>
          <input
            id="client-id"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="ex.: 1a2b3c4d"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="button-primary"
            disabled={value.trim() === ""}
          >
            Começar a ouvir
          </button>
        </form>
        <button
          type="button"
          className="button-outline"
          onClick={() => {
            markSetupDone();
            onDone();
          }}
        >
          Pular — usar só minhas músicas
        </button>
        <p className="setup-note">
          Tudo fica salvo só neste navegador. Dá para conectar o Jamendo depois,
          em Configurações.
        </p>
      </div>
    </main>
  );
}
