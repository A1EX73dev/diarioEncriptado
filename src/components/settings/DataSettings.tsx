"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { encryptEntry, WrongSecretError, type KeyringRecord } from "@/lib/crypto";
import { importEntriesAction } from "@/lib/dal/entry-actions";
import { downloadText } from "@/lib/download";
import {
  backupFileName,
  BackupFormatError,
  buildDecryptedBackup,
  buildEncryptedBackup,
  MAX_BACKUP_BYTES,
  openEncryptedBackup,
  parseBackup,
  plainEntriesOf,
  splitDuplicates,
  toMarkdown,
  type Backup,
  type EncryptedBackup,
  type PlainEntry,
} from "@/lib/entries/backup";
import { decryptRows, isDecrypted } from "@/lib/entries/client";
import { IMPORT_BATCH_SIZE, type DecryptedEntry, type EncryptedEntryRow } from "@/lib/entries/types";
import { getBrowserKdf } from "@/lib/vault/browser-kdf";
import { useVault } from "@/lib/vault/VaultProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const MAX_BATCH_CHARS = 800_000;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-surface p-6">
      <h2 id={id} className="font-serif text-xl">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Exportar e importar. Todo el trabajo de cifrado y descifrado ocurre en este navegador. */
export function DataSettings({ record, rows }: { record: KeyringRecord; rows: EncryptedEntryRow[] }) {
  const { dek, userId } = useVault();
  const [decrypted, setDecrypted] = useState<DecryptedEntry[] | null>(null);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    if (!dek) return;
    let cancelled = false;
    decryptRows(dek, userId, rows).then((results) => {
      if (cancelled) return;
      setDecrypted(results.filter(isDecrypted));
      setFailed(results.filter((r) => !isDecrypted(r)).length);
    });
    return () => {
      cancelled = true;
    };
  }, [dek, userId, rows]);

  return (
    <div className="flex flex-col gap-6">
      <ExportSection record={record} rows={rows} decrypted={decrypted} failed={failed} />
      <ImportSection existing={decrypted} />
    </div>
  );
}

function ExportSection({
  record,
  rows,
  decrypted,
  failed,
}: {
  record: KeyringRecord;
  rows: EncryptedEntryRow[];
  decrypted: DecryptedEntry[] | null;
  failed: number;
}) {
  const { userId } = useVault();
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Section title="Exportar">
      <p className="text-sm text-text-muted">
        {rows.length === 1 ? "1 entrada." : `${rows.length} entradas.`} Los archivos se generan en este navegador; no
        pasan por el servidor.
      </p>
      {failed > 0 && (
        <Alert tone="error">
          {failed === 1 ? "1 entrada no se ha podido descifrar" : `${failed} entradas no se han podido descifrar`} y no
          se incluirán en la copia descifrada.
        </Alert>
      )}

      <div className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="font-medium">Copia cifrada (recomendada)</h3>
        <p className="text-sm text-text-muted">
          JSON con las entradas cifradas y la clave del diario envuelta. Para abrirla hará falta la frase secreta
          actual. Guárdala igualmente en un lugar seguro: quien la tenga puede intentar adivinar la frase sin límite de
          intentos.
        </p>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            downloadText(
              backupFileName("cifrado", "json"),
              JSON.stringify(buildEncryptedBackup(userId, record, rows), null, 2),
              "application/json",
            )
          }
        >
          Descargar copia cifrada
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-danger p-4">
        <h3 className="font-medium">Copia descifrada</h3>
        <p className="text-sm text-text-muted">
          Tu diario en texto legible, en JSON (para volver a importarlo) o Markdown (para leerlo o llevártelo a otra
          aplicación).
        </p>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span>
            Entiendo que este archivo <strong>no está cifrado</strong>: cualquiera que acceda a él podrá leer todo mi
            diario.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!acknowledged || !decrypted}
            onClick={() =>
              decrypted &&
              downloadText(
                backupFileName("descifrado", "json"),
                JSON.stringify(buildDecryptedBackup(decrypted), null, 2),
                "application/json",
              )
            }
          >
            Descargar JSON descifrado
          </Button>
          <Button
            variant="secondary"
            disabled={!acknowledged || !decrypted}
            onClick={() =>
              decrypted &&
              downloadText(backupFileName("descifrado", "md"), toMarkdown(decrypted), "text/markdown;charset=utf-8")
            }
          >
            Descargar Markdown
          </Button>
        </div>
      </div>
    </Section>
  );
}

type ImportState =
  | { step: "elegir" }
  | { step: "frase"; backup: EncryptedBackup }
  | { step: "confirmar"; fresh: PlainEntry[]; duplicates: number; failed: number }
  | { step: "hecho"; imported: number };

