import { useState, type FormEvent } from "react";
import { saveClientId } from "../api/jamendo";

export function Setup({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() === "") return;
    saveClientId(value);
    onDone();
  };

  return (
    <main className="setup">
      <div className="setup-card">
        <img src="./favicon.svg" alt="" width={56} height={56} />
        <h1>Bem-vindo ao Sonora</h1>
        <p>
          As músicas vêm do <strong>Jamendo</strong>, um catálogo de música
          independente com licença livre. Para acessar, o app precisa de um
          Client ID gratuito do Jamendo.
        </p>
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
        <p className="setup-note">O Client ID fica salvo só neste navegador.</p>
      </div>
    </main>
  );
}
