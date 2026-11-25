import type { CookieOptions } from "@supabase/ssr";

/**
 * Opciones de las cookies de sesión de Supabase.
 *
 * - HttpOnly: como el navegador nunca usa el cliente de Supabase, ningún
 *   script necesita leer la sesión; así un XSS no puede robar los tokens.
 * - Secure en producción (en local se sirve por http://localhost).
 * - SameSite=Lax: el enlace de confirmación del correo debe llegar con la
 *   cookie del verificador PKCE; Strict lo impediría. Las mutaciones se
 *   protegen además comprobando el Origin (Server Actions de Next.js).
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const satisfies CookieOptions;

/** Aplica las opciones seguras por encima de las que proponga la librería. */
export function hardenCookieOptions(options: CookieOptions): CookieOptions {
  return { ...options, ...SESSION_COOKIE_OPTIONS };
}
