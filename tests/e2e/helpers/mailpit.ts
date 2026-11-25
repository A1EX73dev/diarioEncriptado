/**
 * Lectura de correos del Mailpit de Supabase local (http://127.0.0.1:54324).
 * Solo para tests: en local los correos de Auth no salen a Internet.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

interface MailpitSearch {
  messages: { ID: string; Subject: string; Created: string }[];
}

/** Espera al último correo para `to` cuyo asunto contenga `subject` y devuelve el enlace a /auth/confirm. */
export async function waitForAuthLink(to: string, subject: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = (await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}" subject:"${subject}"`)}`,
    ).then((r) => r.json())) as MailpitSearch;
    const latest = search.messages?.[0];
    if (latest) {
      const message = (await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`).then((r) => r.json())) as {
        HTML: string;
      };
      const match = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(message.HTML);
      if (match?.[1]) {
        // Solo ruta y consulta: el correo apunta a la URL del sitio (puerto 3000) y
        // los tests navegan contra su propio servidor (baseURL).
        const url = new URL(match[1].replace(/&amp;/g, "&"));
        return `${url.pathname}${url.search}`;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No ha llegado el correo "${subject}" a ${to}`);
}

export async function countMessages(to: string): Promise<number> {
  const search = (await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) =>
    r.json(),
  )) as MailpitSearch;
  return search.messages?.length ?? 0;
}
