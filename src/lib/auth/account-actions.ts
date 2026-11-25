"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerEnv } from "@/lib/env.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrorsOf, type FormState } from "./schemas";
import { requireUser } from "./session";
import { clearLoginFailures, loginRetryAfter, recordLoginFailure, throttleKeysFor } from "./throttle";

/**
 * Borrado de la cuenta (derecho de supresión del RGPD).
 *
 * Exige la contraseña de la cuenta (aunque haya sesión: alguien podría usar un
 * equipo desbloqueado) y escribir BORRAR. Comparte el limitador del login.
 * Borrar el usuario de Supabase Auth elimina en cascada su llavero y todas sus
 * entradas (ON DELETE CASCADE).
 */

const DELETE_CONFIRMATION_WORD = "BORRAR";

const schema = z.object({
  password: z.string({ error: "Escribe tu contraseña." }).min(1, "Escribe tu contraseña.").max(1024),
  confirmation: z.string().refine((v) => v.trim() === DELETE_CONFIRMATION_WORD, {
    message: `Escribe ${DELETE_CONFIRMATION_WORD} en mayúsculas para confirmar.`,
  }),
});

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse({ password: formData.get("password"), confirmation: formData.get("confirmation") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!user.email) return { status: "error", message: "No se ha podido borrar la cuenta." };

  const keys = await throttleKeysFor(user.email);
  if ((await loginRetryAfter(keys)) > 0) {
    return { status: "error", message: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo." };
  }

  // Comprobación de la contraseña con un cliente aparte, sin tocar las cookies de esta sesión.
  const env = getServerEnv();
  const verifier = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: passwordError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.password,
  });
  if (passwordError) {
    await recordLoginFailure(keys);
    return { status: "error", fieldErrors: { password: "La contraseña no es correcta." } };
  }
  await verifier.auth.signOut({ scope: "local" });
  await clearLoginFailures(keys);

  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(user.id);
  if (error) return { status: "error", message: "No se ha podido borrar la cuenta. Inténtalo de nuevo." };

  // La cuenta ya no existe; se limpian las cookies de sesión de este navegador.
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Si la sesión ya no es válida, no hay nada más que cerrar.
  }
  redirect("/?aviso=cuenta-borrada");
}
