import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security/csp";

const nextConfig: NextConfig = {
  // Sin Cache Components ni prerenderizado parcial: todas las páginas dependen de
  // la sesión, y la CSP con nonce exige renderizado dinámico. La guía de CSP de
  // Next.js indica que el prerenderizado parcial es incompatible con nonces.
  cacheComponents: false,
  poweredByHeader: false,
  // El diario personal (scripts/diario.mjs) compila en otra carpeta para no chocar con los tests.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Sin mapas de código en el navegador en producción.
  productionBrowserSourceMaps: false,
  async headers() {
    // La CSP la pone el proxy (lleva un nonce por petición); el resto va en todas las respuestas.
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
