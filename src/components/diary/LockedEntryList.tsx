import type { EncryptedEntryRow } from "@/lib/entries/types";

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "UTC" });

/** "2026-11-25" → "25 de noviembre de 2026" (la fecha de la entrada no lleva hora). */
export function formatEntryDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * Lista de entradas con el diario bloqueado: fecha (metadato visible) y un
 * fragmento del bloque cifrado como "tinta ilegible". No se puede abrir nada.
 */
export function LockedEntryList({ entries }: { entries: EncryptedEntryRow[] }) {
  if (entries.length === 0) {
    return <p className="font-serif text-text-muted">Todavía no hay entradas.</p>;
  }
  return (
    <ol className="flex flex-col gap-3" aria-label="Entradas cifradas">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text">
            <time dateTime={entry.entryDate}>{formatEntryDate(entry.entryDate)}</time>
          </p>
          <p
            className="mt-2 line-clamp-2 font-mono text-xs leading-relaxed break-all text-text-muted select-none"
            aria-label={`Contenido cifrado, ${entry.ciphertextBytes} bytes`}
            data-testid="ciphertext-preview"
          >
            {entry.ciphertext.slice(0, 180)}
          </p>
        </li>
      ))}
    </ol>
  );
}
