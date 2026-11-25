import { MIN_PASSPHRASE_LENGTH, passphraseLength } from "@/lib/crypto";

/**
 * Evaluación de la fortaleza de la frase secreta con zxcvbn-ts (diccionarios
 * comunes + español). Los diccionarios pesan, así que se cargan bajo demanda.
 *
 * Exigimos puntuación ≥ 3 ("difícil de adivinar") además de la longitud
 * mínima: la frase es lo único que protege el diario si alguien copia la
 * base de datos y la ataca sin conexión.
 */

export const MIN_STRENGTH_SCORE = 3;

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  ok: boolean;
  tooShort: boolean;
  warning: string | null;
  suggestions: string[];
}

type Checker = (
  password: string,
  userInputs?: string[],
) => { score: number; feedback: { warning: string | null; suggestions: string[] } };

let checkerPromise: Promise<Checker> | null = null;

async function loadChecker(): Promise<Checker> {
  const [{ ZxcvbnFactory }, common, es] = await Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-es-es"),
  ]);
  const factory = new ZxcvbnFactory({
    translations: es.translations,
    graphs: common.adjacencyGraphs,
    dictionary: { ...common.dictionary, ...es.dictionary },
  });
  return (password, userInputs) => factory.check(password, userInputs);
}

export async function assessPassphrase(passphrase: string, userInputs: string[] = []): Promise<StrengthResult> {
  checkerPromise ??= loadChecker();
  const check = await checkerPromise;
  // zxcvbn es costoso con textos muy largos; los primeros 100 caracteres bastan para puntuar.
  const result = check(passphrase.slice(0, 100), [...userInputs, "diario", "cifrado", "secreto"]);
  const score = Math.max(0, Math.min(4, result.score)) as StrengthResult["score"];
  const tooShort = passphraseLength(passphrase) < MIN_PASSPHRASE_LENGTH;
  return {
    score,
    tooShort,
    ok: !tooShort && score >= MIN_STRENGTH_SCORE,
    warning: result.feedback.warning,
    suggestions: result.feedback.suggestions,
  };
}

export const STRENGTH_LABELS = ["Muy débil", "Débil", "Mejorable", "Fuerte", "Muy fuerte"] as const;
