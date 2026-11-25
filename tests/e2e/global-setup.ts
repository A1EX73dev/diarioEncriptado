import { execSync } from "node:child_process";

/**
 * Todos los tests salen de la misma IP local, así que tras varias ejecuciones
 * seguidas el umbral por IP del limitador bloquearía los logins. Se vacía la
 * tabla de fallos en la base de datos LOCAL antes de empezar.
 */
export default function globalSetup() {
  execSync('npx supabase db query "truncate private.login_failures" --local', { stdio: "ignore" });
}
