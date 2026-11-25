import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env.server";
import { AFTER_LOGIN_PATH, isGuestOnlyPath, isProtectedPath } from "@/lib/auth/paths";
import { hardenCookieOptions, SESSION_COOKIE_OPTIONS } from "./cookies";
import type { Database } from "./database.types";

/**
 * Refresca la sesión de Supabase en cada petición y redirige según el estado.
 *
 * Esto es una comodidad (evita pintar páginas privadas sin sesión), no la
 * barrera de seguridad: cada página, Server Action y consulta vuelve a
 * comprobar la sesión, y RLS protege los datos en la base de datos.
 */
export async function updateSession(request: NextRequest, forwardHeaders: Record<string, string> = {}) {
  const env = getServerEnv();
  // Continúa hacia la app con las cabeceras extra (nonce y CSP) y las cookies actuales.
  const next = () => {
    const headers = new Headers(request.headers);
    for (const [key, value] of Object.entries(forwardHeaders)) headers.set(key, value);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();

  const supabase = createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, hardenCookieOptions(options));
        }
        // Cabeceras anti-caché que exige la librería al escribir cookies de sesión.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getClaims valida el JWT (firma y caducidad); no basta con leer la cookie.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Conserva las cookies de sesión refrescadas en la redirección.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie" && key.toLowerCase() !== "location") redirect.headers.set(key, value);
    });
    return redirect;
  };

  if (!isSignedIn && isProtectedPath(pathname)) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (isSignedIn && isGuestOnlyPath(pathname)) {
    return redirectTo(AFTER_LOGIN_PATH);
  }
  return response;
}
