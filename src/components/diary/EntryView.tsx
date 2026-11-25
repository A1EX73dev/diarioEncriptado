"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteEntryAction } from "@/lib/dal/entry-actions";
import { decryptRow, isDecrypted, MOOD_LABELS, type DecryptResult } from "@/lib/entries/client";
import type { EncryptedEntryRow } from "@/lib/entries/types";
import { useVault } from "@/lib/vault/VaultProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DecryptReveal } from "./DecryptReveal";
import { EntryEditor } from "./EntryEditor";
import { formatEntryDate } from "./LockedEntryList";
import { MarkdownView } from "./MarkdownView";

/** Lectura de una entrada descifrada, con edición y borrado. */
export function EntryView({ row, notice }: { row: EncryptedEntryRow; notice?: string }) {
  const router = useRouter();
  const { dek, userId } = useVault();
  const [result, setResult] = useState<DecryptResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dek) return;
    let cancelled = false;
    decryptRow(dek, userId, row).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [dek, userId, row]);

  async function remove() {
    setDeleting(true);
    const { ok } = await deleteEntryAction(row.id);
    if (ok) {
      router.replace("/diario?aviso=entrada-borrada");
      router.refresh();
      return;
    }
    setDeleting(false);
    setConfirming(false);
    setError("No se ha podido borrar la entrada. Inténtalo de nuevo.");
  }

  if (!result) return <p role="status">Descifrando…</p>;
  if (!isDecrypted(result)) {
    return (
      <Alert tone="error">
        No se ha podido descifrar esta entrada: puede estar dañada o haber sido manipulada en el servidor.
      </Alert>
    );
  }

  if (editing) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-serif text-3xl">Editar entrada</h1>
        <EntryEditor
          initial={{ id: row.id, entryDate: row.entryDate, updatedAt: row.updatedAt, payload: result.payload }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const { payload } = result;
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <Link href="/diario" className="text-sm text-accent underline underline-offset-4">
        ← Todas las entradas
      </Link>
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <p className="text-sm text-text-muted">
          <time dateTime={row.entryDate}>{formatEntryDate(row.entryDate)}</time>
          {payload.mood && <> · Ánimo: {MOOD_LABELS[payload.mood]}</>}
        </p>
        <h1 className="font-serif text-4xl leading-tight">
          <DecryptReveal text={payload.title || "Sin título"} seed={row.ciphertext} />
        </h1>
        {payload.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Etiquetas">
            {payload.tags.map((tag) => (
              <li key={tag} className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </header>
      {payload.body.trim() ? <MarkdownView source={payload.body} /> : <p className="text-text-muted">Sin texto.</p>}
      <div className="flex flex-wrap gap-2 border-t border-border pt-6">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Editar
        </Button>
        <Button variant="ghost-danger" onClick={() => setConfirming(true)}>
          Borrar
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="¿Borrar esta entrada?"
        description="Se eliminará del servidor de forma definitiva. Esta acción no se puede deshacer."
        confirmLabel="Borrar definitivamente"
        pending={deleting}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </article>
  );
}
