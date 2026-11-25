import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import { createConfirmedUser, setupDiary, signInWithUi, unlockWithUi, expectUnlocked } from "./helpers/users";

/**
 * Búsqueda y calendario sobre entradas descifradas, y una copia exportada por
 * una usuaria que otra importa (recifrando con su propia clave).
 */

const PHRASE_A = "tetera lunar brújula pimiento";
const PHRASE_B = "farola dormida sobre el tejado verde";

const ENTRIES = [
  { date: "2026-11-25", title: "Café con Lucía", body: "Hablamos del viaje a Lisboa", tags: "amigos, viaje" },
  { date: "2026-11-20", title: "Examen de redes", body: "Nervios y un café frío", tags: "estudio" },
  { date: "2026-10-02", title: "Paseo de otoño", body: "Hojas secas en el parque", tags: "amigos" },
];

async function addEntry(page: Page, e: (typeof ENTRIES)[number]) {
  await page.getByRole("link", { name: "Diario", exact: true }).click();
  await page.getByRole("link", { name: "Nueva entrada" }).click();
  await page.getByLabel("Fecha", { exact: true }).fill(e.date);
  await page.getByLabel("Título", { exact: true }).fill(e.title);
  await page.getByLabel("Etiquetas", { exact: true }).fill(e.tags);
  await page.getByRole("textbox", { name: "Texto" }).fill(e.body);
  await page.getByRole("button", { name: "Guardar entrada" }).click();
  await page.waitForURL(/aviso=guardada/);
}

const listTitles = (page: Page) => page.getByRole("list", { name: "Entradas" }).getByRole("heading", { level: 2 });

