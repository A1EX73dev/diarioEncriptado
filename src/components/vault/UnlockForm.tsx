"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { unlockKeyring, WrongSecretError, type KeyringRecord } from "@/lib/crypto";
import {
  attemptsStore,
  FREE_ATTEMPTS,
  loadAttempts,
  NO_ATTEMPTS,
  registerFailure,
  remainingLockMs,
  saveAttempts,
} from "@/lib/vault/attempts";
import { formatRemaining } from "@/lib/vault/autolock";
import { getBrowserKdf } from "@/lib/vault/browser-kdf";
import { useVault } from "@/lib/vault/VaultProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

/** Segundo paso del acceso: la frase secreta descifra la DEK en este navegador. */
export function UnlockForm({ record }: { record: KeyringRecord }) {
  const { userId, unlock, lastLockReason } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempts = useSyncExternalStore(
    attemptsStore.subscribe,
    attemptsStore.getSnapshot,
    attemptsStore.getServerSnapshot,
  );
  const [now, setNow] = useState(() => Date.now());
  const [failure, setFailure] = useState<object | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, failure);

  const waitMs = remainingLockMs(attempts, now);
  useEffect(() => {
    if (waitMs <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waitMs]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (waitMs > 0 || !passphrase) return;
    setBusy(true);
    setError(null);
    try {
      const dek = await unlockKeyring(record, userId, { kind: "passphrase", passphrase }, { kdf: getBrowserKdf() });
      saveAttempts(NO_ATTEMPTS);
      setPassphrase("");
      unlock(dek);
    } catch (e) {
      if (e instanceof WrongSecretError) saveAttempts(registerFailure(loadAttempts(), Date.now()));
      setNow(Date.now());
      setFailure({});
      setError(
        e instanceof WrongSecretError
          ? "No se ha podido desbloquear el diario. Revisa la frase."
          : "Ha ocurrido un error al desbloquear. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  const remainingFree = FREE_ATTEMPTS - attempts.failures;

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {lastLockReason === "inactividad" && <Alert tone="info">El diario se ha bloqueado por inactividad.</Alert>}
      {lastLockReason === "otra-pestana" && <Alert tone="info">El diario se ha bloqueado desde otra pestaña.</Alert>}
      {waitMs > 0 && (
        <Alert tone="error">Demasiados intentos. Podrás volver a intentarlo en {formatRemaining(waitMs)}.</Alert>
      )}
      <TextField
        label="Frase secreta"
        name="passphrase"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        disabled={waitMs > 0}
        error={error ?? undefined}
        hint={
          attempts.failures > 0 && remainingFree > 0
            ? `Te quedan ${remainingFree} intentos antes de una espera.`
            : "Se descifra aquí, en tu navegador. La frase no se envía a ningún sitio."
        }
      />
      <Button type="submit" pending={busy} pendingLabel="Descifrando…" disabled={waitMs > 0 || !passphrase}>
        Desbloquear
      </Button>
      <Link
        href="/diario/recuperar"
        className="text-sm font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
      >
        He olvidado la frase: usar la clave de recuperación
      </Link>
    </form>
  );
}
