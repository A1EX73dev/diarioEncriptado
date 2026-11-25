import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env.server";
import { hardenCookieOptions, SESSION_COOKIE_OPTIONS } from "./cookies";
import type { Database } from "./database.types";

/**
 * Cliente de Supabase con la sesión del usuario (clave publicable + cookies).
 * Todas las consultas pasan por RLS. Hay que crear uno nuevo por petición.
 */
export async function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, hardenCookieOptions(options));
          }
        } catch {
          // Los Server Components no pueden escribir cookies. La sesión la
          // refresca el proxy (src/proxy.ts) en cada petición.
        }
      },
    },
  });
}
