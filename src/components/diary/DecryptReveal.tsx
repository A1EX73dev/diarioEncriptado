"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const CIPHER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DURATION_MS = 700;

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

/**
 * Animación sutil de "descifrado": los caracteres pasan de base64 a texto de
 * izquierda a derecha. Es solo decorativa (aria-hidden); los lectores de
 * pantalla leen el texto final. Con prefers-reduced-motion no se anima.
 */
export function DecryptReveal({ text, seed }: { text: string; seed: string }) {
  const reduced = usePrefersReducedMotion();
  const [progress, setProgress] = useState(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduced, text]);

  const shown = reduced || progress >= 1 ? 1 : progress;
  // Terminada la animación, solo queda el texto (una vez, sin duplicados en el DOM).
  if (shown >= 1) return <>{text}</>;
  const revealed = Math.floor(text.length * shown);
  const scrambled =
    text.slice(0, revealed) +
    [...text.slice(revealed)]
      .map((ch, i) =>
        ch === " "
          ? " "
          : CIPHER_ALPHABET[(seed.charCodeAt((i + revealed) % seed.length) + i) % CIPHER_ALPHABET.length],
      )
      .join("");

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="font-mono">
        {scrambled}
      </span>
    </>
  );
}
