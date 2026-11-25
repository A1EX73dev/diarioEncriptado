"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Enlace de navegación que marca la sección actual (aria-current) además de con estilo. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-text hover:bg-surface-sunken aria-[current=page]:font-medium aria-[current=page]:underline aria-[current=page]:underline-offset-4"
    >
      {children}
    </Link>
  );
}
