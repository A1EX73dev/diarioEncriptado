import { bench, describe } from "vitest";
import { argon2idKdf } from "./kdf-argon2id";
import { DEFAULT_KDF_COST, newKdfParams } from "./kdf";

/**
 * Mide el coste de Argon2id en Node (WASM, un hilo). Es solo orientativo:
 * la cifra que importa es la del navegador, sobre todo en móvil, que se
 * medirá en la fase (d) con el worker real.
 *
 *   npm run bench:kdf
 */
const secret = new TextEncoder().encode("caballo grapa batería correcto");

describe("Argon2id", () => {
  bench(
    "coste por defecto (64 MiB, t=3, p=1)",
    async () => {
      await argon2idKdf(secret, newKdfParams(DEFAULT_KDF_COST));
    },
    { iterations: 10, time: 0 },
  );
  bench(
    "mínimo aceptado (19 MiB, t=2, p=1)",
    async () => {
      await argon2idKdf(secret, newKdfParams({ ...DEFAULT_KDF_COST, memoryKiB: 19 * 1024, iterations: 2 }));
    },
    { iterations: 10, time: 0 },
  );
});
