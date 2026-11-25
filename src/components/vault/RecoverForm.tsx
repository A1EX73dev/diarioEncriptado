"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  changePassphrase,
  InvalidRecoveryPhraseError,
  unlockKeyring,
  WrongSecretError,
  type KeyringRecord,
} from "@/lib/crypto";
import { updateKeyringAction } from "@/lib/dal/keyring-actions";
import type { StrengthResult } from "@/lib/passphrase/strength";
import { getBrowserKdf } from "@/lib/vault/browser-kdf";
import { useVault } from "@/lib/vault/VaultProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";
import { PassphraseField } from "./PassphraseField";

/**
 * Recuperación: la clave de recuperación desenvuelve la DEK y se vuelve a
 * envolver con una frase nueva. Las entradas no se recifran. La clave de
 * recuperación sigue siendo válida (se puede regenerar en Ajustes).
 */
export function RecoverForm({ record, updatedAt }: { record: KeyringRecord; updatedAt: string }) {
  const router = useRouter();
  const { userId, unlock } = useVault();
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [strength, setStrength] = useState<StrengthResult | null>(null);
  const [errors, setErrors] = useState<{
    recovery?: string;
    passphrase?: string;
    confirmation?: string;
    form?: string;
  }>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, Object.keys(errors).length > 0 ? errors : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!recoveryPhrase.trim()) next.recovery = "Escribe las 24 palabras.";
    if (!strength?.ok) next.passphrase = "La frase nueva no es lo bastante fuerte todavía.";
    if (passphrase !== confirmation) next.confirmation = "Las frases no coinciden.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const kdf = getBrowserKdf();
    try {
      const secret = { kind: "recovery", recoveryPhrase } as const;
      const updated = await changePassphrase(record, userId, secret, passphrase, { kdf });
      const result = await updateKeyringAction({ record: updated, expectedUpdatedAt: updatedAt });
      if (!result.ok) {
        setErrors({
          form:
            result.reason === "conflict"
              ? "El diario ha cambiado desde otra pestaña o dispositivo. Recarga la página e inténtalo de nuevo."
              : "No se ha podido guardar. Inténtalo de nuevo.",
        });
        return;
      }
      unlock(await unlockKeyring(updated, userId, secret, { kdf }));
      setRecoveryPhrase("");
      router.replace("/diario?aviso=diario-recuperado");
      router.refresh();
    } catch (e) {
      if (e instanceof InvalidRecoveryPhraseError) {
        setErrors({
          recovery: "La clave no es válida: comprueba que estén las 24 palabras, en orden y bien escritas.",
        });
      } else if (e instanceof WrongSecretError) {
        setErrors({ form: "No se ha podido recuperar el diario con esa clave." });
      } else {
        setErrors({ form: "Ha ocurrido un error. Inténtalo de nuevo." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {errors.form && <Alert tone="error">{errors.form}</Alert>}
      <TextField
        label="Clave de recuperación (24 palabras)"
        name="recoveryPhrase"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={recoveryPhrase}
        onChange={(e) => setRecoveryPhrase(e.target.value)}
        hint="Sepáralas con espacios. No importan las mayúsculas."
        error={errors.recovery}
      />
      <PassphraseField
        label="Frase secreta nueva"
        name="newPassphrase"
        value={passphrase}
        onChange={setPassphrase}
        onAssessment={setStrength}
        error={errors.passphrase}
      />
      <TextField
        label="Repite la frase secreta nueva"
        name="newPassphraseConfirm"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        error={errors.confirmation}
      />
      <Button type="submit" pending={busy} pendingLabel="Recuperando…">
        Recuperar el diario
      </Button>
    </form>
  );
}
