import type { Mood } from "@/lib/crypto";
import type { DecryptedEntry } from "./types";

/**
 * Búsqueda y filtros sobre las entradas YA descifradas, en el navegador.
 * El servidor no puede buscar (solo tiene texto cifrado) y los términos de
 * búsqueda nunca salen de la página: no van en la URL ni en ninguna petición.
 */

export interface EntryFilters {
  text: string;
  tag: string | null;
  mood: Mood | null;
  /** AAAA-MM-DD, inclusivo. */
  from: string | null;
  /** AAAA-MM-DD, inclusivo. */
  to: string | null;
}

export const EMPTY_FILTERS: EntryFilters = { text: "", tag: null, mood: null, from: null, to: null };

/** Minúsculas y sin tildes: "Café" encuentra "cafe" y al revés. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function hasActiveFilters(filters: EntryFilters): boolean {
  return Boolean(filters.text.trim() || filters.tag || filters.mood || filters.from || filters.to);
}

/** Todas las palabras de la búsqueda deben aparecer en el título, el texto o las etiquetas. */
export function filterEntries(entries: DecryptedEntry[], filters: EntryFilters): DecryptedEntry[] {
  const words = normalizeForSearch(filters.text).split(/\s+/).filter(Boolean);
  const tag = filters.tag ? normalizeForSearch(filters.tag) : null;

  return entries.filter((entry) => {
    const { payload, entryDate } = entry;
    if (filters.from && entryDate < filters.from) return false;
    if (filters.to && entryDate > filters.to) return false;
    if (filters.mood && payload.mood !== filters.mood) return false;
    if (tag && !payload.tags.some((t) => normalizeForSearch(t) === tag)) return false;
    if (words.length > 0) {
      const haystack = normalizeForSearch([payload.title, payload.body, ...payload.tags].join("\n"));
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

/** Etiquetas usadas, sin repetir (ignorando mayúsculas y tildes) y ordenadas. */
export function collectTags(entries: DecryptedEntry[]): string[] {
  const byKey = new Map<string, string>();
  for (const entry of entries) {
    for (const tag of entry.payload.tags) {
      const key = normalizeForSearch(tag);
      if (!byKey.has(key)) byKey.set(key, tag);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "es"));
}
