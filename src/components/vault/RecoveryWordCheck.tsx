"use client";

import { useMemo, useState, type FormEvent } from "react";
import { normalizeRecoveryPhrase } from "@/lib/crypto";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

/** Elige `count` posiciones distintas al azar (CSPRNG) y ordenadas. */
function randomPositions(total: number, count: number): number[] {
  const chosen = new Set<number>();
  const buffer = new Uint32Array(1);
  while (chosen.size < count) {
    crypto.getRandomValues(buffer);
    chosen.add(buffer[0]! % total);
  }
  return [...chosen].sort((a, b) => a - b);
}

/** Pide 3 palabras al azar de la clave para comprobar que se ha guardado de verdad. */
export function RecoveryWordCheck({
  phrase,
  onConfirmed,
  onBack,
  pending = false,
  submitLabel = "Confirmar",
}: {
  phrase: string;
  onConfirmed: () => void;
  onBack: () => void;
  pending?: boolean;
  submitLabel?: string;
}) {
  const words = phrase.split(" ");
  const positions = useMemo(() => randomPositions(words.length, 3), [words.length]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [error, setError] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const ok = positions.every((p) => normalizeRecoveryPhrase(values[p] ?? "") === words[p]);
    setError(!ok);
    if (ok) onConfirmed();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <p className="text-text-muted">Escribe estas palabras de tu clave, copiándolas de donde la hayas guardado.</p>
      {error && <Alert tone="error">Alguna palabra no coincide. Revisa tu copia de la clave.</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        {positions.map((p) => (
          <TextField
            key={p}
            label={`Palabra nº ${p + 1}`}
            name={`word-${p}`}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={values[p] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending} pendingLabel="Guardando…">
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Volver a ver la clave
        </Button>
      </div>
    </form>
  );
}
