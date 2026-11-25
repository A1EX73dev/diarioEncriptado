"use server";

import { z } from "zod";
import { keyringRecordSchema } from "@/lib/crypto";
import { requireUser } from "@/lib/auth/session";
import { insertKeyring, updateKeyring, type KeyringWriteResult } from "./keyring";

/**
 * Server Actions del llavero. El navegador envía solo material cifrado
 * (DEK envuelta, sal, IVs, parámetros). El servidor valida el formato con el
 * mismo esquema zod que usa el cliente, pero no puede comprobar el contenido.
 */

export async function createKeyringAction(input: unknown): Promise<KeyringWriteResult> {
  const user = await requireUser();
  const parsed = keyringRecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "error" };
  return insertKeyring(user.id, parsed.data);
}

const updateSchema = z.object({
  record: keyringRecordSchema,
  expectedUpdatedAt: z.string().min(1).max(64),
});

export async function updateKeyringAction(input: unknown): Promise<KeyringWriteResult> {
  const user = await requireUser();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "error" };
  return updateKeyring(user.id, parsed.data.record, parsed.data.expectedUpdatedAt);
}
