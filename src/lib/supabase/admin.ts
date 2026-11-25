import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Cliente con la clave secreta: salta RLS. Su uso está limitado a:
 *   - borrar la cuenta del usuario (auth.admin.deleteUser, que borra en cascada);
 *   - el limitador de intentos de login (funciones login_*).
 * Nunca se usa para leer o escribir entradas en nombre del usuario.
 */
export function createSupabaseAdminClient() {
  const env = getServerEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
