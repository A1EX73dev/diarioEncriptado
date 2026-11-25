import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import {
  createConfirmedUser,
  expectLocked,
  expectUnlocked,
  fillNewPassphrase,
  fillWordCheck,
  readKeyringRow,
  setupDiary,
  signInWithUi,
  unlockWithUi,
  vaultStatus,
} from "./helpers/users";

/**
 * Configuración del diario, bloqueo/desbloqueo, recuperación y gestión de claves
 * en un navegador real (Web Worker + WASM de Argon2id + Web Crypto).
 */

const PHRASE = "tetera lunar brújula pimiento";
const PHRASE_2 = "farola dormida sobre el tejado verde";
const PHRASE_3 = "cometa naranja en la bodega de invierno";

const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** Registra el cuerpo de todas las peticiones al servidor para comprobar que no viajan secretos. */
function recordRequestBodies(page: Page): string[] {
  const bodies: string[] = [];
  page.on("request", (request) => {
    const body = request.postData();
    if (body) bodies.push(body);
    bodies.push(request.url());
  });
  return bodies;
}

/** Todo lo que el navegador guarda de forma persistente para este sitio. */
async function persistentBrowserState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const dump = (s: Storage) => JSON.stringify(Object.entries(s));
    const databases = indexedDB.databases ? await indexedDB.databases() : [];
    return [dump(localStorage), dump(sessionStorage), document.cookie, JSON.stringify(databases)].join("\n");
  });
}

test("configuración inicial, bloqueo, desbloqueo y recarga", async ({ page, context }) => {
  const user = await createConfirmedUser("setup");
  const requests = recordRequestBodies(page);
  await signInWithUi(page, user.email, user.password);

  await test.step("sin diario configurado, se pide configurarlo", async () => {
    await expect(page).toHaveURL(/\/diario\/configurar/);
    await expect(vaultStatus(page)).toHaveAttribute("data-state", "locked");
  });

  await test.step("una frase débil no se acepta", async () => {
    await page.getByLabel("Frase secreta", { exact: true }).fill("contraseña123");
    await expect(page.getByText(/necesitas al menos «Fuerte»/)).toBeVisible();
    await page.getByLabel("Repite la frase secreta", { exact: true }).fill("contraseña123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("La frase no es lo bastante fuerte todavía.")).toBeVisible();
    await page.getByRole("checkbox").uncheck();
  });

  let words: string[] = [];
  await test.step("frase fuerte + aceptación de la pérdida irrecuperable", async () => {
    await fillNewPassphrase(page, "Frase secreta", "Repite la frase secreta", PHRASE);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Debes confirmar que entiendes")).toBeVisible();
    await page.getByRole("checkbox").check();
    const started = Date.now();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByTestId("recovery-words")).toBeVisible({ timeout: 20_000 });
    test.info().annotations.push({ type: "Argon2id (crear diario)", description: `${Date.now() - started} ms` });
    words = (await page.getByTestId("recovery-words").locator("li span:not([aria-hidden])").allTextContents()).map(
      (w) => w.trim(),
    );
    expect(words).toHaveLength(24);
  });

  await test.step("hasta confirmar la clave no se guarda nada en el servidor", async () => {
    expect(await readKeyringRow(user.id)).toBeNull();
  });

  await test.step("la comprobación de palabras detecta errores", async () => {
    await page.getByRole("button", { name: "Ya la he guardado" }).click();
    await fillWordCheck(page, words, true);
    await page.getByRole("button", { name: "Crear el diario" }).click();
    await expect(alertOf(page)).toContainText("Alguna palabra no coincide");
    await fillWordCheck(page, words);
    await page.getByRole("button", { name: "Crear el diario" }).click();
    await page.waitForURL(/\/diario\?aviso=diario-creado/);
    await expectUnlocked(page);
  });

  await test.step("el servidor solo tiene material cifrado", async () => {
    const row = await readKeyringRow(user.id);
    expect(row?.kdf_memory_kib).toBe(65536);
    expect(row?.kdf_iterations).toBe(3);
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(PHRASE);
    for (const word of words) expect(stored).not.toMatch(new RegExp(`\\b${word}\\b`));
  });

  await test.step("bloqueo manual", async () => {
    await page.getByRole("button", { name: "Bloquear" }).click();
    await expectLocked(page);
    await expect(page.getByRole("heading", { name: "Desbloquear el diario" })).toBeVisible();
  });

  await test.step("frase incorrecta: error genérico", async () => {
    await unlockWithUi(page, "no es la frase correcta");
    await expect(page.getByText("No se ha podido desbloquear el diario. Revisa la frase.")).toBeVisible({
      timeout: 20_000,
    });
    await expectLocked(page);
  });

  await test.step("frase correcta desbloquea", async () => {
    const started = Date.now();
    await unlockWithUi(page, PHRASE);
    await expectUnlocked(page);
    test.info().annotations.push({ type: "Argon2id (desbloquear)", description: `${Date.now() - started} ms` });
  });

  await test.step("navegar dentro de la app mantiene el desbloqueo", async () => {
    await page.getByRole("link", { name: "Ajustes" }).click();
    await expect(page.getByRole("heading", { name: "Ajustes de seguridad" })).toBeVisible();
    await expectUnlocked(page);
  });

  await test.step("recargar bloquea", async () => {
    await page.reload();
    await expectLocked(page);
  });

  await test.step("ni el navegador ni el servidor reciben la frase o la clave", async () => {
    const state = await persistentBrowserState(page);
    const cookies = JSON.stringify(await context.cookies());
    const traffic = requests.join("\n");
    for (const haystack of [state, cookies, traffic]) {
      expect(haystack).not.toContain(PHRASE);
      expect(haystack).not.toContain(words.slice(0, 4).join(" "));
    }
  });
});

