"use client";

import type { ReactNode } from "react";
import type { KeyringRecord } from "@/lib/crypto";
import { useVault } from "@/lib/vault/VaultProvider";
import { UnlockForm } from "./UnlockForm";

/**
 * Muestra `children` solo con el diario desbloqueado. Bloqueado, no se puede
 * abrir ni escribir ninguna entrada: se pide la frase en su lugar. Al
 * bloquearse, `children` se desmonta y el texto descifrado se descarta.
 */
export function VaultGate({ record, children }: { record: KeyringRecord; children: ReactNode }) {
  const { isUnlocked } = useVault();
  if (isUnlocked) return <>{children}</>;
  return (
    <section aria-labelledby="gate-title" className="mx-auto max-w-md rounded-lg border border-border bg-surface p-6">
      <h1 id="gate-title" className="font-serif text-2xl">
        El diario está bloqueado
      </h1>
      <p className="mt-2 mb-5 text-sm text-text-muted">Desbloquéalo para leer o escribir entradas.</p>
      <UnlockForm record={record} />
    </section>
  );
}
