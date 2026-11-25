import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Conexión al Supabase local para los tests de integración.
 * Usa las variables de entorno si existen; si no, las lee de `supabase status`.
 */
export interface LocalSupabase {
  url: string;
  publishableKey: string;
  secretKey: string;
}

function parseEnvOutput(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }
  return values;
}

export function getLocalSupabase(): LocalSupabase {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SECRET_KEY) {
    return { url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY, secretKey: SUPABASE_SECRET_KEY };
  }
  let output: string;
  try {
    output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("Supabase local no está en marcha. Ejecuta `npx supabase start`.");
  }
  const env = parseEnvOutput(output);
  const url = env.API_URL;
  const publishableKey = env.PUBLISHABLE_KEY ?? env.ANON_KEY;
  const secretKey = env.SECRET_KEY ?? env.SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error("No se han podido leer las claves de `supabase status -o env`.");
  }
  return { url, publishableKey, secretKey };
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function adminClient(env: LocalSupabase) {
  return createClient<Database>(env.url, env.secretKey, noSession);
}

export function anonClient(env: LocalSupabase) {
  return createClient<Database>(env.url, env.publishableKey, noSession);
}

/** Crea un usuario confirmado y devuelve un cliente con su sesión. */
export async function createSignedInUser(env: LocalSupabase, label: string) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const admin = adminClient(env);
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("createUser");
  const client = anonClient(env);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, email, client };
}
