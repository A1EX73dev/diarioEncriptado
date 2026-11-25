"use client";

import { formatRemaining } from "@/lib/vault/autolock";
import { useVault } from "@/lib/vault/VaultProvider";
import { LockIcon, UnlockIcon } from "@/components/ui/icons";

/**
 * Indicador siempre visible del estado del diario. El estado se expresa con
 * icono y texto (no solo color). Los lectores de pantalla reciben avisos al
 * bloquear/desbloquear y cuando queda un minuto, no cada segundo.
 */
export function VaultStatus() {
  const { isUnlocked, remainingMs, lock, lastLockReason } = useVault();
  const warnSoon = remainingMs !== null && remainingMs <= 60_000;
  // El texto solo cambia en las transiciones, así que la región aria-live no anuncia cada segundo.
  const announcement = isUnlocked
    ? warnSoon
      ? "El diario se bloqueará en menos de un minuto."
      : "Diario desbloqueado."
    : lastLockReason === "inactividad"
      ? "Diario bloqueado por inactividad."
      : lastLockReason
        ? "Diario bloqueado."
        : "";

  return (
    <div className="flex items-center gap-1">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {isUnlocked ? (
        <>
          <span
            className={`inline-flex min-h-11 items-center gap-1.5 px-2 text-sm ${warnSoon ? "text-danger" : "text-text"}`}
            data-testid="vault-status"
            data-state="unlocked"
          >
            <UnlockIcon className="text-accent" />
            <span>Desbloqueado</span>
            {remainingMs !== null && (
              <span className="font-mono text-xs text-text-muted" title="Tiempo hasta el bloqueo automático">
                <span className="sr-only">, se bloquea en </span>
                <span aria-hidden="true">· </span>
                {formatRemaining(remainingMs)}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => lock("manual")}
            className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 text-sm hover:bg-surface-sunken"
          >
            Bloquear
          </button>
        </>
      ) : (
        <span
          className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-text-muted"
          data-testid="vault-status"
          data-state="locked"
        >
          <LockIcon />
          <span>Bloqueado</span>
        </span>
      )}
    </div>
  );
}
