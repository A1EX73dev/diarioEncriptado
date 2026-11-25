import { adminClient, getLocalSupabase } from "../integration/local-supabase";
import { expect, test } from "./helpers/fixtures";
import { createConfirmedUser, setupDiary, signInWithUi } from "./helpers/users";

const PHRASE = "tetera lunar brújula pimiento";

test("borrar la cuenta elimina la cuenta, el llavero y las entradas", async ({ page }) => {
  const user = await createConfirmedUser("borrar");
  await signInWithUi(page, user.email, user.password);
  await setupDiary(page, PHRASE);
  await page.getByRole("link", { name: "Nueva entrada" }).click();
  await page.getByLabel("Título", { exact: true }).fill("Algo que borrar");
  await page.getByRole("button", { name: "Guardar entrada" }).click();
  await page.waitForURL(/aviso=guardada/);

  const admin = adminClient(getLocalSupabase());
  const count = async (table: "entries" | "keyrings") =>
    (await admin.from(table).select("user_id").eq("user_id", user.id)).data?.length ?? 0;
  expect(await count("entries")).toBe(1);

  await page.getByRole("link", { name: "Ajustes" }).click();
  await page.getByRole("link", { name: "Cuenta" }).click();
  await expect(page.getByText(user.email)).toBeVisible();

  await test.step("exige escribir BORRAR y la contraseña correcta", async () => {
    await page.getByLabel("Contraseña de la cuenta", { exact: true }).fill(user.password);
    await page.getByLabel("Escribe BORRAR para confirmar").fill("borrar");
    await page.getByRole("button", { name: "Borrar mi cuenta y todo el diario" }).click();
    await expect(page.getByText("Escribe BORRAR en mayúsculas para confirmar.")).toBeVisible();

    await page.getByLabel("Contraseña de la cuenta", { exact: true }).fill("no es la contraseña");
    await page.getByLabel("Escribe BORRAR para confirmar").fill("BORRAR");
    await page.getByRole("button", { name: "Borrar mi cuenta y todo el diario" }).click();
    const password = page.getByLabel("Contraseña de la cuenta", { exact: true });
    await expect(page.getByText("La contraseña no es correcta.")).toBeVisible();
    await expect(password).toBeFocused();
    expect(await count("keyrings")).toBe(1);
  });

  await test.step("con todo correcto se borra y se cierra la sesión", async () => {
    await page.getByLabel("Contraseña de la cuenta", { exact: true }).fill(user.password);
    await page.getByLabel("Escribe BORRAR para confirmar").fill("BORRAR");
    await page.getByRole("button", { name: "Borrar mi cuenta y todo el diario" }).click();
    await page.waitForURL(/\/\?aviso=cuenta-borrada/);
    await expect(page.getByText("Tu cuenta y todo tu diario se han borrado.")).toBeVisible();
    expect(await count("entries")).toBe(0);
    expect(await count("keyrings")).toBe(0);
    const { data } = await admin.auth.admin.getUserById(user.id);
    expect(data.user).toBeNull();
  });

  await test.step("ya no se puede entrar", async () => {
    await page.goto("/diario");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Correo electrónico", { exact: true }).fill(user.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  });
});
