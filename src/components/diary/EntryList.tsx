"use client";

import Link from "next/link";
import { excerpt, isDecrypted, MOOD_LABELS, type DecryptResult } from "@/lib/entries/client";
import type { EncryptedEntryRow } from "@/lib/entries/types";
import { AlertIcon } from "@/components/ui/icons";
import { DecryptReveal } from "./DecryptReveal";
import { formatEntryDate } from "./LockedEntryList";

/** Lista de entradas descifradas (solo con el diario desbloqueado). */
export function EntryList({ results, rows }: { results: DecryptResult[]; rows: EncryptedEntryRow[] }) {
  const seeds = new Map(rows.map((r) => [r.id, r.ciphertext]));

  if (results.length === 0) {
    return <p className="font-serif text-text-muted">No hay entradas que mostrar.</p>;
  }

  return (
    <ol className="flex flex-col gap-3" aria-label="Entradas">
      {results.map((result) => {
        const date = (
          <time dateTime={result.entryDate} className="text-sm text-text-muted">
            {formatEntryDate(result.entryDate)}
          </time>
        );
        if (!isDecrypted(result)) {
          return (
            <li key={result.id} className="rounded-lg border border-danger bg-surface p-4">
              {date}
              <p className="mt-2 flex items-center gap-2 text-sm text-danger">
                <AlertIcon className="shrink-0" />
                No se ha podido descifrar esta entrada: puede estar dañada o haber sido manipulada.
              </p>
            </li>
          );
        }
        const { payload } = result;
        const seed = seeds.get(result.id) ?? "x";
        return (
          <li key={result.id}>
            <Link
              href={`/diario/entrada/${result.id}`}
              className="block rounded-lg border border-border bg-surface p-4 hover:border-border-strong"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                {date}
                {payload.mood && <span className="text-sm text-text-muted">Ánimo: {MOOD_LABELS[payload.mood]}</span>}
              </div>
              <h2 className="mt-1 font-serif text-xl text-text">
                <DecryptReveal text={payload.title || "Sin título"} seed={seed} />
              </h2>
              {payload.body && (
                <p className="mt-1 line-clamp-2 font-serif text-text-muted">
                  <DecryptReveal text={excerpt(payload.body)} seed={seed.slice(40)} />
                </p>
              )}
              {payload.tags.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Etiquetas">
                  {payload.tags.map((tag) => (
                    <li key={tag} className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs text-text">
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
