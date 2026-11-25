/** Cálculos del calendario mensual (lunes como primer día, como en España). */

export interface MonthRef {
  year: number;
  /** 0 = enero. */
  month: number;
}

export interface CalendarDay {
  /** AAAA-MM-DD */
  iso: string;
  day: number;
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function monthOf(iso: string): MonthRef {
  const [year, month] = iso.split("-").map(Number);
  return { year: year!, month: month! - 1 };
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Semanas completas (de lunes a domingo) que cubren el mes. */
export function monthGrid({ year, month }: MonthRef): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // lunes = 0
  const start = Date.UTC(year, month, 1 - offset);
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start + (w * 7 + d) * 86_400_000);
      week.push({
        iso: isoOf(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month,
      });
    }
    // La última semana solo si aún contiene días del mes.
    if (w > 3 && !week.some((day) => day.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}

export function countByDate(dates: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const date of dates) counts.set(date, (counts.get(date) ?? 0) + 1);
  return counts;
}