test("límite de intentos, bloqueo por inactividad y entre pestañas", async ({ page, context }) => {
  await page.clock.install();
  const user = await createConfirmedUser("bloqueo");
  await signInWithUi(page, user.email, user.password);
  await setupDiary(page, PHRASE);

  await test.step("bloqueo automático tras 1 minuto sin actividad", async () => {
    await page.goto("/ajustes");
    await unlockAfterNavigation(page);
    await page.getByLabel("Bloquear el diario tras este tiempo sin actividad").selectOption("1");
    await expect(vaultStatus(page)).toContainText(/0:5\d|1:00/);
    await page.clock.fastForward(61_000);
    await expectLocked(page);
  });

  await test.step("bloquear en una pestaña bloquea las demás", async () => {
    await page.goto("/diario");
    await unlockWithUi(page, PHRASE);
    await expectUnlocked(page);
    const other = await context.newPage();
    await other.goto("/diario");
    await unlockWithUi(other, PHRASE);
    await expectUnlocked(other);
    await other.getByRole("button", { name: "Bloquear" }).click();
    await expectLocked(page);
    await expect(page.getByText("El diario se ha bloqueado desde otra pestaña.")).toBeVisible();
    await other.close();
  });

  await test.step("tras 5 frases incorrectas hay que esperar", async () => {
    for (let i = 1; i <= 5; i++) {
      await unlockWithUi(page, `frase incorrecta número ${i}`);
      await expect(page.getByRole("button", { name: "Desbloquear" })).toHaveText("Desbloquear", { timeout: 20_000 });
    }
    await expect(alertOf(page).filter({ hasText: "Demasiados intentos" })).toBeVisible();
    await expect(page.getByLabel("Frase secreta", { exact: true })).toBeDisabled();
    // Recargar no salta la espera.
    await page.reload();
    await expect(page.getByLabel("Frase secreta", { exact: true })).toBeDisabled();
    await page.clock.fastForward(31_000);
    await expect(page.getByLabel("Frase secreta", { exact: true })).toBeEnabled();
    await unlockWithUi(page, PHRASE);
    await expectUnlocked(page);
  });
});

/** /ajustes no tiene formulario de desbloqueo: se desbloquea en /diario y se vuelve por navegación interna. */
async function unlockAfterNavigation(page: Page) {
  await page.goto("/diario");
  await unlockWithUi(page, PHRASE);
  await expectUnlocked(page);
  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page.getByRole("heading", { name: "Ajustes de seguridad" })).toBeVisible();
}

