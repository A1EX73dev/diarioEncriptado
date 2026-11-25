"use client";

import { useId, useState } from "react";
import { countByDate, monthGrid, monthOf, shiftMonth, type MonthRef } from "@/lib/entries/calendar";
import { todayIso } from "@/lib/entries/client";

const WEEKDAYS = [
  ["L", "lunes"],
  ["M", "martes"],
  ["X", "miércoles"],
  ["J", "jueves"],
  ["V", "viernes"],
  ["S", "sábado"],
  ["D", "domingo"],
] as const;

const monthFormatter = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Calendario mensual de entradas. Solo usa las fechas (metadato que el
 * servidor ya conoce). Pulsar un día con entradas lo muestra en la lista.
 */
export function CalendarView({ dates, onSelectDay }: { dates: string[]; onSelectDay: (iso: string) => void }) {
  const counts = countByDate(dates);
  const latest = [...dates].sort().at(-1);
  const [current, setCurrent] = useState<MonthRef>(() => monthOf(latest ?? todayIso()));
  const captionId = useId();
  const today = todayIso();
  const title = monthFormatter.format(new Date(Date.UTC(current.year, current.month, 1)));
  const monthTotal = dates.filter((d) => {
    const m = monthOf(d);
    return m.year === current.year && m.month === current.month;
  }).length;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCurrent((m) => shiftMonth(m, -1))}
          className="min-h-11 rounded-md px-3 text-sm hover:bg-surface-sunken"
        >
          <span aria-hidden="true">← </span>Mes anterior
        </button>
        <h2 id={captionId} className="text-center font-serif text-xl first-letter:uppercase" aria-live="polite">
          {title}
          <span className="block text-sm font-normal text-text-muted">
            {monthTotal === 1 ? "1 entrada" : `${monthTotal} entradas`}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setCurrent((m) => shiftMonth(m, 1))}
          className="min-h-11 rounded-md px-3 text-sm hover:bg-surface-sunken"
        >
          Mes siguiente<span aria-hidden="true"> →</span>
        </button>
      </div>
      <table className="w-full table-fixed border-collapse text-center" aria-labelledby={captionId}>
        <thead>
          <tr>
            {WEEKDAYS.map(([short, long]) => (
              <th key={long} scope="col" className="pb-2 text-xs font-medium text-text-muted">
                <abbr title={long} className="no-underline">
                  {short}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(current).map((week) => (
            <tr key={week[0]!.iso}>
              {week.map((day) => {
                const count = counts.get(day.iso) ?? 0;
                const label = `${dayFormatter.format(new Date(`${day.iso}T00:00:00Z`))}${count ? `, ${count === 1 ? "1 entrada" : `${count} entradas`}` : ""}`;
                const base = `mx-auto flex size-10 flex-col items-center justify-center rounded-md text-sm sm:size-12 ${
                  day.inMonth ? "text-text" : "text-text-muted"
                } ${day.iso === today ? "ring-1 ring-border-strong" : ""}`;
                return (
                  <td key={day.iso} className="p-0.5">
                    {count > 0 ? (
                      <button
                        type="button"
                        onClick={() => onSelectDay(day.iso)}
                        aria-label={label}
                        className={`${base} bg-surface-sunken font-semibold hover:bg-border`}
                      >
                        {day.day}
                        <span aria-hidden="true" className="mt-0.5 flex gap-0.5">
                          {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                            <span key={i} className="size-1 rounded-full bg-accent" />
                          ))}
                        </span>
                      </button>
                    ) : (
                      <span className={base}>{day.day}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
