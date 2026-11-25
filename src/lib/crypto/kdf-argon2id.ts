import { argon2id } from "hash-wasm";
import { KEY_BYTES } from "./constants";
import { fromBase64Url } from "./encoding";
import type { KdfFunction } from "./kdf";

/**
 * Argon2id (RFC 9106) mediante hash-wasm, ejecutado en el hilo actual.
 *
 * En el navegador no se llama directamente desde la interfaz: lo usa el Web
 * Worker (`kdf.worker.ts`) para no bloquear el hilo principal. En Node se usa
 * tal cual en los tests.
 */
export const argon2idKdf: KdfFunction = async (secret, params) => {
  const output = await argon2id({
    password: secret,
    salt: fromBase64Url(params.salt),
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memoryKiB,
    hashLength: KEY_BYTES,
    outputType: "binary",
  });
  return new Uint8Array(output);
};
