"use client";

import { useEffect, useState } from "react";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/crypto";
import { assessPassphrase, STRENGTH_LABELS, type StrengthResult } from "@/lib/passphrase/strength";
import { TextField } from "@/components/ui/TextField";

/**
 * Campo de frase secreta nueva con medidor de fortaleza (zxcvbn). El nivel
 * se muestra con barra, texto y número (no solo color).
 */
export function PassphraseField({
  label,
  name,
  value,
  onChange,
  onAssessment,
  userInputs = [],
  error,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onAssessment: (result: StrengthResult | null) => void;
  userInputs?: string[];
  error?: string;
}) {
  const [result, setResult] = useState<StrengthResult | null>(null);

  function handleChange(next: string) {
    onChange(next);
    if (!next) {
      setResult(null);
      onAssessment(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!value) return;
    const timer = window.setTimeout(() => {
      assessPassphrase(value, userInputs).then((r) => {
        if (cancelled) return;
        setResult(r);
        onAssessment(r);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // userInputs se pasa como literal; basta con reevaluar cuando cambia la frase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filled = result ? result.score + 1 : 0;
  const barColor = result?.ok ? "bg-success" : "bg-danger";

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label={label}
        name={name}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        hint={`Al menos ${MIN_PASSPHRASE_LENGTH} caracteres. Lo más fácil y seguro: 4 o 5 palabras al azar que no formen una frase conocida.`}
        error={error}
      />
      <div aria-live="polite" className="flex flex-col gap-1.5">
        {result && (
          <>
            <div className="flex gap-1" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < filled ? barColor : "bg-surface-sunken"}`} />
              ))}
            </div>
            <p className="text-sm">
              Fortaleza: <strong className="font-medium">{STRENGTH_LABELS[result.score]}</strong> ({result.score}/4)
              {result.ok ? " · suficiente" : " · necesitas al menos «Fuerte»"}
              {result.tooShort && ` y ${MIN_PASSPHRASE_LENGTH} caracteres`}
            </p>
            {!result.ok && (result.warning || result.suggestions.length > 0) && (
              <ul className="list-disc pl-5 text-sm text-text-muted">
                {result.warning && <li>{result.warning}</li>}
                {result.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
