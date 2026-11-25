import { MAX_PADDED_PLAINTEXT_BYTES, PADDING_BLOCK_BYTES } from "./constants";
import { DecryptionError, PayloadTooLargeError } from "./errors";

/**
 * Relleno del texto en claro antes de cifrar.
 *
 * Formato: [longitud: uint32 big-endian][datos][ceros hasta múltiplo de 512].
 *
 * AES-GCM no oculta la longitud del mensaje. Con este relleno, el servidor
 * solo ve el tamaño redondeado a bloques de 512 bytes, no el número exacto
 * de caracteres. No es una protección completa, solo reduce la fuga.
 */

const LENGTH_PREFIX_BYTES = 4;

export function pad(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const needed = LENGTH_PREFIX_BYTES + data.length;
  const total = Math.ceil(needed / PADDING_BLOCK_BYTES) * PADDING_BLOCK_BYTES;
  if (total > MAX_PADDED_PLAINTEXT_BYTES) {
    throw new PayloadTooLargeError();
  }
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, data.length, false);
  out.set(data, LENGTH_PREFIX_BYTES);
  return out;
}

export function unpad(padded: Uint8Array): Uint8Array<ArrayBuffer> {
  if (padded.length === 0 || padded.length % PADDING_BLOCK_BYTES !== 0) {
    throw new DecryptionError();
  }
  const length = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0, false);
  const end = LENGTH_PREFIX_BYTES + length;
  if (end > padded.length) {
    throw new DecryptionError();
  }
  for (let i = end; i < padded.length; i++) {
    if (padded[i] !== 0) {
      throw new DecryptionError();
    }
  }
  return padded.slice(LENGTH_PREFIX_BYTES, end);
}
