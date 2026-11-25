import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getServerEnv } from "@/lib/env.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Limitador de intentos de login (lado servidor). La lógica y los umbrales
 * viven en Postgres (migración login_throttle); aquí solo se calculan las
 * claves y se llama a las funciones con la clave secreta.
 *
 * Las claves son HMAC-SHA256 con un secreto del servidor: la base de datos no
 * guarda ni correos ni IPs, y sin el secreto no se pueden revertir por fuerza bruta.
 */

export interface ThrottleKeys {
  emailKey: string;
  ipKey: string;
}

function hmac(value: string): string {
  return createHmac("sha256", getServerEnv().LOGIN_THROTTLE_SECRET).update(value, "utf8").digest("hex");
}

/**
 * IP del cliente. En Vercel, `x-forwarded-for` la fija la plataforma y el
 * cliente no puede falsearla; detrás de otro proxy habría que revisarlo.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "desconocida";
}

export async function throttleKeysFor(email: string): Promise<ThrottleKeys> {
  const ip = await getClientIp();
  return { emailKey: `email:${hmac(`email|${email}`)}`, ipKey: `ip:${hmac(`ip|${ip}`)}` };
}

/** Segundos que hay que esperar antes de otro intento. Falla cerrado si la base de datos no responde. */
export async function loginRetryAfter(keys: ThrottleKeys): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().rpc("login_retry_after", {
    p_email_key: keys.emailKey,
    p_ip_key: keys.ipKey,
  });
  if (error || typeof data !== "number") return 60;
  return data;
}

export async function recordLoginFailure(keys: ThrottleKeys): Promise<void> {
  await createSupabaseAdminClient().rpc("login_record_failure", {
    p_email_key: keys.emailKey,
    p_ip_key: keys.ipKey,
  });
}

export async function clearLoginFailures(keys: ThrottleKeys): Promise<void> {
  await createSupabaseAdminClient().rpc("login_clear_failures", { p_email_key: keys.emailKey });
}
