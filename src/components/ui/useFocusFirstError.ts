"use client";

import { useEffect, type RefObject } from "react";

/**
 * Tras un envío con errores, lleva el foco al primer campo inválido (o, si el
 * error es general, al aviso). Así quien usa teclado o lector de pantalla
 * sabe qué ha fallado sin tener que buscarlo.
 *
 * `trigger` debe ser un valor nuevo en cada envío fallido (p. ej. el objeto de
 * estado o de errores) y `null` cuando no hay errores.
 */
export function useFocusFirstError(ref: RefObject<HTMLElement | null>, trigger: unknown) {
  useEffect(() => {
    if (!trigger) return;
    const root = ref.current;
    if (!root) return;
    const target =
      root.querySelector<HTMLElement>('[aria-invalid="true"]') ?? root.querySelector<HTMLElement>('[role="alert"]');
    target?.focus();
  }, [ref, trigger]);
}
