import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import { adminClient, getLocalSupabase } from "../integration/local-supabase";
import {
  createConfirmedUser,
  expectLocked,
  expectUnlocked,
  setupDiary,
  signInWithUi,
  unlockWithUi,
} from "./helpers/users";

/**
 * Entradas: crear, leer, editar y borrar con el diario desbloqueado; nada
 * visible bloqueado; Markdown sin XSS; y ninguna fila de la base de datos ni
 * ninguna petición con texto en claro.
 */

const PHRASE = "tetera lunar brújula pimiento";
const TITLE = "Martes de lluvia y café";
const CANARY = "zanahoria-secreta-42";
const BODY = `Hoy ha llovido **todo el día**.\n\n- Leí un rato\n- Escribí esto\n\n> El secreto es ${CANARY}`;

const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

async function createEntry(
  page: Page,
  { title, body, mood, tags }: { title: string; body: string; mood?: string; tags?: string },
) {
  // Navegación interna: un page.goto recargaría la página y bloquearía el diario.
  await page.getByRole("link", { name: "Diario", exact: true }).click();
  await page.getByRole("link", { name: "Nueva entrada" }).click();
  await page.getByLabel("Título", { exact: true }).fill(title);
  if (mood) await page.getByRole("radio", { name: mood, exact: true }).check();
  if (tags) await page.getByLabel("Etiquetas", { exact: true }).fill(tags);
  await page.getByRole("textbox", { name: "Texto" }).fill(body);
  await page.getByRole("button", { name: "Guardar entrada" }).click();
  await page.waitForURL(/\/diario\/entrada\/[0-9a-f-]{36}\?aviso=guardada/);
  return page.url().match(/entrada\/([0-9a-f-]{36})/)![1]!;
}

async function storedRows(userId: string) {
  const admin = adminClient(getLocalSupabase());
  const [entries, keyrings] = await Promise.all([
    admin.from("entries").select("*").eq("user_id", userId),
    admin.from("keyrings").select("*").eq("user_id", userId),
  ]);
  return { entries: entries.data ?? [], keyrings: keyrings.data ?? [] };
}

