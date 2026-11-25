import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import { waitForAuthLink } from "./helpers/mailpit";

/**
 * Flujo de autenticación completo contra Supabase local:
 * registro → confirmación por correo → logout → login → recuperación de contraseña,
 * más mensajes genéricos, cookies seguras, rutas protegidas y limitador de intentos.
 */

const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const PASSWORD = "contraseña de prueba larga 1";
const NEW_PASSWORD = "otra contraseña distinta 2";

async function fillSignUp(page: Page, email: string, password = PASSWORD) {
  await page.goto("/registro");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByLabel("Repite la contraseña", { exact: true }).fill(password);
  await submitAndWait(page, "Crear cuenta");
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await submitAndWait(page, "Iniciar sesión");
}

/** Pulsa el botón y espera la respuesta de la Server Action (evita comprobar el aviso del envío anterior). */
async function submitAndWait(page: Page, buttonName: string) {
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    page.getByRole("button", { name: buttonName }).click(),
  ]);
}

// Next.js añade su propio role="alert" (anunciador de rutas); se excluye.
const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const statusOf = (page: Page) => page.locator('[role="status"]');

const SIGNUP_OK = /Si la dirección es válida, te hemos enviado un enlace/;

test("registro, confirmación, sesión y recuperación de contraseña", async ({ page, context }) => {
  const email = uniqueEmail("ana");

  await test.step("registro con mensaje genérico", async () => {
    await fillSignUp(page, email);
    await expect(statusOf(page)).toContainText(SIGNUP_OK);
  });

  await test.step("sin confirmar el correo no se puede entrar", async () => {
    await page.goto("/login");
    await signIn(page, email, PASSWORD);
    await expect(alertOf(page)).toContainText("Confirma tu correo");
  });

  await test.step("el enlace del correo confirma la cuenta y abre sesión", async () => {
    await page.goto(await waitForAuthLink(email, "Confirma tu cuenta"));
    await expect(page).toHaveURL(/\/diario\/configurar\?aviso=cuenta-confirmada/);
    await expect(statusOf(page)).toContainText("Cuenta confirmada");
  });

  await test.step("las cookies de sesión son HttpOnly y SameSite=Lax", async () => {
    const authCookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
    expect(authCookies.length).toBeGreaterThan(0);
    for (const cookie of authCookies) {
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("Lax");
    }
    // Ningún script de la página puede leerlas.
    expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
  });

  await test.step("cerrar sesión protege el diario", async () => {
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login\?sesion=cerrada/);
    await page.goto("/diario");
    await expect(page).toHaveURL(/\/login\?next=%2Fdiario/);
  });

  await test.step("contraseña incorrecta: mensaje genérico", async () => {
    await signIn(page, email, "no es la contraseña");
    await expect(alertOf(page)).toHaveText(/Correo o contraseña incorrectos\./);
  });

  await test.step("login correcto vuelve a la página pedida", async () => {
    await signIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/diario(\/configurar)?$/);
  });

  await test.step("con sesión, /login lleva al diario", async () => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/diario(\/configurar)?$/);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
  });

  await test.step("recuperación de contraseña por correo", async () => {
    await page.goto("/recuperar-contrasena");
    await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(statusOf(page)).toContainText("Si hay una cuenta con ese correo");

    await page.goto(await waitForAuthLink(email, "Recupera el acceso"));
    await expect(page).toHaveURL(/\/nueva-contrasena$/);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Repite la contraseña nueva", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page).toHaveURL(/\/diario\/configurar\?aviso=contrasena-actualizada/);
  });

  await test.step("la contraseña antigua deja de funcionar y la nueva sí", async () => {
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await signIn(page, email, PASSWORD);
    await expect(alertOf(page)).toHaveText(/Correo o contraseña incorrectos\./);
    await signIn(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/diario(\/configurar)?$/);
  });
});

test("registrar un correo ya existente no lo revela", async ({ page }) => {
  const email = uniqueEmail("bea");
  await fillSignUp(page, email);
  await expect(statusOf(page)).toContainText(SIGNUP_OK);
  await fillSignUp(page, email);
  await expect(statusOf(page)).toContainText(SIGNUP_OK);
});

test("el limitador frena la fuerza bruta, exista o no la cuenta", async ({ page }) => {
  const email = uniqueEmail("nadie");
  await page.goto("/login");
  for (let attempt = 1; attempt <= 5; attempt++) {
    await signIn(page, email, `intento ${attempt}`);
    await expect(alertOf(page)).toHaveText(/Correo o contraseña incorrectos\./);
  }
  await signIn(page, email, "intento 6");
  await expect(alertOf(page)).toContainText("Demasiados intentos");
});

test("los parámetros next externos no provocan redirecciones abiertas", async ({ page }) => {
  await page.goto("/login?next=//evil.example/robar");
  const nextValue = await page.locator('input[name="next"]').getAttribute("value");
  expect(nextValue).toBe("/diario");
  await page.goto("/auth/confirm?token_hash=falso-falso&type=email&next=https://evil.example");
  await expect(page).toHaveURL(/\/login\?error=enlace/);
  await expect(alertOf(page)).toContainText("El enlace no es válido");
});

test("la navegación funciona con teclado y el tema se puede cambiar", async ({ page }) => {
  await page.goto("/login");
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: /^Tema del sistema/ });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Enter");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
});
