import { createLocalStore } from "./local-store";

/** Preferencia de bloqueo automático por inactividad (no es un dato del diario). */

export const AUTOLOCK_OPTIONS_MINUTES = [1, 5, 15, 30, 60] as const;
export const DEFAULT_AUTOLOCK_MINUTES = 15;

export function parseAutoLockMinutes(raw: string | null): number {
  const value = Number(raw);
  return (AUTOLOCK_OPTIONS_MINUTES as readonly number[]).includes(value) ? value : DEFAULT_AUTOLOCK_MINUTES;
}

export const autoLockStore = createLocalStore(
  "diario.autolock-minutes",
  parseAutoLockMinutes,
  DEFAULT_AUTOLOCK_MINUTES,
);

/** "12:05" a partir de milisegundos. */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
