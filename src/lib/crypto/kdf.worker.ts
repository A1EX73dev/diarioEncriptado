import { argon2idKdf } from "./kdf-argon2id";
import type { KdfRequest, KdfResponse } from "./kdf-worker-client";

/**
 * Web Worker que ejecuta Argon2id fuera del hilo principal.
 *
 * Recibe el secreto como bytes transferidos (no se copian) y devuelve la clave
 * derivada también transferida. No guarda nada entre peticiones.
 */

interface WorkerScope {
  onmessage: ((event: MessageEvent<KdfRequest>) => void) | null;
  postMessage(message: KdfResponse, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, secret, params } = event.data;
  argon2idKdf(secret, params)
    .then((key) => {
      scope.postMessage({ id, ok: true, key }, [key.buffer]);
    })
    .catch(() => {
      scope.postMessage({ id, ok: false }, []);
    })
    .finally(() => {
      secret.fill(0);
    });
};
