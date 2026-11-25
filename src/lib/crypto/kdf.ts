import { z } from "zod";
import { KEY_BYTES, MAX_PASSPHRASE_LENGTH, MIN_PASSPHRASE_LENGTH, SALT_BYTES } from "./constants";
import { InvalidInputError, WeakPassphraseError } from "./errors";
import { base64UrlLength, randomBytes, toBase64Url, utf8 } from "./encoding";

/**
 * Derivación de la clave de envoltura (KEK) a partir de la frase secreta.
 *
 * La función de derivación (Argon2id) se inyecta como `KdfFunction` para que
 * el hilo principal no tenga que cargar el WASM: en el navegador se usa la
 * versión que corre en un Web Worker (`kdf-worker-client.ts`) y en los tests
 * la versión directa (`kdf-argon2id.ts`).
 */

/** Parámetros por defecto del formato v1 (ver README, sección de criptografía). */
export const DEFAULT_KDF_COST = {
  algorithm: "argon2id",
  /** 64 MiB. */
  memoryKiB: 64 * 1024,
  iterations: 3,
  /** El WASM del navegador es de un solo hilo: más carriles no añaden seguridad. */
  parallelism: 1,
} as const;

/**
 * Límites aceptados al leer parámetros guardados en el servidor. El mínimo
 * coincide con la recomendación mínima de OWASP para Argon2id (19 MiB, t=2);
 * el máximo evita que unos parámetros manipulados bloqueen el navegador.
 */
export const KDF_LIMITS = {
  memoryKiB: { min: 19 * 1024, max: 256 * 1024 },
  iterations: { min: 2, max: 10 },
  parallelism: { min: 1, max: 4 },
} as const;

export const kdfParamsSchema = z
  .object({
    algorithm: z.literal("argon2id"),
    memoryKiB: z.number().int().min(KDF_LIMITS.memoryKiB.min).max(KDF_LIMITS.memoryKiB.max),
    iterations: z.number().int().min(KDF_LIMITS.iterations.min).max(KDF_LIMITS.iterations.max),
    parallelism: z.number().int().min(KDF_LIMITS.parallelism.min).max(KDF_LIMITS.parallelism.max),
    /** Sal aleatoria de 16 bytes en base64url. */
    salt: z
      .string()
      .length(base64UrlLength(SALT_BYTES))
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export type KdfParams = z.infer<typeof kdfParamsSchema>;
export type KdfCost = Omit<KdfParams, "salt">;

/**
 * Deriva `KEY_BYTES` bytes a partir del secreto y los parámetros.
 * La implementación debe devolver un Uint8Array nuevo que el llamador puede sobrescribir.
 */
export type KdfFunction = (secret: Uint8Array, params: KdfParams) => Promise<Uint8Array>;

/** Genera parámetros nuevos con una sal aleatoria. */
export function newKdfParams(cost: KdfCost = DEFAULT_KDF_COST): KdfParams {
  return parseKdfParams({ ...cost, salt: toBase64Url(randomBytes(SALT_BYTES)) });
}

export function parseKdfParams(value: unknown): KdfParams {
  const result = kdfParamsSchema.safeParse(value);
  if (!result.success) {
    throw new InvalidInputError("parámetros de derivación");
  }
  return result.data;
}

/**
 * Normaliza la frase a Unicode NFC antes de codificarla en UTF-8, para que
 * "é" escrito como un carácter o como "e" + tilde combinable dé la misma clave
 * en cualquier sistema operativo o teclado.
 */
export function encodePassphrase(passphrase: string): Uint8Array<ArrayBuffer> {
  return utf8(passphrase.normalize("NFC"));
}

/** Longitud de la frase en caracteres Unicode tras normalizar. */
export function passphraseLength(passphrase: string): number {
  return [...passphrase.normalize("NFC")].length;
}

/**
 * Comprueba la política mínima (solo longitud). La evaluación de fortaleza con
 * zxcvbn vive en la capa de interfaz, porque necesita diccionarios grandes.
 */
export function assertPassphrasePolicy(passphrase: string): void {
  const length = passphraseLength(passphrase);
  if (length < MIN_PASSPHRASE_LENGTH || length > MAX_PASSPHRASE_LENGTH) {
    throw new WeakPassphraseError();
  }
}

/** Deriva la KEK de la frase como CryptoKey AES-GCM no extraíble, solo para envolver claves. */
export async function derivePassphraseKek(passphrase: string, params: KdfParams, kdf: KdfFunction): Promise<CryptoKey> {
  if (passphraseLength(passphrase) > MAX_PASSPHRASE_LENGTH) {
    throw new WeakPassphraseError();
  }
  const secret = encodePassphrase(passphrase);
  let raw: Uint8Array | undefined;
  try {
    raw = await kdf(secret, parseKdfParams(params));
    if (raw.length !== KEY_BYTES) {
      throw new InvalidInputError("salida de la derivación");
    }
    return await crypto.subtle.importKey("raw", new Uint8Array(raw), { name: "AES-GCM" }, false, [
      "wrapKey",
      "unwrapKey",
    ]);
  } finally {
    // Borrado de mejor esfuerzo: JavaScript no garantiza eliminar todas las copias en memoria.
    secret.fill(0);
    raw?.fill(0);
  }
}
