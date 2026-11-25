import type { NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/auth/paths";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Se ejecuta antes de cada página:
 *   1. genera un nonce y la CSP de esta petición (Next.js aplica el nonce a
 *      sus propios scripts leyendo la cabecera CSP de la petición);
 *   2. refresca la sesión de Supabase y redirige según haya sesión o no;
 *   3. evita que se guarden en caché las páginas privadas.
 */
export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const response = await updateSession(request, { "x-nonce": nonce, "Content-Security-Policy": csp });
  response.headers.set("Content-Security-Policy", csp);
  if (isProtectedPath(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [
    // Todo salvo archivos estáticos e imágenes optimizadas.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
