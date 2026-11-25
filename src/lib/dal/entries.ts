import "server-only";
import type { EncryptedEntryRow, SaveEntryInput } from "@/lib/entries/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Acceso a datos de las entradas (servidor). El servidor solo maneja bloques
 * cifrados y metadatos; RLS limita cada consulta a las filas del usuario.
 */

export type { EncryptedEntryRow } from "@/lib/entries/types";

const COLUMNS = "id, entry_date, format_version, iv, ciphertext, ciphertext_bytes, created_at, updated_at";

interface Row {
  id: string;
  entry_date: string;
  iv: string;
  ciphertext: string;
  ciphertext_bytes: number | null;
  created_at: string;
  updated_at: string;
}

function toEntry(row: Row): EncryptedEntryRow {
  return {
    id: row.id,
    entryDate: row.entry_date,
    formatVersion: 1,
    iv: row.iv,
    ciphertext: row.ciphertext,
    ciphertextBytes: row.ciphertext_bytes ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listEntries(userId: string): Promise<EncryptedEntryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("entries")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error("No se han podido leer las entradas.");
  return data.map(toEntry);
}

export async function getEntry(userId: string, id: string): Promise<EncryptedEntryRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("entries")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("No se ha podido leer la entrada.");
  return data ? toEntry(data) : null;
}

export type EntryWriteResult =
  { ok: true; updatedAt: string } | { ok: false; reason: "conflict" | "not_found" | "error" };

export async function insertEntry(userId: string, input: SaveEntryInput): Promise<EntryWriteResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("entries")
    .insert({
      id: input.id,
      user_id: userId,
      entry_date: input.entryDate,
      format_version: input.encrypted.formatVersion,
      iv: input.encrypted.iv,
      ciphertext: input.encrypted.ciphertext,
    })
    .select("updated_at")
    .single();
  if (error) return { ok: false, reason: error.code === "23505" ? "conflict" : "error" };
  return { ok: true, updatedAt: data.updated_at };
}

/** Inserción en lote para importar (todas o ninguna). */
export async function insertEntries(userId: string, inputs: SaveEntryInput[]): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("entries").insert(
    inputs.map((input) => ({
      id: input.id,
      user_id: userId,
      entry_date: input.entryDate,
      format_version: input.encrypted.formatVersion,
      iv: input.encrypted.iv,
      ciphertext: input.encrypted.ciphertext,
    })),
  );
  return !error;
}

export async function updateEntry(userId: string, input: SaveEntryInput): Promise<EntryWriteResult> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("entries")
    .update({
      entry_date: input.entryDate,
      format_version: input.encrypted.formatVersion,
      iv: input.encrypted.iv,
      ciphertext: input.encrypted.ciphertext,
    })
    .eq("user_id", userId)
    .eq("id", input.id);
  if (input.expectedUpdatedAt) query = query.eq("updated_at", input.expectedUpdatedAt);
  const { data, error } = await query.select("updated_at");
  if (error) return { ok: false, reason: "error" };
  if (!data || data.length === 0) return { ok: false, reason: input.expectedUpdatedAt ? "conflict" : "not_found" };
  return { ok: true, updatedAt: data[0]!.updated_at };
}

export async function deleteEntry(userId: string, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("entries").delete().eq("user_id", userId).eq("id", id).select("id");
  return !error && (data?.length ?? 0) > 0;
}
