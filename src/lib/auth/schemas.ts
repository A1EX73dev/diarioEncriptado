import { z } from "zod";

/**
 * Validación de los formularios de autenticación (servidor y cliente).
 * Los mensajes no revelan si una cuenta existe.
 */

export const PASSWORD_MIN_LENGTH = 12;
/** Supabase Auth usa bcrypt, que solo considera los primeros 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

export const emailSchema = z
  .string({ error: "Escribe tu correo." })
  .trim()
  .toLowerCase()
  .min(1, "Escribe tu correo.")
  .max(254, "El correo es demasiado largo.")
  .pipe(z.email("Escribe un correo válido."));

export const newPasswordSchema = z
  .string({ error: "Escribe una contraseña." })
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .refine((value) => utf8Length(value) <= PASSWORD_MAX_BYTES, "La contraseña es demasiado larga (máximo 72 bytes).");

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    passwordConfirm: z.string({ error: "Repite la contraseña." }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "Las contraseñas no coinciden.",
  });

export const signInSchema = z.object({
  email: emailSchema,
  // En el login no se aplica la política (podría haber cambiado); solo un tope.
  password: z.string({ error: "Escribe tu contraseña." }).min(1, "Escribe tu contraseña.").max(1024),
  next: z.string().optional(),
});

export const resetRequestSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: newPasswordSchema,
    passwordConfirm: z.string({ error: "Repite la contraseña." }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "Las contraseñas no coinciden.",
  });

/** Estado que devuelven las Server Actions a los formularios (useActionState). */
export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** Solo valores no sensibles para rellenar de nuevo el formulario (nunca contraseñas). */
  values?: { email?: string };
}

export const initialFormState: FormState = { status: "idle" };

export function fieldErrorsOf(error: z.ZodError): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}
