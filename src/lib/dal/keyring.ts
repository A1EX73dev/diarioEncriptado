import "server-only";
import { parseKeyringRecord, type KeyringRecord } from "@/lib/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Acceso a datos del llavero (servidor). Usa el cliente con la sesión del
 * usuario, así que RLS limita cada consulta a sus propias filas. Los datos
 * que llegan de la base de datos también se validan antes de devolverlos.
 */

type KeyringRow = Database["public"]["Tables"]["keyrings"]["Row"];

export interface StoredKeyring {
  record: KeyringRecord;
  /** Para concurrencia optimista: una actualización solo se aplica si no ha cambiado desde que se leyó. */
  updatedAt: string;
  recoveryCreatedAt: string;
}

function toRecord(row: KeyringRow): StoredKeyring {
  return {
    record: parseKeyringRecord({
      formatVersion: row.format_version,
      kdf: {
        algorithm: row.kdf_algorithm,
        memoryKiB: row.kdf_memory_kib,
        iterations: row.kdf_iterations,
        parallelism: row.kdf_parallelism,
        salt: row.kdf_salt,
      },
      passphrase: { iv: row.pass_wrap_iv, wrappedDek: row.pass_wrapped_dek },
      recovery: { iv: row.recovery_wrap_iv, wrappedDek: row.recovery_wrapped_dek },
    }),
    updatedAt: row.updated_at,
    recoveryCreatedAt: row.recovery_created_at,
  };
}

function toColumns(record: KeyringRecord) {
  return {
    format_version: record.formatVersion,
    kdf_algorithm: record.kdf.algorithm,
    kdf_memory_kib: record.kdf.memoryKiB,
    kdf_iterations: record.kdf.iterations,
    kdf_parallelism: record.kdf.parallelism,
    kdf_salt: record.kdf.salt,
    pass_wrap_iv: record.passphrase.iv,
    pass_wrapped_dek: record.passphrase.wrappedDek,
    recovery_wrap_iv: record.recovery.iv,
    recovery_wrapped_dek: record.recovery.wrappedDek,
  };
}

export async function getKeyring(userId: string): Promise<StoredKeyring | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("keyrings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("No se ha podido leer el llavero.");
  return data ? toRecord(data) : null;
}

export type KeyringWriteResult =
  { ok: true; updatedAt: string } | { ok: false; reason: "exists" | "conflict" | "error" };

export async function insertKeyring(userId: string, record: KeyringRecord): Promise<KeyringWriteResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("keyrings")
    .insert({ user_id: userId, ...toColumns(record) })
    .select("updated_at")
    .single();
  if (error) return { ok: false, reason: error.code === "23505" ? "exists" : "error" };
  return { ok: true, updatedAt: data.updated_at };
}

/** Sustituye el llavero solo si nadie lo ha cambiado desde `expectedUpdatedAt` (p. ej. desde otra pestaña). */
export async function updateKeyring(
  userId: string,
  record: KeyringRecord,
  expectedUpdatedAt: string,
): Promise<KeyringWriteResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("keyrings")
    .update(toColumns(record))
    .eq("user_id", userId)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at");
  if (error) return { ok: false, reason: "error" };
  if (!data || data.length === 0) return { ok: false, reason: "conflict" };
  return { ok: true, updatedAt: data[0]!.updated_at };
}
