import { createLocalStore } from "./local-store";

/**
 * Límite de intentos de desbloqueo en el cliente.
 *
 * Es una medida de experiencia de usuario (frena a quien prueba frases en
 * tu equipo), no una barrera criptográfica: quien tenga la base de datos
 * puede atacar offline y solo le frena el coste de Argon2id y la fortaleza
 * de la frase. Se guarda en localStorage solo un contador y una hora (nunca
 * la frase), y se puede borrar limpiando los datos del sitio.
 */

export const FREE_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;

export interface AttemptState {
  failures: number;
  lockedUntil: number;
}

export const NO_ATTEMPTS: AttemptState = { failures: 0, lockedUntil: 0 };

/** Tras 5 fallos: 30 s, 1 min, 2 min… hasta 15 min por cada fallo adicional. */
export function registerFailure(state: AttemptState, now: number): AttemptState {
  const failures = state.failures + 1;
  if (failures < FREE_ATTEMPTS) return { failures, lockedUntil: 0 };
  const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (failures - FREE_ATTEMPTS));
  return { failures, lockedUntil: now + delay };
}

export function remainingLockMs(state: AttemptState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

export function parseAttempts(raw: string | null): AttemptState {
  if (!raw) return NO_ATTEMPTS;
  try {
    const parsed = JSON.parse(raw) as Partial<AttemptState>;
    if (Number.isInteger(parsed.failures) && typeof parsed.lockedUntil === "number" && parsed.failures! >= 0) {
      return { failures: parsed.failures!, lockedUntil: parsed.lockedUntil };
    }
  } catch {
    // Valor corrupto: se ignora.
  }
  return NO_ATTEMPTS;
}

export const attemptsStore = createLocalStore("diario.unlock-attempts", parseAttempts, NO_ATTEMPTS);

export function loadAttempts(): AttemptState {
  return attemptsStore.getSnapshot();
}

export function saveAttempts(state: AttemptState): void {
  attemptsStore.write(state.failures === 0 ? null : JSON.stringify(state));
}
