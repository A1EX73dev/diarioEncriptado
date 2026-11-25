import { z } from "zod";
import {
  decryptEntry,
  entryPayloadSchema,
  keyringRecordSchema,
  unlockKeyring,
  type EntryPayload,
  type KdfFunction,
  type KeyringRecord,
} from "@/lib/crypto";
import { encryptedEntrySchema } from "@/lib/crypto";
import { MOOD_LABELS } from "./client";
import { entryDateSchema, entryIdSchema, type DecryptedEntry, type EncryptedEntryRow } from "./types";

/**
 * Copias de seguridad del diario (exportar e importar), en el navegador.
 *
 * - Copia descifrada (JSON o Markdown): legible por cualquiera que tenga el archivo.
 * - Copia cifrada (JSON): bloques cifrados + llavero. Solo se abre con la frase
 *   que tenía el diario al exportar. Si el archivo se filtra, el riesgo es el
 *   mismo que el de una filtración de la base de datos (ataque offline a la frase).
 *
 * Al importar, cada entrada se vuelve a cifrar con la clave del diario actual y
 * recibe un identificador nuevo (el AAD liga el cifrado al usuario y al id).
 */

export const BACKUP_FORMAT = "diario-cifrado";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
export const MAX_BACKUP_ENTRIES = 10_000;

const optionalTimestamp = z.string().max(64).optional();

const decryptedEntrySchema = entryPayloadSchema.extend({
  entryDate: entryDateSchema,
  createdAt: optionalTimestamp,
  updatedAt: optionalTimestamp,
});

export const decryptedBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  kind: z.literal("descifrado"),
  exportedAt: z.string().max(64),
  entries: z.array(decryptedEntrySchema).max(MAX_BACKUP_ENTRIES),
});

export const encryptedBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  kind: z.literal("cifrado"),
  exportedAt: z.string().max(64),
  /** Necesario para el AAD de las entradas originales. */
  userId: entryIdSchema,
  keyring: keyringRecordSchema,
  entries: z
    .array(
      encryptedEntrySchema.extend({
        id: entryIdSchema,
        entryDate: entryDateSchema,
        createdAt: optionalTimestamp,
        updatedAt: optionalTimestamp,
      }),
    )
    .max(MAX_BACKUP_ENTRIES),
});

export type DecryptedBackup = z.infer<typeof decryptedBackupSchema>;
export type EncryptedBackup = z.infer<typeof encryptedBackupSchema>;
export type Backup = DecryptedBackup | EncryptedBackup;

/** Entrada lista para importar: fecha + contenido en claro (solo en memoria). */
export interface PlainEntry {
  entryDate: string;
  payload: EntryPayload;
}

export class BackupFormatError extends Error {
  constructor() {
    super("El archivo no es una copia válida del diario.");
  }
}

export function buildDecryptedBackup(entries: DecryptedEntry[], now = new Date()): DecryptedBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kind: "descifrado",
    exportedAt: now.toISOString(),
    entries: entries.map((e) => ({
      entryDate: e.entryDate,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      ...e.payload,
    })),
  };
}

export function buildEncryptedBackup(
  userId: string,
  keyring: KeyringRecord,
  rows: EncryptedEntryRow[],
  now = new Date(),
): EncryptedBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kind: "cifrado",
    exportedAt: now.toISOString(),
    userId,
    keyring,
    entries: rows.map((r) => ({
      id: r.id,
      entryDate: r.entryDate,
      formatVersion: r.formatVersion,
      iv: r.iv,
      ciphertext: r.ciphertext,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}

/** Un único archivo Markdown, de la entrada más reciente a la más antigua. */
export function toMarkdown(entries: DecryptedEntry[], now = new Date()): string {
  const header = `# Mi diario\n\nExportado el ${now.toISOString().slice(0, 10)}. Este archivo NO está cifrado.\n`;
  const blocks = entries.map(({ entryDate, payload }) => {
    const meta = [
      entryDate,
      payload.mood ? `ánimo: ${MOOD_LABELS[payload.mood]}` : null,
      payload.tags.length ? `etiquetas: ${payload.tags.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return `## ${payload.title || "Sin título"}\n\n_${meta}_\n\n${payload.body.trim()}\n`;
  });
  return [header, ...blocks].join("\n---\n\n");
}

export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupFormatError();
  }
  const kind = (json as { kind?: unknown } | null)?.kind;
  const result = kind === "cifrado" ? encryptedBackupSchema.safeParse(json) : decryptedBackupSchema.safeParse(json);
  if (!result.success) throw new BackupFormatError();
  return result.data;
}

export function plainEntriesOf(backup: DecryptedBackup): PlainEntry[] {
  return backup.entries.map(({ entryDate, title, body, mood, tags }) => ({
    entryDate,
    payload: { title, body, mood, tags },
  }));
}

/**
 * Abre una copia cifrada con la frase que tenía el diario al exportarla.
 * Lanza WrongSecretError si la frase no es correcta. Las entradas que no se
 * puedan descifrar (manipuladas) se cuentan en `failed`.
 */
export async function openEncryptedBackup(
  backup: EncryptedBackup,
  passphrase: string,
  kdf: KdfFunction,
): Promise<{ entries: PlainEntry[]; failed: number }> {
  const dek = await unlockKeyring(backup.keyring, backup.userId, { kind: "passphrase", passphrase }, { kdf });
  const entries: PlainEntry[] = [];
  let failed = 0;
  for (const entry of backup.entries) {
    try {
      const payload = await decryptEntry(
        dek,
        { userId: backup.userId, entryId: entry.id },
        { formatVersion: entry.formatVersion, iv: entry.iv, ciphertext: entry.ciphertext },
      );
      entries.push({ entryDate: entry.entryDate, payload });
    } catch {
      failed++;
    }
  }
  return { entries, failed };
}

/** Clave para detectar entradas ya presentes (misma fecha, título y texto). */
export function duplicateKey(entryDate: string, payload: EntryPayload): string {
  return JSON.stringify([entryDate, payload.title, payload.body]);
}

export function splitDuplicates(candidates: PlainEntry[], existing: DecryptedEntry[]) {
  const seen = new Set(existing.map((e) => duplicateKey(e.entryDate, e.payload)));
  const fresh: PlainEntry[] = [];
  let duplicates = 0;
  for (const entry of candidates) {
    const key = duplicateKey(entry.entryDate, entry.payload);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    fresh.push(entry);
  }
  return { fresh, duplicates };
}

/** Nombre de archivo con la fecha: diario-2026-11-25-cifrado.json */
export function backupFileName(kind: "cifrado" | "descifrado", extension: "json" | "md", now = new Date()): string {
  return `diario-${now.toISOString().slice(0, 10)}-${kind}.${extension}`;
}
