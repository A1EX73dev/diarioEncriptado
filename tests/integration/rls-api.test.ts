import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createKeyring, decryptEntry, encryptEntry, type EncryptedEntry } from "@/lib/crypto";
import { testOptions, samplePayload, PASSPHRASE } from "@/lib/crypto/test-utils";
import { toBase64Url, utf8 } from "@/lib/crypto/encoding";
import { adminClient, anonClient, createSignedInUser, getLocalSupabase } from "./local-supabase";

/**
 * RLS a través de la API real (PostgREST + Auth), con dos usuarias de verdad
 * y datos cifrados con el módulo de criptografía. Complementa los tests pgTAP.
 *
 * Requiere Supabase local: `npx supabase start`.
 */
const env = getLocalSupabase();
const admin = adminClient(env);

type User = Awaited<ReturnType<typeof createSignedInUser>>;
let ana: User;
let bea: User;
const anaEntryId = crypto.randomUUID();
let anaEntry: EncryptedEntry;
let anaDek: CryptoKey;

beforeAll(async () => {
  [ana, bea] = await Promise.all([createSignedInUser(env, "ana"), createSignedInUser(env, "bea")]);

  const { record, dek } = await createKeyring(ana.id, PASSPHRASE, testOptions);
  anaDek = dek;
  const keyring = await ana.client.from("keyrings").insert({
    user_id: ana.id,
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
  });
  expect(keyring.error).toBeNull();

  anaEntry = await encryptEntry(dek, { userId: ana.id, entryId: anaEntryId }, samplePayload);
  const entry = await ana.client.from("entries").insert({
    id: anaEntryId,
    user_id: ana.id,
    entry_date: "2026-11-25",
    format_version: anaEntry.formatVersion,
    iv: anaEntry.iv,
    ciphertext: anaEntry.ciphertext,
  });
  expect(entry.error).toBeNull();
});

afterAll(async () => {
  await Promise.all([ana, bea].filter(Boolean).map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe("RLS vía API", () => {
  it("Ana lee su entrada y la descifra en el cliente", async () => {
    const { data, error } = await ana.client.from("entries").select("*").eq("id", anaEntryId).single();
    expect(error).toBeNull();
    const payload = await decryptEntry(
      anaDek,
      { userId: ana.id, entryId: anaEntryId },
      {
        formatVersion: 1,
        iv: data!.iv,
        ciphertext: data!.ciphertext,
      },
    );
    expect(payload).toEqual(samplePayload);
  });

  it("Bea no ve las entradas ni el llavero de Ana", async () => {
    const entries = await bea.client.from("entries").select("*");
    expect(entries.error).toBeNull();
    expect(entries.data).toEqual([]);
    const keyrings = await bea.client.from("keyrings").select("*");
    expect(keyrings.data).toEqual([]);
  });

  it("Bea no puede modificar ni borrar las entradas de Ana", async () => {
    const updated = await bea.client.from("entries").update({ entry_date: "2000-01-01" }).eq("id", anaEntryId).select();
    expect(updated.data).toEqual([]);
    const deleted = await bea.client.from("entries").delete().eq("id", anaEntryId).select();
    expect(deleted.data).toEqual([]);
    const check = await admin.from("entries").select("entry_date").eq("id", anaEntryId).single();
    expect(check.data?.entry_date).toBe("2026-11-25");
  });

  it("Bea no puede insertar a nombre de Ana", async () => {
    const result = await bea.client.from("entries").insert({
      id: crypto.randomUUID(),
      user_id: ana.id,
      entry_date: "2026-11-25",
      format_version: 1,
      iv: anaEntry.iv,
      ciphertext: anaEntry.ciphertext,
    });
    expect(result.error?.code).toBe("42501");
  });

  it("una petición anónima no tiene acceso", async () => {
    const anon = anonClient(env);
    expect((await anon.from("entries").select("*")).error?.code).toBe("42501");
    expect((await anon.from("keyrings").select("*")).error?.code).toBe("42501");
    const rpc = await anon.rpc("login_retry_after", {
      p_email_key: `email:${"a".repeat(64)}`,
      p_ip_key: `ip:${"b".repeat(64)}`,
    });
    expect(rpc.error).not.toBeNull();
  });

  it("ninguna fila guardada contiene el texto en claro ni la frase", async () => {
    const [entries, keyrings] = await Promise.all([
      admin.from("entries").select("*").eq("user_id", ana.id),
      admin.from("keyrings").select("*").eq("user_id", ana.id),
    ]);
    const stored = JSON.stringify([entries.data, keyrings.data]);
    for (const secret of [samplePayload.title, "zanahoria-42", ...samplePayload.tags, PASSPHRASE]) {
      expect(stored).not.toContain(secret);
      expect(stored).not.toContain(toBase64Url(utf8(secret)));
    }
  });

  it("borrar la cuenta borra en cascada sus datos", async () => {
    const temp = await createSignedInUser(env, "temporal");
    const { record } = await createKeyring(temp.id, PASSPHRASE, testOptions);
    await temp.client.from("keyrings").insert({
      user_id: temp.id,
      format_version: 1,
      kdf_algorithm: "argon2id",
      kdf_memory_kib: record.kdf.memoryKiB,
      kdf_iterations: record.kdf.iterations,
      kdf_parallelism: record.kdf.parallelism,
      kdf_salt: record.kdf.salt,
      pass_wrap_iv: record.passphrase.iv,
      pass_wrapped_dek: record.passphrase.wrappedDek,
      recovery_wrap_iv: record.recovery.iv,
      recovery_wrapped_dek: record.recovery.wrappedDek,
    });
    expect((await admin.auth.admin.deleteUser(temp.id)).error).toBeNull();
    const left = await admin.from("keyrings").select("user_id").eq("user_id", temp.id);
    expect(left.data).toEqual([]);
  });
});
