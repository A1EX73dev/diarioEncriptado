import { DOMAIN, FORMAT_VERSION } from "./constants";
import { InvalidInputError } from "./errors";
import { utf8 } from "./encoding";
import type { KdfParams } from "./kdf";

/**
 * Datos asociados (AAD) de AES-GCM.
 *
 * El AAD no se cifra, pero queda autenticado: si al descifrar no coincide
 * exactamente con el usado al cifrar, la operación falla. Lo usamos para
 * ligar cada bloque cifrado a su dueño, a su identificador y a su propósito,
 * de forma que no se pueda mover a otro usuario, a otra entrada o a otra
 * ranura de clave sin que se detecte.
 *
 * Los campos se separan con "|". No hay ambigüedad porque todos los campos
 * variables tienen un formato cerrado (UUID en minúsculas, enteros, base64url).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function assertUuid(value: string, what: string): void {
  if (!UUID_RE.test(value)) {
    throw new InvalidInputError(what);
  }
}

export type KeySlot = "passphrase" | "recovery";

export function entryAad(userId: string, entryId: string): Uint8Array<ArrayBuffer> {
  assertUuid(userId, "userId");
  assertUuid(entryId, "entryId");
  return utf8([DOMAIN, "entry", `v${FORMAT_VERSION}`, userId, entryId].join("|"));
}

export function passphraseSlotAad(userId: string, kdf: KdfParams): Uint8Array<ArrayBuffer> {
  assertUuid(userId, "userId");
  return utf8(
    [
      DOMAIN,
      "keyring",
      `v${FORMAT_VERSION}`,
      userId,
      "passphrase",
      kdf.algorithm,
      `m=${kdf.memoryKiB}`,
      `t=${kdf.iterations}`,
      `p=${kdf.parallelism}`,
      `salt=${kdf.salt}`,
    ].join("|"),
  );
}

export function recoverySlotAad(userId: string): Uint8Array<ArrayBuffer> {
  assertUuid(userId, "userId");
  return utf8([DOMAIN, "keyring", `v${FORMAT_VERSION}`, userId, "recovery", "hkdf-sha256"].join("|"));
}
