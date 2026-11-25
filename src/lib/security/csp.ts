/**
 * Content Security Policy estricta, con un nonce nuevo en cada petición.
 *
 * - script-src: solo scripts con el nonce (los de Next.js/React lo reciben
 *   automáticamente) y los que estos carguen ('strict-dynamic'). Ningún script
 *   inline sin nonce, ningún origen externo.
 * - Sin 'wasm-unsafe-eval': el WASM de Argon2id solo se compila dentro del Web
 *   Worker, que se sirve como archivo estático del propio origen.
 * - connect-src 'self': el navegador solo habla con nuestro servidor (nunca con
 *   Supabase ni con terceros). Sin analíticas ni fuentes externas.
 * - img-src sin orígenes externos: el Markdown no puede cargar píxeles de rastreo.
 *
 * En desarrollo se relajan dos cosas que exige el servidor de desarrollo de
 * Next.js: 'unsafe-eval' (trazas de error de React) y estilos inline/WebSocket
 * para la recarga en caliente. El build de producción no las incluye.
 *
 * No se añade `upgrade-insecure-requests` ni HSTS: la app se usa en
 * http://localhost, donde forzar HTTPS rompería las peticiones.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** Nonce de 128 bits en base64 (CSPRNG). */
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/** Cabeceras para todas las respuestas (se aplican en next.config.ts). */
export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // Redundante con frame-ancestors, para navegadores antiguos.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "serial=()",
      "bluetooth=()",
      "hid=()",
      "midi=()",
      "display-capture=()",
      "browsing-topics=()",
    ].join(", "),
  },
] as const;
