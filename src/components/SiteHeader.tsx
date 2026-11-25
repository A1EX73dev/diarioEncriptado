import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { ThemeToggle } from "./ThemeToggle";
import { LockIcon } from "./ui/icons";

/**
 * Cabecera común.
 * - `status`: estado del diario (siempre visible, junto a la marca en móvil).
 * - `nav`: enlaces y acciones; en móvil pasan a una segunda fila.
 * - `homeHref`: en la zona privada la marca lleva al diario, no a la portada
 *   (salir de la zona privada bloquearía el diario).
 */
export async function SiteHeader({
  status,
  nav,
  homeHref = "/",
}: {
  status?: ReactNode;
  nav?: ReactNode;
  homeHref?: string;
}) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2">
        <Link href={homeHref} className="mr-auto flex min-h-11 items-center gap-2 font-serif text-lg text-text">
          <LockIcon className="text-accent" />
          Diario cifrado
        </Link>
        {status}
        <nav
          aria-label="Principal"
          className="order-last flex w-full flex-wrap items-center gap-1 border-t border-border pt-1 sm:order-none sm:w-auto sm:border-0 sm:pt-0"
        >
          {nav}
          <ThemeToggle initial={theme} />
        </nav>
      </div>
    </header>
  );
}
