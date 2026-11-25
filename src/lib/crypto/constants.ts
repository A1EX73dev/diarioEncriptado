/**
 * Constantes del formato criptográfico v1.
 *
 * Cambiar cualquiera de estos valores rompe la compatibilidad con los datos
 * ya guardados: en ese caso hay que crear un FORMAT_VERSION nuevo y mantener
 * el código de lectura del anterior.
 */

/** Versión del formato de entradas y del material de claves. */
export const FORMAT_VERSION = 1 as const;

/** Prefijo de dominio de todos los datos asociados (AAD) e `info` de HKDF. */
export const DOMAIN = "diario-e2e";

/** Tamaño del IV de AES-GCM: 96 bits, el recomendado por NIST SP 800-38D. */
export const IV_BYTES = 12;

/** Tamaño de la etiqueta de autenticación de AES-GCM (128 bits). */
export const TAG_BYTES = 16;

/** Tamaño de las claves simétricas (DEK, KEK, clave de recuperación): 256 bits. */
export const KEY_BYTES = 32;

/** Tamaño de la sal de Argon2id: 128 bits (RFC 9106 recomienda 128). */
export const SALT_BYTES = 16;

/**
 * El texto en claro de cada entrada se rellena hasta un múltiplo de este
 * tamaño para que la longitud del bloque cifrado revele menos información.
 */
export const PADDING_BLOCK_BYTES = 512;

/** Tamaño máximo del texto en claro ya rellenado (192 KiB). */
export const MAX_PADDED_PLAINTEXT_BYTES = 192 * 1024;

/** Tamaño máximo del bloque cifrado (texto rellenado + etiqueta GCM). */
export const MAX_CIPHERTEXT_BYTES = MAX_PADDED_PLAINTEXT_BYTES + TAG_BYTES;

/** Longitud mínima de la frase secreta, en caracteres Unicode (code points). */
export const MIN_PASSPHRASE_LENGTH = 12;

/** Longitud máxima de la frase secreta, para evitar abusos. */
export const MAX_PASSPHRASE_LENGTH = 1024;
