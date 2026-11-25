import { argon2idKdf } from "./kdf-argon2id";
import { KDF_LIMITS, type KdfCost } from "./kdf";
import type { KeyringOptions } from "./keyring";
import type { EntryPayload } from "./entry";

/** Coste mínimo aceptado: mantiene los tests rápidos sin saltarse la validación. */
export const TEST_KDF_COST: KdfCost = {
  algorithm: "argon2id",
  memoryKiB: KDF_LIMITS.memoryKiB.min,
  iterations: KDF_LIMITS.iterations.min,
  parallelism: 1,
};

export const testOptions: KeyringOptions = { kdf: argon2idKdf, kdfCost: TEST_KDF_COST };

export const PASSPHRASE = "caballo grapa batería correcto";
export const OTHER_PASSPHRASE = "tetera lunar bajo la lluvia";

export const newId = () => crypto.randomUUID();

export const samplePayload: EntryPayload = {
  title: "Martes de lluvia",
  body: "Hoy he **aprendido** que AES-GCM autentica el AAD. Secreto: zanahoria-42",
  mood: "bien",
  tags: ["aprendizaje", "criptografía"],
};

/** Cambia un carácter base64url por otro distinto (manipulación de un bit o más). */
export function tamper(value: string, index = Math.floor(value.length / 2)): string {
  const c = value[index];
  const replacement = c === "A" ? "B" : "A";
  return value.slice(0, index) + replacement + value.slice(index + 1);
}
