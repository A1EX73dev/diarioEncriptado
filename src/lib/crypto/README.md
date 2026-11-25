# `lib/crypto` — módulo de criptografía

Módulo aislado, sin React ni Next.js. Todo ocurre en el navegador; el servidor solo recibe los registros que devuelve este módulo (texto cifrado y parámetros públicos).

**No inventa ninguna primitiva**: AES-256-GCM, HKDF-SHA256 (Web Crypto), Argon2id (`hash-wasm`) y BIP39 (`@scure/bip39`).

## Jerarquía de claves

```
frase secreta ─NFC─► Argon2id(sal 16 B, 64 MiB, t=3, p=1) ─► KEK_frase ─┐
                                                                        ├─ AES-GCM wrapKey (IV 12 B, AAD) ─► DEK envuelta ×2
clave de recuperación (24 palabras = 256 bits) ─HKDF-SHA256─► KEK_rec ──┘
DEK (AES-256, aleatoria) ─AES-GCM (IV 12 B aleatorio, AAD)─► entradas
```

| Elemento                    | Dónde vive                         | Notas                                     |
| --------------------------- | ---------------------------------- | ----------------------------------------- |
| Frase secreta               | Solo en la cabeza del usuario      | Se normaliza a NFC; mínimo 12 caracteres  |
| Clave de recuperación       | Papel o archivo del usuario        | Se muestra una sola vez                   |
| DEK                         | Memoria del navegador              | `CryptoKey` **no extraíble**              |
| KEK                         | Memoria, solo durante la operación | No extraíble, solo `wrapKey`/`unwrapKey`  |
| Llavero (`KeyringRecord`)   | Servidor                           | Parámetros KDF, sal, IVs, DEK envuelta ×2 |
| Entradas (`EncryptedEntry`) | Servidor                           | IV + bloque cifrado                       |

## Datos asociados (AAD)

| Bloque               | AAD                                                                               |
| -------------------- | --------------------------------------------------------------------------------- |
| Entrada              | `diario-e2e\|entry\|v1\|<user_id>\|<entry_id>`                                    |
| DEK con frase        | `diario-e2e\|keyring\|v1\|<user_id>\|passphrase\|argon2id\|m=…\|t=…\|p=…\|salt=…` |
| DEK con recuperación | `diario-e2e\|keyring\|v1\|<user_id>\|recovery\|hkdf-sha256`                       |

Los identificadores deben ser UUID en minúsculas, así que el separador `|` no es ambiguo.

## Formato de una entrada

Texto en claro: JSON `{ title, body, mood, tags }` validado con zod, precedido de su longitud (uint32) y rellenado con ceros hasta un múltiplo de 512 bytes (máx. 192 KiB). El bloque cifrado ocupa `n·512 + 16` bytes; el servidor valida esa forma con `encryptedEntrySchema`.

## API

```ts
import {
  createKeyring,
  unlockKeyring,
  changePassphrase,
  regenerateRecoveryKey,
  encryptEntry,
  decryptEntry,
  createWorkerKdf,
} from "@/lib/crypto";

const kdf = createWorkerKdf(
  () => new Worker(new URL("@/lib/crypto/kdf.worker.ts", import.meta.url), { type: "module" }),
);

const { record, recoveryPhrase, dek } = await createKeyring(userId, frase, { kdf });
const dek = await unlockKeyring(record, userId, { kind: "passphrase", passphrase }, { kdf });
const dek = await unlockKeyring(record, userId, { kind: "recovery", recoveryPhrase }, { kdf });
const nuevo = await changePassphrase(record, userId, secretoActual, fraseNueva, { kdf });
const { record, recoveryPhrase } = await regenerateRecoveryKey(record, userId, secretoActual, { kdf });

const cifrada = await encryptEntry(dek, { userId, entryId }, { title, body, mood, tags });
const entrada = await decryptEntry(dek, { userId, entryId }, cifrada);
```

Errores (todos con mensajes genéricos): `WrongSecretError`, `DecryptionError`, `InvalidRecoveryPhraseError`, `WeakPassphraseError`, `PayloadTooLargeError`, `InvalidInputError`.

### Detalles de diseño

- **`wrapKey` exige una clave extraíble.** La DEK solo es extraíble dentro de `createKeyring`, `changePassphrase` y `regenerateRecoveryKey`, el tiempo justo para volver a envolverla. Lo que sale del módulo siempre es no extraíble.
- **Verificar la frase = desenvolver la DEK.** Si la etiqueta GCM falla, es `WrongSecretError`. No hay verificador adicional.
- **Cambiar la frase** genera sal nueva y aplica el coste vigente (así se pueden subir los parámetros con el tiempo). Las entradas no se recifran.
- **Límites de los parámetros** al leer del servidor: memoria 19–256 MiB, t 2–10, p 1–4. Evita tanto degradaciones como parámetros enormes que bloqueen el navegador.
- **IV aleatorio de 96 bits** en cada cifrado. El límite de NIST SP 800-38D para IV aleatorios con una misma clave es 2³² cifrados, muy lejos del uso de un diario.
- **Borrado de memoria**: los buffers temporales se sobrescriben con ceros, pero JavaScript no garantiza eliminar todas las copias. Es una medida de mejor esfuerzo.

## Pruebas

```powershell
npm test            # 54 tests: ida y vuelta, frase incorrecta, manipulación, AAD, cambio de frase, recuperación, IV único…
npm run bench:kdf   # coste de Argon2id en Node (orientativo)
```

Medición en Node 25 (equipo de desarrollo): 64 MiB/t=3 ≈ 200 ms; 19 MiB/t=2 ≈ 39 ms. Pendiente: medir en navegador y móvil con el worker real (fase d).
