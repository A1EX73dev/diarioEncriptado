import { test as base, expect } from "@playwright/test";

/**
 * `test` con una comprobación automática en todas las páginas: si el navegador
 * informa de una violación de la CSP o de un error de JavaScript no capturado,
 * el test falla. Así se detecta cualquier script, estilo o conexión que la CSP
 * estricta bloquee en el build de producción.
 */
export const test = base.extend<{ browserProblems: string[] }>({
  browserProblems: [
    async ({ context }, use) => {
      const problems: string[] = [];
      const watch = (page: import("@playwright/test").Page) => {
        page.on("console", (message) => {
          const text = message.text();
          if (/Content.Security.Policy|Refused to (load|execute|connect|apply|create)/i.test(text)) {
            problems.push(`CSP: ${text}`);
          }
        });
        page.on("pageerror", (error) => problems.push(`Error JS: ${error.message}`));
      };
      context.pages().forEach(watch);
      context.on("page", watch);
      await use(problems);
      expect(problems, "El navegador no debe registrar violaciones de CSP ni errores").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
