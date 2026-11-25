"use server";

import { redirect } from "next/navigation";
import { getServerEnv } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "./paths";
import {
  fieldErrorsOf,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  type FormState,
} from "./schemas";
import { getSessionUser } from "./session";
import { clearLoginFailures, loginRetryAfter, recordLoginFailure, throttleKeysFor } from "./throttle";

/**
 * Server Actions de autenticación.
 *
 * - Next.js solo las acepta por POST y comprueba que Origin coincida con Host (CSRF).
 * - Toda entrada se valida con zod en el servidor.
 * - Los mensajes son genéricos: nunca indican si un correo está registrado.
 * - No se registra en consola ningún dato del usuario.
 */

const GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos.";
const GENERIC_RETRY_ERROR = "No se ha podido completar la operación. Inténtalo de nuevo en unos minutos.";

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: text(formData, "email"),
    password: text(formData, "password"),
    passwordConfirm: text(formData, "passwordConfirm"),
  });
  const email = text(formData, "email") ?? "";
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values: { email } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${getServerEnv().APP_URL}/auth/confirm` },
  });

  if (error?.code === "weak_password") {
    return {
      status: "error",
      fieldErrors: { password: "Esa contraseña es demasiado débil. Prueba con una más larga." },
      values: { email },
    };
  }
  // `over_email_send_rate_limit` aparece al reenviar la confirmación a una cuenta
  // recién creada: tratarlo como error distinto revelaría que el correo existe.
  if (error && error.code !== "user_already_exists" && error.code !== "over_email_send_rate_limit") {
    return { status: "error", message: GENERIC_RETRY_ERROR, values: { email } };
  }
  // Mismo mensaje exista o no la cuenta: no se revela qué correos están registrados.
  return {
    status: "success",
    message:
      "Si la dirección es válida, te hemos enviado un enlace para confirmar la cuenta. Revisa tu correo (y la carpeta de spam).",
  };
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: text(formData, "email"),
    password: text(formData, "password"),
    next: text(formData, "next"),
  });
  const email = text(formData, "email") ?? "";
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values: { email } };
  }

  const keys = await throttleKeysFor(parsed.data.email);
  if ((await loginRetryAfter(keys)) > 0) {
    return {
      status: "error",
      message: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      values: { email },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      // Supabase solo devuelve este código si la contraseña es correcta, así que no revela cuentas.
      return {
        status: "error",
        message: "Confirma tu correo con el enlace que te enviamos antes de iniciar sesión.",
        values: { email },
      };
    }
    if (error.code === "invalid_credentials") {
      await recordLoginFailure(keys);
      return { status: "error", message: GENERIC_LOGIN_ERROR, values: { email } };
    }
    return { status: "error", message: GENERIC_RETRY_ERROR, values: { email } };
  }

  await clearLoginFailures(keys);
  redirect(safeNextPath(parsed.data.next));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  // "local": cierra esta sesión. El diario se bloquea porque la clave solo vivía en esta página.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?sesion=cerrada");
}

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: text(formData, "email") });
  const email = text(formData, "email") ?? "";
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values: { email } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getServerEnv().APP_URL}/auth/confirm?next=/nueva-contrasena`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return { status: "error", message: GENERIC_RETRY_ERROR, values: { email } };
  }
  return {
    status: "success",
    message:
      "Si hay una cuenta con ese correo, te hemos enviado un enlace para elegir una contraseña nueva. Esto no cambia tu frase secreta del diario.",
  };
}

export async function updatePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getSessionUser())) {
    return { status: "error", message: "El enlace ha caducado. Solicita uno nuevo." };
  }
  const parsed = updatePasswordSchema.safeParse({
    password: text(formData, "password"),
    passwordConfirm: text(formData, "passwordConfirm"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { status: "error", fieldErrors: { password: "La contraseña nueva debe ser distinta de la anterior." } };
    }
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: "Esa contraseña es demasiado débil." } };
    }
    if (error.code === "reauthentication_needed") {
      return { status: "error", message: "Por seguridad, solicita un enlace nuevo para cambiar la contraseña." };
    }
    return { status: "error", message: GENERIC_RETRY_ERROR };
  }
  redirect("/diario?aviso=contrasena-actualizada");
}
