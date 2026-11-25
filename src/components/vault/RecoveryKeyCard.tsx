"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Muestra la clave de recuperación (24 palabras) para copiarla o descargarla.
 * No se guarda en ningún sitio del navegador: si se cierra la página antes de
 * terminar, no se ha guardado nada y hay que empezar de nuevo.
 */
export function RecoveryKeyCard({ phrase }: { phrase: string }) {
  const words = phrase.split(" ");
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }

  function download() {
    const date = new Date().toLocaleDateString("es-ES");
    const text = [
      "DIARIO CIFRADO · CLAVE DE RECUPERACIÓN",
      `Generada el ${date}`,
      "",
      words.map((w, i) => `${String(i + 1).padStart(2, " ")}. ${w}`).join("\n"),
      "",
      "Guarda este archivo en un lugar seguro y fuera de este equipo (o imprímelo y bórralo).",
      "Con estas 24 palabras se puede abrir tu diario sin la frase secreta.",
      "Si pierdes la frase y esta clave, tus entradas serán irrecuperables.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "clave-recuperacion-diario.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <ol
        className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border-strong bg-surface-sunken p-4 font-mono text-sm sm:grid-cols-3"
        aria-label="Clave de recuperación: 24 palabras"
        data-testid="recovery-words"
      >
        {words.map((word, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-6 text-right text-text-muted" aria-hidden="true">
              {i + 1}.
            </span>
            <span>{word}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={copy}>
          Copiar
        </Button>
        <Button variant="secondary" onClick={download}>
          Descargar .txt
        </Button>
      </div>
      <p className="text-sm text-text-muted" aria-live="polite">
        {copied === "ok" &&
          "Copiada. Pégala en un lugar seguro y después copia otra cosa para que no quede en el portapapeles."}
        {copied === "error" && "No se ha podido copiar. Anótala a mano o descárgala."}
      </p>
    </div>
  );
}
