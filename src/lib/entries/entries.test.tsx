import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownView, safeUrl } from "@/components/diary/MarkdownView";
import { encryptedEntrySchema } from "@/lib/crypto";
import { excerpt, parseTags, todayIso } from "./client";
import { saveEntryInputSchema } from "./types";

describe("Markdown seguro (XSS)", () => {
  // Solo el contenido renderizado, sin el <div> contenedor del componente.
  const render = (source: string) =>
    renderToStaticMarkup(<MarkdownView source={source} />)
      .replace(/^<div[^>]*>/, "")
      .replace(/<\/div>$/, "");

  it("renderiza el formato básico", () => {
    const html = render("## Hoy\n\n**negrita**, _cursiva_\n\n- uno\n- dos\n\n> cita");
    expect(html).toContain("<h2>Hoy</h2>");
    expect(html).toContain("<strong>negrita</strong>");
    expect(html).toContain("<em>cursiva</em>");
    expect(html).toContain("<li>uno</li>");
    expect(html).toContain("<blockquote>");
  });

  it.each([
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    '<iframe src="https://evil.example"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '<div onclick="alert(1)">x</div>',
    "<style>body{display:none}</style>",
  ])("descarta HTML crudo: %s", (source) => {
    const html = render(source);
    expect(html).not.toMatch(/<(script|img|iframe|style|div)\b/i);
    expect(html).not.toMatch(/on\w+=/i);
    expect(html).not.toContain("javascript:");
  });

  it.each([
    "[clic](javascript:alert(1))",
    "[clic](JaVaScRiPt:alert(1))",
    "[clic](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[clic](vbscript:msgbox(1))",
    "<javascript:alert(1)>",
  ])("elimina enlaces peligrosos: %s", (source) => {
    const html = render(source);
    // Como mucho queda el texto visible; nunca un enlace con ese destino.
    expect(html).not.toMatch(/href=/);
    expect(html).not.toContain("<a");
  });

  it("no muestra imágenes (cargarían recursos externos)", () => {
    const html = render("![rastreador](https://evil.example/pixel.png)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
  });

  it("los enlaces seguros se abren aparte, sin Referer ni acceso a esta página", () => {
    const html = render("[web](https://example.org/a?b=1)");
    expect(html).toContain('href="https://example.org/a?b=1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("safeUrl solo admite http, https y mailto", () => {
    expect(safeUrl("https://a.es")).toBe("https://a.es/");
    expect(safeUrl("mailto:a@b.es")).toBe("mailto:a@b.es");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("/ruta-relativa")).toBe("");
    expect(safeUrl("ftp://a.es")).toBe("");
  });
});

describe("utilidades de entradas", () => {
  it("parseTags limpia, quita repetidos y aplica límites", () => {
    expect(parseTags(" Viaje, familia,,  viaje ,  muy   largo ")).toEqual(["Viaje", "familia", "muy largo"]);
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(","))).toHaveLength(20);
    expect(parseTags("x".repeat(60))[0]).toHaveLength(40);
  });

  it("excerpt quita la sintaxis de Markdown y recorta", () => {
    expect(excerpt("## Hola\n\n**mundo** y [enlace](https://a.es)")).toBe("Hola mundo y enlace");
    expect(excerpt("a".repeat(300))).toHaveLength(181);
  });

  it("todayIso usa la fecha local", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("validación del servidor al guardar", () => {
  const encrypted = { formatVersion: 1, iv: "A".repeat(16), ciphertext: "A".repeat(704) };
  const valid = { id: crypto.randomUUID(), entryDate: "2026-11-25", encrypted };

  it("acepta una entrada bien formada", () => {
    expect(encryptedEntrySchema.safeParse(encrypted).success).toBe(true);
    expect(saveEntryInputSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["fecha imposible", { ...valid, entryDate: "2026-02-30" }],
    ["fecha fuera de rango", { ...valid, entryDate: "1800-01-01" }],
    ["id no UUID", { ...valid, id: "1; drop table entries" }],
    ["texto en claro añadido", { ...valid, title: "Querido diario" }],
    ["bloque no cifrado", { ...valid, encrypted: { ...encrypted, ciphertext: "Hola, diario" } }],
  ])("rechaza %s", (_name, input) => {
    expect(saveEntryInputSchema.safeParse(input).success).toBe(false);
  });
});
