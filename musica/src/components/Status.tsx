import type { ReactNode } from "react";
import { JamendoError } from "../api/jamendo";

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="status" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorMessage({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const message =
    error instanceof JamendoError
      ? error.message
      : "Algo deu errado ao carregar.";
  return (
    <div className="status status-error" role="alert">
      <p>{message}</p>
      <button type="button" className="button-outline" onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
