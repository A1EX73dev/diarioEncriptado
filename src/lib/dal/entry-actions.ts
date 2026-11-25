"use server";

import { requireUser } from "@/lib/auth/session";
import { entryIdSchema, IMPORT_BATCH_SIZE, saveEntryInputSchema } from "@/lib/entries/types";
import { z } from "zod";
import { deleteEntry, insertEntries, insertEntry, updateEntry, type EntryWriteResult } from "./entries";

/**
 * Server Actions de entradas. Reciben solo el bloque cifrado y metadatos;
 * validan el formato y el tamaño con zod (y la base de datos con CHECK),
 * pero no pueden comprobar el contenido.
 */

export async function createEntryAction(input: unknown): Promise<EntryWriteResult> {
  const user = await requireUser();
  const parsed = saveEntryInputSchema.safeParse(input);
  if (!parsed.success || parsed.data.expectedUpdatedAt) return { ok: false, reason: "error" };
  return insertEntry(user.id, parsed.data);
}

export async function updateEntryAction(input: unknown): Promise<EntryWriteResult> {
  const user = await requireUser();
  const parsed = saveEntryInputSchema.safeParse(input);
  if (!parsed.success || !parsed.data.expectedUpdatedAt) return { ok: false, reason: "error" };
  return updateEntry(user.id, parsed.data);
}

/** Importación: lotes de entradas YA cifradas en el navegador con la clave actual. */
export async function importEntriesAction(inputs: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = z.array(saveEntryInputSchema).min(1).max(IMPORT_BATCH_SIZE).safeParse(inputs);
  if (!parsed.success || parsed.data.some((input) => input.expectedUpdatedAt)) return { ok: false };
  return { ok: await insertEntries(user.id, parsed.data) };
}

export async function deleteEntryAction(id: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = entryIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false };
  return { ok: await deleteEntry(user.id, parsed.data) };
}
