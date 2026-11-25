"use client";

import { useId } from "react";
import { MOODS, type Mood } from "@/lib/crypto";
import { MOOD_LABELS } from "@/lib/entries/client";
import { EMPTY_FILTERS, hasActiveFilters, type EntryFilters } from "@/lib/entries/filter";
import { Button } from "@/components/ui/Button";

const fieldClass = "min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text";

/** Filtros de la lista. Todo se aplica en memoria; nada viaja al servidor. */
export function FilterBar({
  filters,
  onChange,
  tags,
  total,
  shown,
}: {
  filters: EntryFilters;
  onChange: (filters: EntryFilters) => void;
  tags: string[];
  total: number;
  shown: number;
}) {
  const id = useId();
  const set = <K extends keyof EntryFilters>(key: K, value: EntryFilters[K]) => onChange({ ...filters, [key]: value });

  return (
    <section
      role="search"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      aria-label="Buscar en el diario"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-text`} className="text-sm font-medium">
          Buscar
        </label>
        <input
          id={`${id}-text`}
          type="search"
          value={filters.text}
          onChange={(e) => set("text", e.target.value)}
          placeholder="Palabras del título, el texto o las etiquetas"
          autoComplete="off"
          className={fieldClass}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-tag`} className="text-sm font-medium">
            Etiqueta
          </label>
          <select
            id={`${id}-tag`}
            value={filters.tag ?? ""}
            onChange={(e) => set("tag", e.target.value || null)}
            className={fieldClass}
          >
            <option value="">Todas</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-mood`} className="text-sm font-medium">
            Ánimo
          </label>
          <select
            id={`${id}-mood`}
            value={filters.mood ?? ""}
            onChange={(e) => set("mood", (e.target.value || null) as Mood | null)}
            className={fieldClass}
          >
            <option value="">Cualquiera</option>
            {MOODS.map((mood) => (
              <option key={mood} value={mood}>
                {MOOD_LABELS[mood]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-from`} className="text-sm font-medium">
            Desde
          </label>
          <input
            id={`${id}-from`}
            type="date"
            value={filters.from ?? ""}
            onChange={(e) => set("from", e.target.value || null)}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-to`} className="text-sm font-medium">
            Hasta
          </label>
          <input
            id={`${id}-to`}
            type="date"
            value={filters.to ?? ""}
            onChange={(e) => set("to", e.target.value || null)}
            className={fieldClass}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted" role="status" aria-live="polite">
          {hasActiveFilters(filters) ? `${shown} de ${total} entradas` : `${total} entradas`}
        </p>
        {hasActiveFilters(filters) && (
          <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
            Quitar filtros
          </Button>
        )}
      </div>
    </section>
  );
}