function ImportSection({ existing }: { existing: DecryptedEntry[] | null }) {
  const router = useRouter();
  const { dek, userId } = useVault();
  const [state, setState] = useState<ImportState>({ step: "elegir" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const fileId = useId();

  function prepare(entries: PlainEntry[], failed: number) {
    const { fresh, duplicates } = splitDuplicates(entries, existing ?? []);
    setState({ step: "confirmar", fresh, duplicates, failed });
  }

  async function readFile() {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Elige un archivo.");
    if (file.size > MAX_BACKUP_BYTES) return setError("El archivo es demasiado grande (máximo 25 MB).");
    let backup: Backup;
    try {
      backup = parseBackup(await file.text());
    } catch (e) {
      return setError(e instanceof BackupFormatError ? e.message : "No se ha podido leer el archivo.");
    }
    if (backup.kind === "cifrado") setState({ step: "frase", backup });
    else prepare(plainEntriesOf(backup), 0);
  }

  async function openBackup(event: FormEvent, backup: EncryptedBackup) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { entries, failed } = await openEncryptedBackup(backup, passphrase, getBrowserKdf());
      setPassphrase("");
      prepare(entries, failed);
    } catch (e) {
      setError(
        e instanceof WrongSecretError
          ? "No se ha podido abrir la copia: la frase no corresponde a este archivo."
          : "No se ha podido abrir la copia.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runImport(entries: PlainEntry[]) {
    if (!dek) return;
    setBusy(true);
    setError(null);
    let imported = 0;
    type Input = { id: string; entryDate: string; encrypted: Awaited<ReturnType<typeof encryptEntry>> };
    let batch: Input[] = [];
    let batchBytes = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      const { ok } = await importEntriesAction(batch);
      if (!ok) throw new Error("lote");
      imported += batch.length;
      setProgress(`Guardadas ${imported} de ${entries.length}…`);
      batch = [];
      batchBytes = 0;
    };
    try {
      for (const { entryDate, payload } of entries) {
        // Identificador nuevo para cada entrada: el AAD liga el cifrado al id y al usuario actuales.
        const id = crypto.randomUUID();
        const encrypted = await encryptEntry(dek, { userId, entryId: id }, payload);
        // Lotes de como mucho 50 entradas y ~800 KB (el límite por defecto de una Server Action es 1 MB).
        if (batch.length === IMPORT_BATCH_SIZE || batchBytes + encrypted.ciphertext.length > MAX_BATCH_CHARS) {
          await flush();
        }
        batch.push({ id, entryDate, encrypted });
        batchBytes += encrypted.ciphertext.length;
      }
      await flush();
      setState({ step: "hecho", imported });
      router.refresh();
    } catch {
      setError(
        imported > 0
          ? `Se importaron ${imported} entradas, pero el resto ha fallado. Puedes repetir la importación: las ya importadas se omitirán.`
          : "No se ha podido importar. Inténtalo de nuevo.",
      );
      router.refresh();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Section title="Importar">
      <p className="text-sm text-text-muted">
        Admite copias exportadas desde esta aplicación (cifradas o descifradas en JSON). Las entradas se cifran de nuevo
        con la clave de tu diario actual. Las que ya existan (misma fecha, título y texto) se omiten.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {progress && (
        <p role="status" className="text-sm">
          {progress}
        </p>
      )}

      {state.step === "elegir" && (
        <div className="flex flex-col gap-3">
          <label htmlFor={fileId} className="text-sm font-medium">
            Archivo de copia (.json)
          </label>
          <input
            id={fileId}
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-4 file:text-sm"
          />
          <Button variant="secondary" className="self-start" onClick={readFile} disabled={!existing}>
            Revisar archivo
          </Button>
        </div>
      )}

      {state.step === "frase" && (
        <form onSubmit={(e) => openBackup(e, state.backup)} className="flex flex-col gap-4" noValidate>
          <p className="text-sm">
            Copia cifrada con {state.backup.entries.length} entradas. Escribe la frase secreta que tenía el diario
            cuando se exportó.
          </p>
          <TextField
            label="Frase secreta de la copia"
            name="backupPassphrase"
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" pending={busy} pendingLabel="Abriendo…" disabled={!passphrase}>
              Abrir copia
            </Button>
            <Button variant="ghost" onClick={() => setState({ step: "elegir" })}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {state.step === "confirmar" && (
        <div className="flex flex-col gap-4">
          <p role="status">
            Se importarán <strong>{state.fresh.length}</strong> entradas.
            {state.duplicates > 0 && ` ${state.duplicates} ya estaban en tu diario y se omitirán.`}
            {state.failed > 0 && ` ${state.failed} no se han podido descifrar y se omitirán.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => runImport(state.fresh)}
              pending={busy}
              pendingLabel="Importando…"
              disabled={state.fresh.length === 0}
            >
              Importar
            </Button>
            <Button variant="ghost" onClick={() => setState({ step: "elegir" })} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {state.step === "hecho" && (
        <>
          <Alert tone="success">
            {state.imported === 1 ? "1 entrada importada." : `${state.imported} entradas importadas.`}
          </Alert>
          <Button variant="ghost" className="self-start" onClick={() => setState({ step: "elegir" })}>
            Importar otro archivo
          </Button>
        </>
      )}
    </Section>
  );
}
