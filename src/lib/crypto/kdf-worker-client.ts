import type { KdfFunction, KdfParams } from "./kdf";
import { CryptoModuleError } from "./errors";

/**
 * Cliente del Web Worker de derivación.
 *
 * Uso en un componente cliente (el bundler necesita ver la URL literal):
 *
 * ```ts
 * const kdf = createWorkerKdf(
 *   () => new Worker(new URL("@/lib/crypto/kdf.worker.ts", import.meta.url), { type: "module" }),
 * );
 * ```
 *
 * Cada derivación crea un worker y lo termina al acabar, para liberar los
 * 64 MiB de memoria de Argon2id y no dejar estado vivo.
 */

export interface KdfRequest {
  id: number;
  secret: Uint8Array;
  params: KdfParams;
}

export type KdfResponse = { id: number; ok: true; key: Uint8Array } | { id: number; ok: false };

export function createWorkerKdf(createWorker: () => Worker): KdfFunction {
  let nextId = 0;
  return (secret, params) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const worker = createWorker();
      const id = nextId++;
      // Se transfiere una copia para que el llamador conserve (y luego borre) su buffer.
      const transferable = new Uint8Array(secret);
      worker.onmessage = (event: MessageEvent<KdfResponse>) => {
        if (event.data.id !== id) return;
        worker.terminate();
        if (event.data.ok) {
          resolve(event.data.key);
        } else {
          reject(new CryptoModuleError("Ha fallado la derivación de la clave."));
        }
      };
      worker.onerror = () => {
        worker.terminate();
        reject(new CryptoModuleError("Ha fallado la derivación de la clave."));
      };
      const request: KdfRequest = { id, secret: transferable, params };
      worker.postMessage(request, [transferable.buffer]);
    });
}
