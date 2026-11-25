import { z } from "zod";
import { passphraseSlotAad, recoverySlotAad } from "./aad";
import { FORMAT_VERSION, IV_BYTES, KEY_BYTES, TAG_BYTES } from "./constants";
import { InvalidInputError, WrongSecretError } from "./errors";
import { base64UrlLength, fromBase64Url, randomBytes, toBase64Url } from "./encoding";
import {
  assertPassphrasePolicy,
  derivePassphraseKek,
  kdfParamsSchema,
  newKdfParams,
  type KdfCost,
  type KdfFunction,
  type KdfParams,
} from "./kdf";
import { deriveRecoveryKek, generateRecoverySecret, recoveryPhraseToSecret, recoverySecretToPhrase } from "./recovery";

/**
 * Llavero del diario: la clave de datos (DEK) envuelta dos veces.
 *
 *   frase ──Argon2id──► KEK_frase ──AES-GCM wrapKey──► passphrase.wrappedDek
 *   clave de recuperación ──HKDF──► KEK_rec ──AES-GCM wrapKey──► recovery.wrappedDek
 *
 * El servidor solo guarda este registro. Verificar la frase consiste en
 * intentar desenvolver la DEK: si la etiqueta GCM no cuadra, la frase es
 * incorrecta. No existe ningún otro verificador.
 */

const base64UrlBytes = (bytes: number) =>
  z
    .string()
    .length(base64UrlLength(bytes))
    .regex(/^[A-Za-z0-9_-]+$/);

export const wrappedKeySchema = z
  .object({
    iv: base64UrlBytes(IV_BYTES),
    /** DEK de 32 bytes cifrada + etiqueta de 16 bytes. */
    wrappedDek: base64UrlBytes(KEY_BYTES + TAG_BYTES),
  })
  .strict();

export const keyringRecordSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    kdf: kdfParamsSchema,
    passphrase: wrappedKeySchema,
    recovery: wrappedKeySchema,
  })
  .strict();

export type WrappedKey = z.infer<typeof wrappedKeySchema>;
export type KeyringRecord = z.infer<typeof keyringRecordSchema>;

/** Secreto con el que el usuario abre el diario. */
export type UnlockSecret = { kind: "passphrase"; passphrase: string } | { kind: "recovery"; recoveryPhrase: string };

export interface KeyringOptions {
  /** Implementación de Argon2id (worker en el navegador, directa en tests). */
  kdf: KdfFunction;
  /** Coste de Argon2id para claves nuevas. Por defecto, `DEFAULT_KDF_COST`. */
  kdfCost?: KdfCost;
}

const DEK_ALGORITHM = { name: "AES-GCM", length: 256 } as const;
const DEK_USAGES: KeyUsage[] = ["encrypt", "decrypt"];

export function parseKeyringRecord(value: unknown): KeyringRecord {
  const result = keyringRecordSchema.safeParse(value);
  if (!result.success) {
    throw new InvalidInputError("llavero");
  }
  return result.data;
}

async function wrapDek(dek: CryptoKey, kek: CryptoKey, aad: Uint8Array<ArrayBuffer>): Promise<WrappedKey> {
  const iv = randomBytes(IV_BYTES);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: "AES-GCM",
    iv,
    additionalData: aad,
  });
  return { iv: toBase64Url(iv), wrappedDek: toBase64Url(new Uint8Array(wrapped)) };
}

async function unwrapDek(
  wrapped: WrappedKey,
  kek: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  extractable: boolean,
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      fromBase64Url(wrapped.wrappedDek),
      kek,
      { name: "AES-GCM", iv: fromBase64Url(wrapped.iv), additionalData: aad },
      DEK_ALGORITHM,
      extractable,
      DEK_USAGES,
    );
  } catch {
    // Mensaje genérico: no distinguimos frase incorrecta de datos manipulados.
    throw new WrongSecretError();
  }
}

async function wrapWithPassphrase(
  dek: CryptoKey,
  userId: string,
  passphrase: string,
  options: KeyringOptions,
): Promise<{ kdf: KdfParams; passphrase: WrappedKey }> {
  const kdf = newKdfParams(options.kdfCost);
  const kek = await derivePassphraseKek(passphrase, kdf, options.kdf);
  return { kdf, passphrase: await wrapDek(dek, kek, passphraseSlotAad(userId, kdf)) };
}

