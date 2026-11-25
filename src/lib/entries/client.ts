import { decryptEntry, ENTRY_LIMITS, type Mood } from "@/lib/crypto";
import type { DecryptedEntry, EncryptedEntryRow } from "./types";

/** Utilidades de entradas para el navegador (sin React). */

export type DecryptResult = DecryptedEntry | { id: string; entryDate: string; failed: true };

export function isDecrypted(result: DecryptResult): result is DecryptedEntry {
  return !("failed" in result);
}

/**
 * Descifra en el navegador. Una entrada manipulada o movida (AAD distinto)
 * no rompe la lista: se marca como ilegible.
 */
export async function decryptRow(dek: CryptoKey, userId: string, row: EncryptedEntryRow): Promise<DecryptResult> {
  try {
    // Solo el bloque cifrado: el esquema es estricto y rechaza campos de más.
    const encrypted = { formatVersion: row.formatVersion, iv: row.iv, ciphertext: row.ciphertext };
    const payload = await decryptEntry(dek, { userId, entryId: row.id }, encrypted);
    return { id: row.id, entryDate: row.entryDate, createdAt: row.createdAt, updatedAt: row.updatedAt, payload };
  } catch {
    return { id: row.id, entryDate: row.entryDate, failed: true };
  }
}

export function decryptRows(dek: CryptoKey, userId: string, rows: EncryptedEntryRow[]): Promise<DecryptResult[]> {
  return Promise.all(rows.map((row) => decryptRow(dek, userId, row)));
}

export const MOOD_LABELS: Record<Mood, string> = {
  "muy-mal": "Muy mal",
  mal: "Mal",
  normal: "Normal",
  bien: "Bien",
  "muy-bien": "Muy bien",
};

/** Fecha local de hoy en formato AAAA-MM-DD. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Viaje, familia,  viaje" → ["Viaje", "familia"] (sin repetidos, sin vacíos, con límites). */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, ENTRY_LIMITS.tagMaxLength);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === ENTRY_LIMITS.maxTags) break;
  }
  return tags;
}

/** Texto plano aproximado a partir de Markdown, para los extractos de la lista. */
export function excerpt(markdown: string, maxLength = 180): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}
