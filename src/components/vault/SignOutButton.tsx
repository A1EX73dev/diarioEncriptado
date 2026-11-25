"use client";

import { signOutAction } from "@/lib/auth/actions";
import { useVault } from "@/lib/vault/VaultProvider";

/** Cierra sesión bloqueando antes el diario en esta y en las demás pestañas. */
export function SignOutButton() {
  const { lock } = useVault();
  return (
    <form action={signOutAction} onSubmit={() => lock("sesion")}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-text hover:bg-surface-sunken"
      >
        Cerrar sesión
      </button>
    </form>
  );
}
