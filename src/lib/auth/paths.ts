/** Rutas que exigen sesión iniciada. */
export const PROTECTED_PREFIXES = ["/diario", "/ajustes"] as const;

/** Rutas de autenticación: con sesión iniciada no tiene sentido verlas. */
export const GUEST_ONLY_PATHS = ["/login", "/registro"] as const;

export const AFTER_LOGIN_PATH = "/diario";

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY_PATHS.some((prefix) => matchesPrefix(pathname, prefix));
}

/**
 * Devuelve `value` solo si es una ruta interna segura; si no, `fallback`.
 * Evita redirecciones abiertas (`//evil.com`, `/\evil.com`, `https://…`).
 */
export function safeNextPath(value: string | null | undefined, fallback = AFTER_LOGIN_PATH): string {
  if (!value || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const url = new URL(value, "http://interno.invalid");
    if (url.origin !== "http://interno.invalid") return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
