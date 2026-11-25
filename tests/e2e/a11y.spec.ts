import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import { createConfirmedUser, expectUnlocked, setupDiary, signInWithUi, unlockWithUi } from "./helpers/users";

/**
 * Accesibilidad automática con axe-core (reglas WCAG 2.0/2.1 A y AA, incluido
 * el contraste de color) en las pantallas principales, en modo claro y oscuro.
 * axe no sustituye a una revisión manual, pero detecta los fallos más comunes.
 */

const PHRASE = "tetera lunar brújula pimiento";

async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map(
    (v) => `${label} · ${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test(`sin infracciones de axe en modo ${scheme === "light" ? "claro" : "oscuro"}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });

    for (const path of ["/", "/login", "/registro", "/recuperar-contrasena", "/privacidad"]) {
      await page.goto(path);
      await expectNoViolations(page, path);
    }

    const user = await createConfirmedUser(`a11y-${scheme}`);
    await signInWithUi(page, user.email, user.password);
    // Espera a que termine la redirección /diario → /diario/configurar antes de analizar.
    await expect(page.getByRole("heading", { name: "Crea tu frase secreta" })).toBeVisible();
    await expect(page).toHaveTitle(/Configurar el diario/);
    await expectNoViolations(page, "configurar");
    await setupDiary(page, PHRASE);

    await page.getByRole("link", { name: "Nueva entrada" }).click();
    await page.getByLabel("Título", { exact: true }).fill("Una entrada");
    await page.getByRole("textbox", { name: "Texto" }).fill("Con **formato** y una lista:\n\n- uno\n- dos");
    await expectNoViolations(page, "editor");
    await page.getByRole("button", { name: "Guardar entrada" }).click();
    await page.waitForURL(/aviso=guardada/);
    await expectNoViolations(page, "lectura");

    await page.getByRole("link", { name: "Diario", exact: true }).click();
    await expect(page.getByRole("list", { name: "Entradas" })).toBeVisible();
    await expectNoViolations(page, "lista");
    await page.getByRole("button", { name: "Calendario" }).click();
    await expectNoViolations(page, "calendario");

    await page.getByRole("link", { name: "Ajustes" }).click();
    await expect(page.getByRole("heading", { name: "Ajustes de seguridad" })).toBeVisible();
    await expectNoViolations(page, "ajustes");
    await page.getByRole("link", { name: "Exportar e importar" }).click();
    await expect(page.getByRole("button", { name: "Descargar copia cifrada" })).toBeVisible();
    await expectNoViolations(page, "datos");
    await page.getByRole("link", { name: "Cuenta" }).click();
    await expect(page.getByRole("heading", { name: "Borrar la cuenta" })).toBeVisible();
    await expectNoViolations(page, "cuenta");

    await page.goto("/diario");
    await expect(page.getByRole("heading", { name: "Desbloquear el diario" })).toBeVisible();
    await expectNoViolations(page, "bloqueado");
    await page.goto("/diario/recuperar");
    await expectNoViolations(page, "recuperar");
  });
}

test("enlace para saltar al contenido y foco en el primer error", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#contenido")).toBeFocused();

  // Envío vacío: el foco va al primer campo con error, que anuncia su mensaje.
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  const email = page.getByLabel("Correo electrónico", { exact: true });
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(/Escribe tu correo/);
});

test("la frase incorrecta devuelve el foco al campo, con el error asociado", async ({ page }) => {
  const user = await createConfirmedUser("a11y-foco");
  await signInWithUi(page, user.email, user.password);
  await setupDiary(page, PHRASE);
  await page.getByRole("button", { name: "Bloquear" }).click();
  await unlockWithUi(page, "frase equivocada de prueba");
  const field = page.getByLabel("Frase secreta", { exact: true });
  await expect(field).toBeFocused({ timeout: 20_000 });
  await expect(field).toHaveAccessibleDescription(/No se ha podido desbloquear/);
  await field.fill(PHRASE);
  await page.keyboard.press("Enter");
  await expectUnlocked(page);
});
