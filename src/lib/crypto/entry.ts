import { z } from "zod";
import { entryAad } from "./aad";
import { FORMAT_VERSION, IV_BYTES, MAX_CIPHERTEXT_BYTES, PADDING_BLOCK_BYTES, TAG_BYTES } from "./constants";
import { DecryptionError, InvalidInputError } from "./errors";
import { base64UrlLength, fromBase64Url, randomBytes, toBase64Url, utf8 } from "./encoding";
import { pad, unpad } from "./padding";

/**
 * Cifrado de entradas con AES-256-GCM.
 *
 * - IV aleatorio de 96 bits nuevo en cada cifrado (también al editar).
 * - AAD = dominio | "entry" | versión | user_id | entry_id: una entrada no
 *   se puede mover a otro usuario ni a otro identificador.
 * - Título, cuerpo, ánimo y etiquetas van juntos en un único bloque JSON.
 */

export const MOODS = ["muy-mal", "mal", "normal", "bien", "muy-bien"] as const;
export type Mood = (typeof MOODS)[number];

export const ENTRY_LIMITS = {
  titleMaxLength: 200,
  bodyMaxLength: 100_000,
  tagMaxLength: 40,
  maxTags: 20,
} as const;

export const entryPayloadSchema = z
  .object({
    title: z.string().max(ENTRY_LIMITS.titleMaxLength),
    body: z.string().max(ENTRY_LIMITS.bodyMaxLength),
    mood: z.enum(MOODS).nullable(),
    tags: z
      .array(z.string().trim().min(1).max(ENTRY_LIMITS.tagMaxLength))
      .max(ENTRY_LIMITS.maxTags)
      .refine((tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length, {
        message: "Etiquetas repetidas",
      }),
  })
  .strict();

export type EntryPayload = z.infer<typeof entryPayloadSchema>;

const MIN_CIPHERTEXT_BYTES = PADDING_BLOCK_BYTES + TAG_BYTES;

/**
 * Esquema del bloque cifrado tal como viaja al servidor. El servidor lo usa
 * para rechazar formatos inválidos: comprueba el alfabeto, el tamaño del IV y
 * que el tamaño del bloque corresponda a un texto rellenado (n·512 + 16 bytes).
 */
export const encryptedEntrySchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    iv: z
      .string()
      .length(base64UrlLength(IV_BYTES))
      .regex(/^[A-Za-z0-9_-]+$/),
    ciphertext: z
      .string()
      .min(base64UrlLength(MIN_CIPHERTEXT_BYTES))
      .max(base64UrlLength(MAX_CIPHERTEXT_BYTES))
      .regex(/^[A-Za-z0-9_-]+$/)
      .refine((value) => {
        const bytes = Math.floor((value.length * 3) / 4);
        // Longitud base64url exacta (descarta p. ej. 705 caracteres) y bloque de n·512 + 16 bytes.
        return base64UrlLength(bytes) === value.length && (bytes - TAG_BYTES) % PADDING_BLOCK_BYTES === 0;
      }, "Tamaño de bloque no válido"),
  })
  .strict();

export type EncryptedEntry = z.infer<typeof encryptedEntrySchema>;

export interface EntryRef {
  userId: string;
  entryId: string;
}

export async function encryptEntry(dek: CryptoKey, ref: EntryRef, payload: EntryPayload): Promise<EncryptedEntry> {
  const parsed = entryPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new InvalidInputError("contenido de la entrada");
  }
  const plaintext = pad(utf8(JSON.stringify(parsed.data)));
  const iv = randomBytes(IV_BYTES);
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: entryAad(ref.userId, ref.entryId) },
      dek,
      plaintext,
    );
    return {
      formatVersion: FORMAT_VERSION,
      iv: toBase64Url(iv),
      ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptEntry(dek: CryptoKey, ref: EntryRef, encrypted: EncryptedEntry): Promise<EntryPayload> {
  const aad = entryAad(ref.userId, ref.entryId);
  const shape = encryptedEntrySchema.safeParse(encrypted);
  if (!shape.success) {
    throw new DecryptionError();
  }
  let plaintext: Uint8Array<ArrayBuffer>;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64Url(shape.data.iv), additionalData: aad },
        dek,
        fromBase64Url(shape.data.ciphertext),
      ),
    );
  } catch {
    throw new DecryptionError();
  }
  try {
    const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(unpad(plaintext)));
    const payload = entryPayloadSchema.safeParse(json);
    if (!payload.success) {
      throw new DecryptionError();
    }
    return payload.data;
  } catch {
    throw new DecryptionError();
  } finally {
    plaintext.fill(0);
  }
}