test("cambiar la frase, regenerar la clave y recuperar el diario", async ({ page }) => {
  const user = await createConfirmedUser("claves");
  const requests = recordRequestBodies(page);
  await signInWithUi(page, user.email, user.password);
  const firstWords = await setupDiary(page, PHRASE);

  await test.step("cambiar la frase", async () => {
    await page.getByRole("link", { name: "Ajustes" }).click();
    await page.getByLabel("Frase actual", { exact: true }).fill("frase actual equivocada");
    await fillNewPassphrase(page, "Frase nueva", "Repite la frase nueva", PHRASE_2);
    await page.getByRole("button", { name: "Cambiar la frase" }).click();
    await expect(page.getByText("La frase actual no es correcta.")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Frase actual", { exact: true }).fill(PHRASE);
    await page.getByRole("button", { name: "Cambiar la frase" }).click();
    await expect(page.getByText("Frase secreta cambiada.")).toBeVisible({ timeout: 20_000 });
  });

  await test.step("la frase antigua deja de servir y la nueva sí", async () => {
    await page.goto("/diario");
    await unlockWithUi(page, PHRASE);
    await expect(page.getByText("No se ha podido desbloquear el diario. Revisa la frase.")).toBeVisible({
      timeout: 20_000,
    });
    await unlockWithUi(page, PHRASE_2);
    await expectUnlocked(page);
  });

  let newWords: string[] = [];
  await test.step("regenerar la clave de recuperación", async () => {
    await page.getByRole("link", { name: "Ajustes" }).click();
    await page.getByLabel("Frase secreta", { exact: true }).fill(PHRASE_2);
    await page.getByRole("button", { name: "Generar una clave nueva" }).click();
    await expect(page.getByTestId("recovery-words")).toBeVisible({ timeout: 20_000 });
    newWords = (await page.getByTestId("recovery-words").locator("li span:not([aria-hidden])").allTextContents()).map(
      (w) => w.trim(),
    );
    expect(newWords.join(" ")).not.toBe(firstWords.join(" "));
    await page.getByRole("button", { name: "Ya la he guardado" }).click();
    await fillWordCheck(page, newWords);
    await page.getByRole("button", { name: "Guardar la clave nueva" }).click();
    await expect(page.getByText("Clave de recuperación nueva guardada.")).toBeVisible();
  });

  await test.step("la clave antigua ya no recupera el diario", async () => {
    await page.goto("/diario/recuperar");
    await page.getByLabel("Clave de recuperación (24 palabras)").fill(firstWords.join(" "));
    await fillNewPassphrase(page, "Frase secreta nueva", "Repite la frase secreta nueva", PHRASE_3);
    await page.getByRole("button", { name: "Recuperar el diario" }).click();
    await expect(alertOf(page)).toContainText("No se ha podido recuperar el diario con esa clave.", {
      timeout: 20_000,
    });
  });

  await test.step("una clave mal escrita se detecta por la suma de control", async () => {
    const typo = [...newWords];
    typo[5] = typo[5] === "abandon" ? "ability" : "abandon";
    await page.getByLabel("Clave de recuperación (24 palabras)").fill(typo.join(" "));
    await page.getByRole("button", { name: "Recuperar el diario" }).click();
    await expect(page.getByText(/La clave no es válida/)).toBeVisible();
  });

  await test.step("la clave nueva recupera el diario con una frase nueva", async () => {
    await page.getByLabel("Clave de recuperación (24 palabras)").fill(newWords.join("  ").toUpperCase());
    await page.getByRole("button", { name: "Recuperar el diario" }).click();
    await page.waitForURL(/\/diario\?aviso=diario-recuperado/, { timeout: 20_000 });
    await expectUnlocked(page);
    await page.getByRole("button", { name: "Bloquear" }).click();
    await unlockWithUi(page, PHRASE_3);
    await expectUnlocked(page);
  });

  await test.step("ninguna petición ha llevado frases ni claves", async () => {
    const traffic = requests.join("\n");
    for (const secret of [
      PHRASE,
      PHRASE_2,
      PHRASE_3,
      firstWords.slice(0, 4).join(" "),
      newWords.slice(0, 4).join(" "),
    ]) {
      expect(traffic).not.toContain(secret);
      expect(traffic).not.toContain(encodeURIComponent(secret));
    }
  });
});
