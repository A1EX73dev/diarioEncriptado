#!/usr/bin/env node
/**
 * Genera .env.local a partir de `supabase status` (Supabase local en marcha).
 * Crea además un LOGIN_THROTTLE_SECRET aleatorio.
 *
 *   node scripts/write-env.mjs           # no sobrescribe un .env.local existente
 *   node scripts/write-env.mjs --force   # lo regenera
 *
 * No imprime ningún valor secreto.
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const target = ".env.local";
const force = process.argv.includes("--force");

if (existsSync(target) && !force) {
  console.log(`${target} ya existe; no se modifica (usa --force para regenerarlo).`);
  process.exit(0);
}

let output;
try {
  output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.error("Supabase local no está en marcha. Ejecuta primero: npx supabase start");
  process.exit(1);
}

const values = Object.fromEntries(
  output
    .split(/\r?\n/)
    .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);

const url = values.API_URL;
const publishable = values.PUBLISHABLE_KEY ?? values.ANON_KEY;
const secret = values.SECRET_KEY ?? values.SERVICE_ROLE_KEY;
if (!url || !publishable || !secret) {
  console.error("No se han podido leer las claves de `supabase status -o env`.");
  process.exit(1);
}

writeFileSync(
  target,
  [
    "# Generado por scripts/write-env.mjs para Supabase LOCAL. No subir a git.",
    `SUPABASE_URL=${url}`,
    `SUPABASE_PUBLISHABLE_KEY=${publishable}`,
    `SUPABASE_SECRET_KEY=${secret}`,
    `LOGIN_THROTTLE_SECRET=${randomBytes(32).toString("base64url")}`,
    "APP_URL=http://localhost:3000",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(`${target} creado.`);
