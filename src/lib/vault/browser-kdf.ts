"use client";

import { createWorkerKdf, type KdfFunction } from "@/lib/crypto";

let kdf: KdfFunction | undefined;

/**
 * Argon2id en un Web Worker. La URL tiene que ser literal para que el
 * bundler empaquete el worker (y con él el WASM de hash-wasm).
 */
export function getBrowserKdf(): KdfFunction {
  kdf ??= createWorkerKdf(() => new Worker(new URL("../crypto/kdf.worker.ts", import.meta.url), { type: "module" }));
  return kdf;
}
