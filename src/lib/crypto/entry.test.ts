import { beforeAll, describe, expect, it } from "vitest";
import { decryptEntry, encryptEntry, encryptedEntrySchema, type EncryptedEntry } from "./entry";
import { createKeyring } from "./keyring";
import { DecryptionError, InvalidInputError, PayloadTooLargeError } from "./errors";
import { fromBase64Url, toBase64Url, utf8 } from "./encoding";
import { PADDING_BLOCK_BYTES, TAG_BYTES } from "./constants";
import { newId, PASSPHRASE, samplePayload, tamper, testOptions } from "./test-utils";

describe("cifrado de entradas", () => {
  const userId = newId();
  let dek: CryptoKey;

  beforeAll(async () => {
    ({ dek } = await createKeyring(userId, PASSPHRASE, testOptions));
  });

  it("cifra y descifra una entrada (ida y vuelta)", async () => {
    const entryId = newId();
    const encrypted = await encryptEntry(dek, { userId, entryId }, samplePayload);
    expect(await decryptEntry(dek, { userId, entryId }, encrypted)).toEqual(samplePayload);
  });

  it("conserva texto Unicode y emojis", async () => {
    const entryId = newId();
    const payload = { ...samplePayload, body: 'Ñandú, 你好, 🗝️ y comillas "raras"' };
    const encrypted = await encryptEntry(dek, { userId, entryId }, payload);
    expect(await decryptEntry(dek, { userId, entryId }, encrypted)).toEqual(payload);
  });

  it("no contiene el texto en claro en ninguna forma", async () => {
    const encrypted = await encryptEntry(dek, { userId, entryId: newId() }, samplePayload);
    const serialized = JSON.stringify(encrypted);
    for (const secret of [samplePayload.title, "zanahoria-42", "aprendizaje"]) {
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(toBase64Url(utf8(secret)));
    }
  });

  it("usa un IV distinto en cada cifrado, también con el mismo contenido", async () => {
    const ref = { userId, entryId: newId() };
    const results = await Promise.all(Array.from({ length: 500 }, () => encryptEntry(dek, ref, samplePayload)));
    expect(new Set(results.map((r) => r.iv)).size).toBe(results.length);
    expect(new Set(results.map((r) => r.ciphertext)).size).toBe(results.length);
  });

  describe("detecta manipulaciones", () => {
    const entryId = newId();
    let encrypted: EncryptedEntry;

    beforeAll(async () => {
      encrypted = await encryptEntry(dek, { userId, entryId }, samplePayload);
    });

    it("falla si se modifica el bloque cifrado", async () => {
      for (const index of [0, 100, encrypted.ciphertext.length - 2]) {
        const tampered = { ...encrypted, ciphertext: tamper(encrypted.ciphertext, index) };
        await expect(decryptEntry(dek, { userId, entryId }, tampered)).rejects.toBeInstanceOf(DecryptionError);
      }
    });

    it("falla si se modifica el IV", async () => {
      const tampered = { ...encrypted, iv: tamper(encrypted.iv, 0) };
      await expect(decryptEntry(dek, { userId, entryId }, tampered)).rejects.toBeInstanceOf(DecryptionError);
    });

    it("falla si se trunca el bloque", async () => {
      const bytes = fromBase64Url(encrypted.ciphertext);
      const truncated = { ...encrypted, ciphertext: toBase64Url(bytes.slice(0, bytes.length - PADDING_BLOCK_BYTES)) };
      await expect(decryptEntry(dek, { userId, entryId }, truncated)).rejects.toBeInstanceOf(DecryptionError);
    });

    it("el AAD impide mover la entrada a otro identificador", async () => {
      await expect(decryptEntry(dek, { userId, entryId: newId() }, encrypted)).rejects.toBeInstanceOf(DecryptionError);
    });

    it("el AAD impide mover la entrada a otro usuario, aunque la clave fuese la misma", async () => {
      await expect(decryptEntry(dek, { userId: newId(), entryId }, encrypted)).rejects.toBeInstanceOf(DecryptionError);
    });

    it("el AAD impide intercambiar dos entradas del mismo usuario", async () => {
      const otherId = newId();
      const other = await encryptEntry(dek, { userId, entryId: otherId }, { ...samplePayload, title: "Otra" });
      await expect(decryptEntry(dek, { userId, entryId }, other)).rejects.toBeInstanceOf(DecryptionError);
      await expect(decryptEntry(dek, { userId, entryId: otherId }, encrypted)).rejects.toBeInstanceOf(DecryptionError);
    });

    it("falla con la DEK de otro diario", async () => {
      const other = await createKeyring(userId, PASSPHRASE, testOptions);
      await expect(decryptEntry(other.dek, { userId, entryId }, encrypted)).rejects.toBeInstanceOf(DecryptionError);
    });
  });

  describe("relleno y tamaño", () => {
    it("redondea el bloque a múltiplos de 512 bytes más la etiqueta", async () => {
      const short = await encryptEntry(dek, { userId, entryId: newId() }, { ...samplePayload, body: "a" });
      const longer = await encryptEntry(dek, { userId, entryId: newId() }, { ...samplePayload, body: "a".repeat(200) });
      const shortBytes = fromBase64Url(short.ciphertext).length;
      expect(shortBytes).toBe(PADDING_BLOCK_BYTES + TAG_BYTES);
      expect(fromBase64Url(longer.ciphertext).length).toBe(shortBytes);
    });

    it("rechaza contenido demasiado grande", async () => {
      // 100.000 caracteres de 4 bytes en UTF-8 superan los 192 KiB.
      const huge = { ...samplePayload, body: "🗝".repeat(50_000) };
      await expect(encryptEntry(dek, { userId, entryId: newId() }, huge)).rejects.toBeInstanceOf(PayloadTooLargeError);
    });

    it("rechaza contenido con formato inválido", async () => {
      const bad = { ...samplePayload, tags: ["a", "A"] };
      await expect(encryptEntry(dek, { userId, entryId: newId() }, bad)).rejects.toBeInstanceOf(InvalidInputError);
    });

    it("rechaza identificadores que no son UUID", async () => {
      await expect(encryptEntry(dek, { userId, entryId: "1 OR 1=1" }, samplePayload)).rejects.toBeInstanceOf(
        InvalidInputError,
      );
    });
  });

  describe("validación del servidor (encryptedEntrySchema)", () => {
    it("acepta un bloque generado por el cliente", async () => {
      const encrypted = await encryptEntry(dek, { userId, entryId: newId() }, samplePayload);
      expect(encryptedEntrySchema.safeParse(encrypted).success).toBe(true);
    });

    it("rechaza tamaños que no corresponden a un texto rellenado", () => {
      const ciphertext = toBase64Url(new Uint8Array(PADDING_BLOCK_BYTES + TAG_BYTES + 1));
      const result = encryptedEntrySchema.safeParse({ formatVersion: 1, iv: "A".repeat(16), ciphertext });
      expect(result.success).toBe(false);
      // 705 caracteres no es una longitud base64url posible aunque redondee a 528 bytes.
      const impossible = { formatVersion: 1, iv: "A".repeat(16), ciphertext: "A".repeat(705) };
      expect(encryptedEntrySchema.safeParse(impossible).success).toBe(false);
    });

    it("rechaza texto que no es base64url, versiones desconocidas y campos extra", () => {
      const valid = { formatVersion: 1, iv: "A".repeat(16), ciphertext: "A".repeat(704) };
      expect(encryptedEntrySchema.safeParse(valid).success).toBe(true);
      expect(encryptedEntrySchema.safeParse({ ...valid, ciphertext: "<script>" + "A".repeat(696) }).success).toBe(
        false,
      );
      expect(encryptedEntrySchema.safeParse({ ...valid, formatVersion: 2 }).success).toBe(false);
      expect(encryptedEntrySchema.safeParse({ ...valid, title: "texto en claro" }).success).toBe(false);
    });
  });
});
