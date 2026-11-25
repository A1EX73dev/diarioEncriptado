import { expect, type Page } from "@playwright/test";
import { adminClient, getLocalSupabase } from "../../integration/local-supabase";

/** Usuario confirmado creado con la API de administración (más rápido que pasar por el correo). */
export async function createConfirmedUser(label: string) {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const password = `contraseña e2e ${crypto.randomUUID()}`;
  const admin = adminClient(getLocalSupabase());
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser");
  return { id: data.user.id, email, password };
}

export async function signInWithUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/diario/);
}

/** Lee la fila del llavero con la clave secreta (solo tests, Supabase local). */
export async function readKeyringRow(userId: string) {
  const admin = adminClient(getLocalSupabase());
  const { data } = await admin.from("keyrings").select("*").eq("user_id", userId).single();
  return data;
}

export const vaultStatus = (page: Page) => page.getByTestId("vault-status");

export async function expectUnlocked(page: Page) {
  await expect(vaultStatus(page)).toHaveAttribute("data-state", "unlocked", { timeout: 20_000 });
}

export async function expectLocked(page: Page) {
  await expect(vaultStatus(page)).toHaveAttribute("data-state", "locked");
}

/** Rellena la comprobación de 3 palabras leyendo qué posiciones pide. */
export async function fillWordCheck(page: Page, words: string[], corrupt = false) {
  const labels = await page.locator("label", { hasText: /^Palabra nº \d+$/ }).allTextContents();
  expect(labels).toHaveLength(3);
  for (const [i, label] of labels.entries()) {
    const position = Number(label.replace(/\D/g, "")) - 1;
    const value = corrupt && i === 0 ? "zzzz" : words[position]!;
    await page.getByLabel(label, { exact: true }).fill(value);
  }
}

/** Escribe una frase nueva y espera a que el medidor la dé por suficiente. */
export async function fillNewPassphrase(page: Page, label: string, repeatLabel: string, passphrase: string) {
  await page.getByLabel(label, { exact: true }).fill(passphrase);
  await expect(page.getByText(/· suficiente/)).toBeVisible();
  await page.getByLabel(repeatLabel, { exact: true }).fill(passphrase);
}

/** Configuración inicial completa desde /diario/configurar. Devuelve las 24 palabras. */
export async function setupDiary(page: Page, passphrase: string): Promise<string[]> {
  await page.waitForURL(/\/diario\/configurar/);
  await fillNewPassphrase(page, "Frase secreta", "Repite la frase secreta", passphrase);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByTestId("recovery-words")).toBeVisible({ timeout: 20_000 });
  const words = (await page.getByTestId("recovery-words").locator("li span:not([aria-hidden])").allTextContents()).map(
    (w) => w.trim(),
  );
  expect(words).toHaveLength(24);
  await page.getByRole("button", { name: "Ya la he guardado" }).click();
  await fillWordCheck(page, words);
  await page.getByRole("button", { name: "Crear el diario" }).click();
  await page.waitForURL(/\/diario\?aviso=diario-creado/);
  await expectUnlocked(page);
  return words;
}

export async function unlockWithUi(page: Page, passphrase: string) {
  await page.getByLabel("Frase secreta", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Desbloquear" }).click();
}
