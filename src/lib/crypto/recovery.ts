import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { DOMAIN, FORMAT_VERSION, KEY_BYTES } from "./constants";
import { InvalidRecoveryPhraseError } from "./errors";
import { copyBytes, randomBytes, utf8 } from "./encoding";

/**
 * Clave de recuperación.
 *
 * Son 256 bits aleatorios mostrados como 24 palabras BIP39 (lista inglesa:
 * sin tildes y con las 4 primeras letras únicas). BIP39 añade una suma de
 * control de 8 bits que detecta la mayoría de errores al teclear.
 *
 * Como la clave ya tiene 256 bits de entropía uniforme, no hace falta una
 * función lenta como Argon2id: basta HKDF-SHA256 (RFC 5869) para obtener la
 * KEK con un `info` propio (separación de dominios).
 */

const RECOVERY_INFO = `${DOMAIN}|recovery-kek|v${FORMAT_VERSION}`;

export const RECOVERY_WORD_COUNT = 24;

export function generateRecoverySecret(): Uint8Array<ArrayBuffer> {
  return randomBytes(KEY_BYTES);
}

export function recoverySecretToPhrase(secret: Uint8Array): string {
  return entropyToMnemonic(secret, wordlist);
}

/**
 * Normaliza lo que escribe el usuario: minúsculas, sin espacios sobrantes y
 * aceptando guiones, comas o saltos de línea como separadores.
 */
export function normalizeRecoveryPhrase(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .split(/[\s,;-]+/)
    .filter(Boolean)
    .join(" ");
}

export function recoveryPhraseToSecret(input: string): Uint8Array<ArrayBuffer> {
  const phrase = normalizeRecoveryPhrase(input);
  if (phrase.split(" ").length !== RECOVERY_WORD_COUNT || !validateMnemonic(phrase, wordlist)) {
    throw new InvalidRecoveryPhraseError();
  }
  return copyBytes(mnemonicToEntropy(phrase, wordlist));
}

/** Deriva la KEK de recuperación como CryptoKey AES-GCM no extraíble. */
export async function deriveRecoveryKek(secret: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", copyBytes(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(RECOVERY_INFO) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}
