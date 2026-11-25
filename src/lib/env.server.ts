import "server-only";
import { z } from "zod";

/**
 * Variables de entorno del servidor, validadas con zod.
 *
 * Ninguna lleva el prefijo NEXT_PUBLIC_: el navegador nunca habla con
 * Supabase, así que ni la URL ni las claves llegan al cliente. `server-only`
 * hace fallar el build si este módulo se importa desde un componente cliente.
 *
 * La validación es perezosa (en la primera llamada) para que `next build`
 * no exija secretos que solo se necesitan en tiempo de ejecución.
 */
const serverEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  /** Clave publicable (antes "anon"): actúa con la sesión del usuario y RLS. */
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  /** Clave secreta (antes "service_role"): salta RLS. Solo para borrar cuentas y el limitador. */
  SUPABASE_SECRET_KEY: z.string().min(20),
  /** Secreto para el HMAC de correos e IPs del limitador de login (≥ 32 caracteres aleatorios). */
  LOGIN_THROTTLE_SECRET: z.string().min(32),
  /** URL pública de la app, para los enlaces de los correos de Auth. */
  APP_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cached) {
    const result = serverEnvSchema.safeParse(process.env);
    if (!result.success) {
      const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
      // Solo los nombres, nunca los valores.
      throw new Error(`Variables de entorno no válidas o ausentes: ${names}. Revisa .env.local (ver .env.example).`);
    }
    cached = result.data;
  }
  return cached;
}