test("buscar, filtrar, calendario, exportar e importar en otra cuenta", async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const a = await createConfirmedUser("export-a");
  const contextA = await browser.newContext({ baseURL: testInfo.project.use.baseURL, acceptDownloads: true });
  const page = await contextA.newPage();
  const traffic: string[] = [];
  page.on("request", (r) => traffic.push(r.url(), r.postData() ?? ""));
  await signInWithUi(page, a.email, a.password);
  await setupDiary(page, PHRASE_A);
  for (const e of ENTRIES) await addEntry(page, e);
  await page.getByRole("link", { name: "Diario", exact: true }).click();
  await expect(listTitles(page)).toHaveCount(3);

  await test.step("búsqueda sin tildes ni mayúsculas, en el navegador", async () => {
    const search = page.getByRole("searchbox", { name: "Buscar" });
    await search.fill("CAFE");
    await expect(listTitles(page)).toHaveText(["Café con Lucía", "Examen de redes"]);
    await expect(page.getByText("2 de 3 entradas")).toBeVisible();
    await search.fill("café lisboa");
    await expect(listTitles(page)).toHaveText(["Café con Lucía"]);
    await page.getByRole("button", { name: "Quitar filtros" }).click();
    await expect(listTitles(page)).toHaveCount(3);
  });

  await test.step("filtros por etiqueta y fechas", async () => {
    await page.getByLabel("Etiqueta", { exact: true }).selectOption("amigos");
    await expect(listTitles(page)).toHaveText(["Café con Lucía", "Paseo de otoño"]);
    await page.getByLabel("Desde", { exact: true }).fill("2026-11-01");
    await expect(listTitles(page)).toHaveText(["Café con Lucía"]);
    await page.getByRole("button", { name: "Quitar filtros" }).click();
  });

  await test.step("los términos de búsqueda nunca salen del navegador", async () => {
    const all = traffic.join("\n").toLowerCase();
    expect(all).not.toContain("lisboa");
    expect(all).not.toContain("café");
  });

  await test.step("calendario: el día con entradas lleva a la lista filtrada", async () => {
    await page.getByRole("button", { name: "Calendario" }).click();
    await expect(page.getByRole("heading", { name: /noviembre de 2026/i })).toBeVisible();
    await page.getByRole("button", { name: "20 de noviembre, 1 entrada" }).click();
    await expect(listTitles(page)).toHaveText(["Examen de redes"]);
    await page.getByRole("button", { name: "Calendario" }).click();
    await page.getByRole("button", { name: "Mes anterior" }).click();
    await expect(page.getByRole("heading", { name: /octubre de 2026/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "2 de octubre, 1 entrada" })).toBeVisible();
  });

  let encryptedPath = "";
  let decryptedPath = "";
  await test.step("exportar copia cifrada y descifrada", async () => {
    await page.getByRole("link", { name: "Ajustes" }).click();
    await page.getByRole("link", { name: "Exportar e importar" }).click();
    const [encrypted] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar copia cifrada" }).click(),
    ]);
    expect(encrypted.suggestedFilename()).toMatch(/^diario-\d{4}-\d{2}-\d{2}-cifrado\.json$/);
    encryptedPath = testInfo.outputPath("cifrado.json");
    await encrypted.saveAs(encryptedPath);
    const encryptedText = await readFile(encryptedPath, "utf8");
    expect(encryptedText).not.toContain("Lucía");
    expect(encryptedText).not.toContain(PHRASE_A);
    expect(JSON.parse(encryptedText).entries).toHaveLength(3);

    await expect(page.getByRole("button", { name: "Descargar JSON descifrado" })).toBeDisabled();
    await page.getByRole("checkbox").check();
    const [decrypted] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar JSON descifrado" }).click(),
    ]);
    decryptedPath = testInfo.outputPath("descifrado.json");
    await decrypted.saveAs(decryptedPath);
    expect(await readFile(decryptedPath, "utf8")).toContain("Café con Lucía");

    const [markdown] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar Markdown" }).click(),
    ]);
    const mdPath = testInfo.outputPath("diario.md");
    await markdown.saveAs(mdPath);
    expect(await readFile(mdPath, "utf8")).toContain("## Paseo de otoño");
  });
  await contextA.close();

  const b = await createConfirmedUser("export-b");
  const pageB = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage();
  await signInWithUi(pageB, b.email, b.password);
  await setupDiary(pageB, PHRASE_B);

  await test.step("importar la copia cifrada pide la frase de esa copia", async () => {
    await pageB.getByRole("link", { name: "Ajustes" }).click();
    await pageB.getByRole("link", { name: "Exportar e importar" }).click();
    await pageB.getByLabel("Archivo de copia (.json)").setInputFiles(encryptedPath);
    await pageB.getByRole("button", { name: "Revisar archivo" }).click();
    await pageB.getByLabel("Frase secreta de la copia", { exact: true }).fill(PHRASE_B);
    await pageB.getByRole("button", { name: "Abrir copia" }).click();
    await expect(pageB.getByText("la frase no corresponde a este archivo")).toBeVisible({ timeout: 20_000 });
    await pageB.getByLabel("Frase secreta de la copia", { exact: true }).fill(PHRASE_A);
    await pageB.getByRole("button", { name: "Abrir copia" }).click();
    await expect(pageB.getByText(/Se importarán\s*3\s*entradas/)).toBeVisible({ timeout: 20_000 });
    await pageB.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(pageB.getByText("3 entradas importadas.")).toBeVisible();
  });

  await test.step("las entradas importadas se leen con la clave de la nueva cuenta", async () => {
    await pageB.getByRole("link", { name: "Diario", exact: true }).click();
    await expect(listTitles(pageB)).toHaveText(["Café con Lucía", "Examen de redes", "Paseo de otoño"]);
    // Tras recargar, solo la frase de B las abre.
    await pageB.reload();
    await unlockWithUi(pageB, PHRASE_B);
    await expectUnlocked(pageB);
    await expect(listTitles(pageB)).toHaveCount(3);
  });

  await test.step("importar de nuevo (la copia descifrada) omite los duplicados", async () => {
    await pageB.getByRole("link", { name: "Ajustes" }).click();
    await pageB.getByRole("link", { name: "Exportar e importar" }).click();
    await pageB.getByLabel("Archivo de copia (.json)").setInputFiles(decryptedPath);
    await pageB.getByRole("button", { name: "Revisar archivo" }).click();
    await expect(pageB.getByText(/3 ya estaban en tu diario/)).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Importar", exact: true })).toBeDisabled();
  });

  await test.step("un archivo que no es una copia se rechaza", async () => {
    await pageB.getByRole("button", { name: "Cancelar" }).click();
    await pageB.getByLabel("Archivo de copia (.json)").setInputFiles({
      name: "otro.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"hola": "mundo"}'),
    });
    await pageB.getByRole("button", { name: "Revisar archivo" }).click();
    await expect(pageB.getByText("El archivo no es una copia válida del diario.")).toBeVisible();
  });
});
