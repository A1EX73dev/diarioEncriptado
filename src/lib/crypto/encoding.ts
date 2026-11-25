import { InvalidInputError } from "./errors";

/**
 * Utilidades de codificación y aleatoriedad.
 *
 * Todos los binarios se guardan como base64url sin relleno (RFC 4648 §5).
 * La decodificación es estricta: rechaza caracteres fuera del alfabeto y
 * codificaciones no canónicas, para que un mismo valor tenga una única forma.
 */

const BASE64URL_RE = /^[A-Za-z0-9_-]*$/;

const textEncoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL_RE.test(value) || value.length % 4 === 1) {
    throw new InvalidInputError("base64url");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  // Rechaza formas no canónicas (bits sobrantes distintos de cero en el último carácter).
  if (toBase64Url(bytes) !== value) {
    throw new InvalidInputError("base64url");
  }
  return bytes;
}

/** Longitud en caracteres base64url (sin relleno) de `byteLength` bytes. */
export function base64UrlLength(byteLength: number): number {
  return Math.ceil((byteLength * 4) / 3);
}

/** Bytes aleatorios de un CSPRNG (`crypto.getRandomValues`). */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** UTF-8 de un texto. */
export function utf8(value: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(value);
}

/** Copia a un Uint8Array respaldado por un ArrayBuffer propio (lo que exige Web Crypto). */
export function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}
