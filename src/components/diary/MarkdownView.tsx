"use client";

import Markdown, { type Components } from "react-markdown";

/**
 * Markdown seguro para el texto descifrado.
 *
 * react-markdown construye elementos React (nunca usa dangerouslySetInnerHTML)
 * y, con `skipHtml`, descarta cualquier HTML escrito en la entrada. Además:
 * - lista blanca de elementos (sin imágenes, que cargarían recursos externos);
 * - solo enlaces http(s) y mailto; `javascript:` y similares se eliminan;
 * - los enlaces se abren en otra pestaña sin enviar Referer ni dar acceso a esta.
 */

const ALLOWED_ELEMENTS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "hr",
  "a",
];

export function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-accent underline underline-offset-4"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="prose-diario font-serif text-lg leading-relaxed text-text" data-testid="markdown">
      <Markdown
        skipHtml
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        urlTransform={safeUrl}
        components={components}
      >
        {source}
      </Markdown>
    </div>
  );
}
