import { describe, expect, it } from "vitest";
import { assessPassphrase } from "@/lib/passphrase/strength";
import { FREE_ATTEMPTS, NO_ATTEMPTS, parseAttempts, registerFailure, remainingLockMs } from "./attempts";
import { DEFAULT_AUTOLOCK_MINUTES, formatRemaining, parseAutoLockMinutes } from "./autolock";

describe("límite de intentos de desbloqueo", () => {
  it("permite 4 fallos sin espera y bloquea al 5.º", () => {
    let state = NO_ATTEMPTS;
    for (let i = 1; i < FREE_ATTEMPTS; i++) {
      state = registerFailure(state, 0);
      expect(remainingLockMs(state, 0)).toBe(0);
    }
    state = registerFailure(state, 1_000);
    expect(remainingLockMs(state, 1_000)).toBe(30_000);
  });

  it("duplica la espera con cada fallo y la limita a 15 minutos", () => {
    let state = { failures: FREE_ATTEMPTS, lockedUntil: 0 };
    state = registerFailure(state, 0);
    expect(state.lockedUntil).toBe(60_000);
    state = registerFailure({ failures: 50, lockedUntil: 0 }, 0);
    expect(state.lockedUntil).toBe(15 * 60_000);
  });

  it("la espera se agota con el tiempo", () => {
    const state = registerFailure({ failures: 4, lockedUntil: 0 }, 0);
    expect(remainingLockMs(state, 29_000)).toBe(1_000);
    expect(remainingLockMs(state, 31_000)).toBe(0);
  });

  it("ignora valores guardados corruptos o manipulados", () => {
    expect(parseAttempts(null)).toEqual(NO_ATTEMPTS);
    expect(parseAttempts("no es json")).toEqual(NO_ATTEMPTS);
    expect(parseAttempts('{"failures":-3,"lockedUntil":0}')).toEqual(NO_ATTEMPTS);
    expect(parseAttempts('{"failures":6,"lockedUntil":123}')).toEqual({ failures: 6, lockedUntil: 123 });
  });
});

describe("bloqueo automático", () => {
  it("solo acepta las opciones ofrecidas", () => {
    expect(parseAutoLockMinutes("5")).toBe(5);
    expect(parseAutoLockMinutes("0")).toBe(DEFAULT_AUTOLOCK_MINUTES);
    expect(parseAutoLockMinutes("99999")).toBe(DEFAULT_AUTOLOCK_MINUTES);
    expect(parseAutoLockMinutes(null)).toBe(DEFAULT_AUTOLOCK_MINUTES);
  });

  it("formatea el tiempo restante", () => {
    expect(formatRemaining(15 * 60_000)).toBe("15:00");
    expect(formatRemaining(61_500)).toBe("1:02");
    expect(formatRemaining(-5)).toBe("0:00");
  });
});

describe("fortaleza de la frase (zxcvbn)", () => {
  it.each(["contraseña123", "123456789012", "aaaaaaaaaaaaaaaa", "qwertyuiopasdf"])("rechaza «%s»", async (p) => {
    expect((await assessPassphrase(p)).ok).toBe(false);
  });

  it("rechaza frases que contienen el correo del usuario", async () => {
    const result = await assessPassphrase("anagarcia@example.test", ["anagarcia@example.test", "anagarcia"]);
    expect(result.ok).toBe(false);
  });

  it("exige la longitud mínima aunque la puntuación sea alta", async () => {
    const result = await assessPassphrase("Zq9#vT!2");
    expect(result.tooShort).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("acepta varias palabras al azar", async () => {
    const result = await assessPassphrase("tetera lunar brújula pimiento");
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("da avisos en español", async () => {
    const result = await assessPassphrase("contraseña123");
    expect([result.warning, ...result.suggestions].join(" ")).toMatch(/[áéíóúñ]|contraseña|palabra|añade/i);
  });
});
