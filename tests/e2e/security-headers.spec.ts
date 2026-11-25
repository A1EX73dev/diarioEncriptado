import { expect, test } from "./helpers/fixtures";
import { createConfirmedUser, signInWithUi } from "./helpers/users";

/** Cabeceras de seguridad y CSP del build de producción. */

function directive(csp: string, name: string): string[] {
  const found = csp
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .find(([n]) => n === name);
  return found ? found.slice(1) : [];
}

test("CSP estricta con nonce por petición y cabeceras de seguridad", async ({ request }) => {
  const first = await request.get("/login");
  const second = await request.get("/login");
  const csp = first.headers()["content-security-policy"]!;
  expect(csp).toBeTruthy();

  const scriptSrc = directive(csp, "script-src");
  const nonce = scriptSrc.find((v) => v.startsWith("'nonce-"));
  expect(nonce).toMatch(/^'nonce-[A-Za-z0-9+/=]{20,}'$/);
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  expect(scriptSrc).not.toContain("'wasm-unsafe-eval'");
  expect(directive(csp, "style-src")).not.toContain("'unsafe-inline'");
  expect(directive(csp, "connect-src")).toEqual(["'self'"]);
  expect(directive(csp, "object-src")).toEqual(["'none'"]);
  expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
  expect(directive(csp, "base-uri")).toEqual(["'none'"]);

  // Nonce distinto en cada petición.
  expect(second.headers()["content-security-policy"]).not.toContain(nonce!);

  // Todos los <script> del HTML llevan el nonce de la cabecera.
  const html = await first.text();
  const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scriptTags.length).toBeGreaterThan(0);
  const nonceValue = nonce!.slice("'nonce-".length, -1);
  for (const tag of scriptTags) expect(tag).toContain(`nonce="${nonceValue}"`);

  const headers = first.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("la CSP bloquea los manejadores inline de HTML inyectado", async ({ page, browserProblems }) => {
  await page.goto("/login");
  // Simula una inyección de HTML (el vector típico de XSS). Sin CSP, el onerror se ejecutaría.
  // (No se usa un <script> creado con page.evaluate: ese código viene de las
  // herramientas de desarrollo, que la CSP no restringe.)
  await page.evaluate(() => {
    const div = document.createElement("div");
    div.innerHTML = '<img src="/no-existe.png" onerror="window.__inyectado = true">';
    document.body.appendChild(div);
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __inyectado?: boolean }).__inyectado)).toBeUndefined();
  // Era una violación esperada: se vacía la lista para que la comprobación automática no falle.
  expect(browserProblems.some((p) => p.startsWith("CSP"))).toBe(true);
  browserProblems.length = 0;
});

test("las páginas privadas no se guardan en caché", async ({ page }) => {
  const user = await createConfirmedUser("cabeceras");
  await signInWithUi(page, user.email, user.password);
  const response = await page.request.get("/diario/configurar");
  expect(response.headers()["cache-control"]).toContain("no-store");
});
