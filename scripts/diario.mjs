#!/usr/bin/env node
/**
 * Uso diario del diario en tu equipo, separado del entorno de desarrollo.
 *
 * Usa una SEGUNDA instancia de Supabase ("diario-personal", puertos 5532x) con
 * sus propios volúmenes de Docker. Los tests, la CI y `npm run db:reset` solo
 * tocan la instancia de desarrollo ("diarioEncriptado", puertos 5432x), así que
 * nunca pueden borrar ni ensuciar tu diario real.
 *
 *   npm run diario              arranca Supabase personal, aplica migraciones nuevas,
 *                               compila y sirve la app en http://localhost:3500
 *   npm run diario -- --sin-compilar   igual, reutilizando el último build
 *   npm run diario:parar        para Supabase personal (los datos se conservan)
 *   npm run diario:copia        copia de seguridad SQL en ./copias/
 *   npm run diario:restaurar -- copias/archivo.sql   restaura una copia (pide confirmación)
 *
 * La carpeta .diario-local/ (configuración generada y secretos locales) y
 * ./copias/ están en .gitignore.
 */
import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { join, resolve } from "node:path";

const WORKDIR = ".diario-local";
const PROJECT_ID = "diario-personal";
const APP_PORT = 3500;
const ENV_FILE = join(WORKDIR, ".env.diario");
const DIST_DIR = ".next-diario";
const BACKUP_DIR = "copias";

const run = (command, options = {}) => execSync(command, { stdio: "inherit", ...options });
const supabase = (args, options) => run(`npx supabase ${args} --workdir ${WORKDIR}`, options);

/** Genera la configuración de la instancia personal a partir de la de desarrollo. */
function syncConfig() {
  const config = readFileSync("supabase/config.jsonc", "utf8")
    .replace(/"project_id":\s*"[^"]*"/, `"project_id": "${PROJECT_ID}"`)
    .replace(/"(port|shadow_port)":\s*543(\d\d)/g, (_m, key, rest) => `"${key}": 553${rest}`)
    .replace(/"inspector_port":\s*\d+/, '"inspector_port": 8183')
    .replaceAll("localhost:3000", `localhost:${APP_PORT}`)
    .replaceAll("127.0.0.1:3000", `127.0.0.1:${APP_PORT}`);
  if (!config.includes(`"port": 55321`)) throw new Error("No se han podido cambiar los puertos de la configuración.");

  mkdirSync(join(WORKDIR, "supabase"), { recursive: true });
  writeFileSync(
    join(WORKDIR, "supabase", "config.jsonc"),
    `// GENERADO por scripts/diario.mjs a partir de supabase/config.jsonc. No editar.\n${config}`,
  );
  for (const folder of ["migrations", "templates"]) {
    rmSync(join(WORKDIR, "supabase", folder), { recursive: true, force: true });
    cpSync(join("supabase", folder), join(WORKDIR, "supabase", folder), { recursive: true });
  }
}

function readStatus() {
  const output = execSync(`npx supabase status -o env --workdir ${WORKDIR}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

/** Variables de la app personal. El secreto del limitador se conserva entre arranques. */
function appEnv() {
  const status = readStatus();
  const previous = existsSync(ENV_FILE)
    ? Object.fromEntries(
        readFileSync(ENV_FILE, "utf8")
          .split(/\r?\n/)
          .filter((l) => l.includes("="))
          .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
      )
    : {};
  const env = {
    SUPABASE_URL: status.API_URL,
    SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
    LOGIN_THROTTLE_SECRET: previous.LOGIN_THROTTLE_SECRET ?? randomBytes(32).toString("base64url"),
    APP_URL: `http://localhost:${APP_PORT}`,
  };
  if (!env.SUPABASE_URL?.includes(":55321")) {
    throw new Error("La instancia personal no responde en el puerto 55321; no se arranca la app.");
  }
  writeFileSync(
    ENV_FILE,
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  return env;
}

async function start() {
  syncConfig();
  console.log("\n▸ Arrancando Supabase personal (la primera vez tarda unos minutos)…");
  supabase("start");
  console.log("\n▸ Aplicando migraciones pendientes (sin borrar datos)…");
  supabase("migration up");
  // Las variables se pasan explícitamente: tienen prioridad sobre .env.local (que apunta a desarrollo).
  const env = { ...process.env, ...appEnv(), NEXT_DIST_DIR: DIST_DIR, NODE_ENV: "production" };
  if (!process.argv.includes("--sin-compilar")) {
    console.log("\n▸ Compilando la app…");
    run("npx next build", { env });
  }
  console.log(`\n▸ Diario en http://localhost:${APP_PORT}  (Ctrl+C para parar la app)`);
  console.log(`  Correos de confirmación: http://127.0.0.1:55324\n`);
  spawn("npx", ["next", "start", "-p", String(APP_PORT)], { env, stdio: "inherit", shell: true });
}

function stop() {
  syncConfig();
  // Sin --no-backup: los volúmenes con tus datos se conservan.
  supabase("stop");
}

function backup() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  // Ruta absoluta: la CLI resuelve -f respecto a --workdir.
  const file = resolve(BACKUP_DIR, `diario-${stamp}.sql`);
  // Solo datos de las cuentas y del diario (cifrado). Sin sesiones ni registros de auditoría.
  const exclude = [
    "auth.sessions",
    "auth.refresh_tokens",
    "auth.audit_log_entries",
    "auth.flow_state",
    "auth.one_time_tokens",
    "auth.mfa_challenges",
    "auth.schema_migrations",
  ].join(",");
  supabase(`db dump --data-only --schema auth,public -x ${exclude} -f ${file}`);
  console.log(`\nCopia guardada en ${file}.`);
  console.log(
    "Contiene tu correo y el hash de tu contraseña; las entradas siguen cifradas. Guárdala en un lugar seguro.",
  );
}

async function restore(file) {
  if (!file || !existsSync(file)) throw new Error("Indica el archivo: npm run diario:restaurar -- copias/archivo.sql");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Esto BORRA todos los datos actuales del diario personal y los sustituye por ${file}.\nEscribe RESTAURAR para continuar: `,
  );
  rl.close();
  if (answer.trim() !== "RESTAURAR") return console.log("Cancelado. No se ha cambiado nada.");
  syncConfig();
  supabase("db reset");
  run(`docker exec -i supabase_db_${PROJECT_ID} psql -v ON_ERROR_STOP=1 -U postgres -d postgres`, {
    input: readFileSync(file),
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log("\nCopia restaurada.");
}

const command = process.argv[2] ?? "iniciar";
try {
  if (command === "iniciar") await start();
  else if (command === "parar") stop();
  else if (command === "copia") backup();
  else if (command === "restaurar") await restore(process.argv[3]);
  else throw new Error(`Orden desconocida: ${command}`);
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
