"use client";

import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "./ui/icons";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABELS: Record<Theme, string> = { system: "Tema del sistema", light: "Tema claro", dark: "Tema oscuro" };
const ICONS = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const;

/** Alterna sistema → claro → oscuro. Guarda la elección en una cookie (no contiene datos del diario). */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const Icon = ICONS[theme];

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-text-muted hover:bg-surface-sunken hover:text-text"
      aria-label={`${LABELS[theme]}. Cambiar a ${LABELS[NEXT[theme]].toLowerCase()}`}
    >
      <Icon />
      <span className="hidden sm:inline">{LABELS[theme]}</span>
    </button>
  );
}
