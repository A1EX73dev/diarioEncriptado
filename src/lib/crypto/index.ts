/**
 * API pública del módulo de criptografía del diario.
 *
 * No depende de React ni de Next.js. Solo usa Web Crypto (AES-GCM, HKDF),
 * hash-wasm (Argon2id), @scure/bip39 y zod. La documentación del diseño está
 * en `README.md` de esta carpeta.
 *
 * Importante: este índice no reexporta `argon2idKdf` para que el WASM de
 * Argon2id no entre en el paquete del hilo principal. En el navegador usa
 * `createWorkerKdf`; en tests o en Node importa `./kdf-argon2id`.
 */

export * from "./constants";
export * from "./errors";
export {
  createKeyring,
  unlockKeyring,
  changePassphrase,
  regenerateRecoveryKey,
  parseKeyringRecord,
  keyringRecordSchema,
} from "./keyring";
export type { KeyringRecord, WrappedKey, UnlockSecret, KeyringOptions, CreatedKeyring } from "./keyring";
export { encryptEntry, decryptEntry, entryPayloadSchema, encryptedEntrySchema, MOODS, ENTRY_LIMITS } from "./entry";
export type { EntryPayload, EncryptedEntry, EntryRef, Mood } from "./entry";
export { DEFAULT_KDF_COST, KDF_LIMITS, kdfParamsSchema, assertPassphrasePolicy, passphraseLength } from "./kdf";
export type { KdfParams, KdfCost, KdfFunction } from "./kdf";
export { createWorkerKdf } from "./kdf-worker-client";
export { normalizeRecoveryPhrase, RECOVERY_WORD_COUNT } from "./recovery";
