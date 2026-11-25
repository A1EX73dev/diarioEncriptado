import { describe, expect, it } from "vitest";
import { fromBase64Url, randomBytes, toBase64Url } from "./encoding";
import { pad, unpad } from "./padding";
import { DecryptionError, InvalidInputError, PayloadTooLargeError } from "./errors";
import { MAX_PADDED_PLAINTEXT_BYTES, PADDING_BLOCK_BYTES } from "./constants";
import { argon2idKdf } from "./kdf-argon2id";
import { newKdfParams, parseKdfParams } from "./kdf";
import { TEST_KDF_COST } from "./test-utils";
import { normalizeRecoveryPhrase, recoveryPhraseToSecret, recoverySecretToPhrase } from "./recovery";

describe("base64url", () => {
  it("ida y vuelta con longitudes variadas", () => {
    for (let length = 0; length < 70; length++) {
      const bytes = randomBytes(length);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it("rechaza caracteres fuera del alfabeto y formas no canónicas", () => {
    expect(() => fromBase64Url("ab+c")).toThrow(InvalidInputError);
    expect(() => fromBase64Url("abc=")).toThrow(InvalidInputError);
    expect(() => fromBase64Url("a")).toThrow(InvalidInputError);
    // "AB" y "AA" decodificarían al mismo byte; solo "AA" es canónica.
    expect(() => fromBase64Url("AB")).toThrow(InvalidInputError);
  });
});

describe("relleno", () => {
  it("ida y vuelta y tamaño múltiplo de 512", () => {
    for (const length of [0, 1, 507, 508, 509, 2000]) {
      const data = randomBytes(length);
      const padded = pad(data);
      expect(padded.length % PADDING_BLOCK_BYTES).toBe(0);
      expect(unpad(padded)).toEqual(data);
    }
  });

  it("rechaza datos por encima del máximo", () => {
    expect(() => pad(new Uint8Array(MAX_PADDED_PLAINTEXT_BYTES))).toThrow(PayloadTooLargeError);
  });

  it("rechaza longitudes imposibles o relleno distinto de cero", () => {
    const padded = pad(new Uint8Array([1, 2, 3]));
    const badLength = padded.slice();
    new DataView(badLength.buffer).setUint32(0, 10_000);
    expect(() => unpad(badLength)).toThrow(DecryptionError);
    const badPadding = padded.slice();
    badPadding[100] = 1;
    expect(() => unpad(badPadding)).toThrow(DecryptionError);
  });
});

describe("Argon2id", () => {
  it("es determinista y sensible a la frase y a la sal", async () => {
    const params = newKdfParams(TEST_KDF_COST);
    const secret = new TextEncoder().encode("frase de prueba larga");
    const a = await argon2idKdf(secret, params);
    const b = await argon2idKdf(secret, params);
    const otherSecret = await argon2idKdf(new TextEncoder().encode("frase de prueba large"), params);
    const otherSalt = await argon2idKdf(secret, newKdfParams(TEST_KDF_COST));
    expect(a).toHaveLength(32);
    expect(a).toEqual(b);
    expect(a).not.toEqual(otherSecret);
    expect(a).not.toEqual(otherSalt);
  });

  it("valida algoritmo, límites y campos extra", () => {
    const params = newKdfParams(TEST_KDF_COST);
    expect(() => parseKdfParams({ ...params, algorithm: "pbkdf2" })).toThrow(InvalidInputError);
    expect(() => parseKdfParams({ ...params, memoryKiB: 1024 })).toThrow(InvalidInputError);
    expect(() => parseKdfParams({ ...params, extra: 1 })).toThrow(InvalidInputError);
    expect(() => parseKdfParams({ ...params, salt: "corta" })).toThrow(InvalidInputError);
  });
});

describe("formato de la clave de recuperación", () => {
  it("convierte 32 bytes en 24 palabras y vuelta", () => {
    const secret = randomBytes(32);
    const phrase = recoverySecretToPhrase(secret);
    expect(phrase.split(" ")).toHaveLength(24);
    expect(recoveryPhraseToSecret(phrase)).toEqual(secret);
  });

  it("normaliza separadores y mayúsculas", () => {
    expect(normalizeRecoveryPhrase("  Abandon-ABILITY,\nable ")).toBe("abandon ability able");
  });

  it("rechaza frases de 12 palabras aunque sean BIP39 válidas", () => {
    const twelve = recoverySecretToPhrase(randomBytes(16));
    expect(twelve.split(" ")).toHaveLength(12);
    expect(() => recoveryPhraseToSecret(twelve)).toThrow();
  });
});