async function wrapWithNewRecovery(
  dek: CryptoKey,
  userId: string,
): Promise<{ recovery: WrappedKey; recoveryPhrase: string }> {
  const secret = generateRecoverySecret();
  try {
    const kek = await deriveRecoveryKek(secret);
    return {
      recovery: await wrapDek(dek, kek, recoverySlotAad(userId)),
      recoveryPhrase: recoverySecretToPhrase(secret),
    };
  } finally {
    secret.fill(0);
  }
}

/**
 * Desenvuelve la DEK con la frase o con la clave de recuperación.
 * `extractable` solo es `true` dentro de este módulo, para volver a envolverla.
 */
async function openDek(
  record: KeyringRecord,
  userId: string,
  secret: UnlockSecret,
  options: KeyringOptions,
  extractable: boolean,
): Promise<CryptoKey> {
  const parsed = parseKeyringRecord(record);
  if (secret.kind === "passphrase") {
    const kek = await derivePassphraseKek(secret.passphrase, parsed.kdf, options.kdf);
    return unwrapDek(parsed.passphrase, kek, passphraseSlotAad(userId, parsed.kdf), extractable);
  }
  const recoverySecret = recoveryPhraseToSecret(secret.recoveryPhrase);
  try {
    const kek = await deriveRecoveryKek(recoverySecret);
    return unwrapDek(parsed.recovery, kek, recoverySlotAad(userId), extractable);
  } finally {
    recoverySecret.fill(0);
  }
}

export interface CreatedKeyring {
  /** Registro que se guarda en el servidor. */
  record: KeyringRecord;
  /** Clave de recuperación (24 palabras). Se muestra una sola vez y no se guarda. */
  recoveryPhrase: string;
  /** DEK lista para usar, no extraíble. */
  dek: CryptoKey;
}

/** Crea el diario: genera la DEK y la envuelve con la frase y con una clave de recuperación nueva. */
export async function createKeyring(
  userId: string,
  passphrase: string,
  options: KeyringOptions,
): Promise<CreatedKeyring> {
  assertPassphrasePolicy(passphrase);
  // La DEK nace extraíble solo porque wrapKey lo exige; no sale de esta función.
  const extractableDek = await crypto.subtle.generateKey(DEK_ALGORITHM, true, DEK_USAGES);
  const passphrasePart = await wrapWithPassphrase(extractableDek, userId, passphrase, options);
  const recoveryPart = await wrapWithNewRecovery(extractableDek, userId);
  const record = parseKeyringRecord({
    formatVersion: FORMAT_VERSION,
    kdf: passphrasePart.kdf,
    passphrase: passphrasePart.passphrase,
    recovery: recoveryPart.recovery,
  });
  // Se devuelve una copia no extraíble, obtenida desenvolviendo el propio registro.
  const dek = await openDek(
    record,
    userId,
    { kind: "recovery", recoveryPhrase: recoveryPart.recoveryPhrase },
    options,
    false,
  );
  return { record, recoveryPhrase: recoveryPart.recoveryPhrase, dek };
}

/** Desbloquea el diario. Devuelve la DEK como CryptoKey no extraíble. */
export async function unlockKeyring(
  record: KeyringRecord,
  userId: string,
  secret: UnlockSecret,
  options: KeyringOptions,
): Promise<CryptoKey> {
  return openDek(record, userId, secret, options, false);
}

/**
 * Cambia la frase secreta: vuelve a envolver la DEK con una KEK nueva (sal nueva
 * y coste actual). Las entradas no se recifran y la clave de recuperación no cambia.
 * Sirve también para fijar una frase nueva tras recuperar con la clave de recuperación.
 */
export async function changePassphrase(
  record: KeyringRecord,
  userId: string,
  current: UnlockSecret,
  newPassphrase: string,
  options: KeyringOptions,
): Promise<KeyringRecord> {
  assertPassphrasePolicy(newPassphrase);
  const dek = await openDek(record, userId, current, options, true);
  const passphrasePart = await wrapWithPassphrase(dek, userId, newPassphrase, options);
  return parseKeyringRecord({ ...record, kdf: passphrasePart.kdf, passphrase: passphrasePart.passphrase });
}

/** Genera una clave de recuperación nueva; la anterior deja de servir. */
export async function regenerateRecoveryKey(
  record: KeyringRecord,
  userId: string,
  current: UnlockSecret,
  options: KeyringOptions,
): Promise<{ record: KeyringRecord; recoveryPhrase: string }> {
  const dek = await openDek(record, userId, current, options, true);
  const { recovery, recoveryPhrase } = await wrapWithNewRecovery(dek, userId);
  return { record: parseKeyringRecord({ ...record, recovery }), recoveryPhrase };
}