test("ciclo completo de una entrada sin texto en claro fuera del navegador", async ({ page }) => {
  const user = await createConfirmedUser("entradas");
  const traffic: string[] = [];
  page.on("request", (r) => traffic.push(r.url(), r.postData() ?? ""));
  await signInWithUi(page, user.email, user.password);
  await setupDiary(page, PHRASE);

  let id = "";
  await test.step("crear una entrada con formato, ánimo y etiquetas", async () => {
    id = await createEntry(page, { title: TITLE, body: BODY, mood: "Bien", tags: "lluvia, Café, lluvia" });
    await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByTestId("markdown").locator("strong")).toHaveText("todo el día");
    await expect(page.getByTestId("markdown").locator("blockquote")).toContainText(CANARY);
    await expect(page.getByText("Ánimo: Bien")).toBeVisible();
    await expect(page.getByRole("list", { name: "Etiquetas" }).getByRole("listitem")).toHaveText(["lluvia", "Café"]);
  });

  await test.step("la lista muestra la entrada descifrada", async () => {
    await page.getByRole("link", { name: "← Todas las entradas" }).click();
    await expect(page.getByRole("heading", { level: 2, name: TITLE })).toBeVisible();
  });

  let firstIv = "";
  await test.step("la base de datos solo tiene texto cifrado", async () => {
    const { entries, keyrings } = await storedRows(user.id);
    expect(entries).toHaveLength(1);
    firstIv = entries[0]!.iv;
    expect((entries[0]!.ciphertext_bytes! - 16) % 512).toBe(0);
    const dump = JSON.stringify({ entries, keyrings });
    for (const secret of [TITLE, CANARY, "todo el día", "lluvia", "Café", PHRASE]) {
      expect(dump).not.toContain(secret);
      expect(dump).not.toContain(Buffer.from(secret).toString("base64url"));
      expect(dump).not.toContain(Buffer.from(secret).toString("base64"));
    }
  });

  await test.step("editar vuelve a cifrar con un IV nuevo", async () => {
    await page.getByRole("link", { name: new RegExp(TITLE) }).click();
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByRole("textbox", { name: "Texto" }).fill(`${BODY}\n\nAñadido: ${CANARY}-bis`);
    await page.getByRole("button", { name: "Guardar entrada" }).click();
    await expect(page.getByTestId("markdown")).toContainText(`Añadido: ${CANARY}-bis`);
    const { entries } = await storedRows(user.id);
    expect(entries[0]!.iv).not.toBe(firstIv);
    expect(JSON.stringify(entries)).not.toContain(CANARY);
  });

  await test.step("recargar bloquea: solo fechas y tinta ilegible", async () => {
    await page.goto("/diario");
    await expectLocked(page);
    await expect(page.getByText("1 entrada cifrada")).toBeVisible();
    await expect(page.getByTestId("ciphertext-preview")).toHaveCount(1);
    await expect(page.getByText(TITLE)).toHaveCount(0);
    expect(await page.content()).not.toContain(CANARY);
  });

  await test.step("bloqueado no se puede abrir la entrada ni crear otra", async () => {
    await page.goto(`/diario/entrada/${id}`);
    await expect(page.getByRole("heading", { name: "El diario está bloqueado" })).toBeVisible();
    expect(await page.content()).not.toContain(TITLE);
    await page.goto("/diario/entrada/nueva");
    await expect(page.getByRole("heading", { name: "El diario está bloqueado" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar entrada" })).toHaveCount(0);
  });

  await test.step("desbloquear en la entrada la muestra", async () => {
    await page.goto(`/diario/entrada/${id}`);
    await unlockWithUi(page, PHRASE);
    await expectUnlocked(page);
    await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  });

  await test.step("borrar pide confirmación y elimina la fila", async () => {
    await page.getByRole("button", { name: "Borrar" }).click();
    const dialog = page.getByRole("dialog", { name: "¿Borrar esta entrada?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Borrar" }).click();
    await dialog.getByRole("button", { name: "Borrar definitivamente" }).click();
    await page.waitForURL(/aviso=entrada-borrada/);
    expect((await storedRows(user.id)).entries).toHaveLength(0);
  });

  await test.step("ninguna petición llevó el texto en claro", async () => {
    const all = traffic.join("\n");
    for (const secret of [TITLE, CANARY, PHRASE]) {
      expect(all).not.toContain(secret);
      expect(all).not.toContain(encodeURIComponent(secret));
    }
  });
});

test("el Markdown de una entrada no ejecuta código (XSS)", async ({ page }) => {
  const user = await createConfirmedUser("xss");
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await signInWithUi(page, user.email, user.password);
  await setupDiary(page, PHRASE);

  const body = [
    "<script>window.__xss = 1</script>",
    '<img src=x onerror="window.__xss = 2">',
    "[pulsa aquí](javascript:window.__xss=3)",
    '<a href="javascript:alert(4)">otro</a>',
    "![píxel](https://evil.example/p.png)",
    "**texto normal**",
  ].join("\n\n");
  await createEntry(page, { title: '<img src=x onerror="window.__xss=5">', body });

  const markdown = page.getByTestId("markdown");
  await expect(markdown.locator("strong")).toHaveText("texto normal");
  await expect(markdown.locator("script, img, iframe")).toHaveCount(0);
  await expect(markdown.locator("a")).toHaveCount(0);
  await expect(markdown.getByText("pulsa aquí")).toBeVisible();
  await page.getByText("pulsa aquí").click();
  // El título con HTML se muestra como texto literal.
  await expect(page.getByRole("heading", { level: 1 })).toContainText('<img src=x onerror="window.__xss=5">');
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(dialogs).toEqual([]);
});

test("editar la misma entrada en dos pestañas no pisa cambios", async ({ page, context }) => {
  const user = await createConfirmedUser("conflicto");
  await signInWithUi(page, user.email, user.password);
  await setupDiary(page, PHRASE);
  const id = await createEntry(page, { title: "Original", body: "v1" });

  const other = await context.newPage();
  await other.goto(`/diario/entrada/${id}`);
  await unlockWithUi(other, PHRASE);
  await expectUnlocked(other);

  await page.getByRole("button", { name: "Editar" }).click();
  await other.getByRole("button", { name: "Editar" }).click();

  await other.getByRole("textbox", { name: "Texto" }).fill("cambio de la otra pestaña");
  await other.getByRole("button", { name: "Guardar entrada" }).click();
  await expect(other.getByTestId("markdown")).toContainText("cambio de la otra pestaña");

  await page.getByRole("textbox", { name: "Texto" }).fill("cambio de esta pestaña");
  await page.getByRole("button", { name: "Guardar entrada" }).click();
  await expect(alertOf(page)).toContainText("Esta entrada ha cambiado en otra pestaña");
  await other.close();
});
