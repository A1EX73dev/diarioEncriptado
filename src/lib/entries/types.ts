import { z } from "zod";
import { encryptedEntrySchema, type EntryPayload } from "@/lib/crypto";

/** Entrada cifrada tal como la devuelve el servidor (lo único que el servidor conoce). */
export interface EncryptedEntryRow {
  id: string;
  /** Metadato visible: fecha de la entrada (AAAA-MM-DD). */
  entryDate: string;
  formatVersion: 1;
  iv: string;
  ciphertext: string;
  ciphertextBytes: number;
  createdAt: string;
  updatedAt: string;
}

/** Entrada descifrada en el navegador. Solo existe en memoria mientras el diario está desbloqueado. */
export interface DecryptedEntry {
  id: string;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
  payload: EntryPayload;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().startsWith(value) &&
      value >= "1900-01-01" &&
      value <= "2999-12-31"
    );
  }, "Fecha no válida");

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

/** Lo que el navegador envía al guardar: identificador, fecha y bloque cifrado. Nada más. */
export const saveEntryInputSchema = z
  .object({
    id: uuid,
    entryDate: isoDate,
    encrypted: encryptedEntrySchema,
    /** Al editar: la versión que se leyó, para no pisar cambios hechos en otra pestaña. */
    expectedUpdatedAt: z.string().min(1).max(64).optional(),
  })
  .strict();

export type SaveEntryInput = z.infer<typeof saveEntryInputSchema>;

export const entryIdSchema = uuid;

/** Entradas por petición al importar. */
export const IMPORT_BATCH_SIZE = 50;
export { isoDate as entryDateSchema };
