"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { changePassphrase, regenerateRecoveryKey, WrongSecretError, type KeyringRecord } from "@/lib/crypto";
import { updateKeyringAction } from "@/lib/dal/keyring-actions";
import type { StrengthResult } from "@/lib/passphrase/strength";
import { loadAttempts, NO_ATTEMPTS, registerFailure, remainingLockMs, saveAttempts } from "@/lib/vault/attempts";
import { AUTOLOCK_OPTIONS_MINUTES, formatRemaining } from "@/lib/vault/autolock";
import { getBrowserKdf } from "@/lib/vault/browser-kdf";
import { useVault } from "@/lib/vault/VaultProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PassphraseField } from "./PassphraseField";
import { RecoveryKeyCard } from "./RecoveryKeyCard";
import { RecoveryWordCheck } from "./RecoveryWordCheck";

const WRONG_PASSPHRASE = "La frase actual no es correcta.";
const CONFLICT = "El diario ha cambiado desde otra pestaña o dispositivo. Recarga la página e inténtalo de nuevo.";

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-surface p-6">
      <h2 id={id} className="font-serif text-xl">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Comprueba el límite de intentos compartido con el desbloqueo. Devuelve un error o null. */
function attemptsBlocked(): string | null {
  const wait = remainingLockMs(loadAttempts(), Date.now());
  return wait > 0 ? `Demasiados intentos. Espera ${formatRemaining(wait)}.` : null;
}

function recordWrongAttempt() {
  saveAttempts(registerFailure(loadAttempts(), Date.now()));
}

export function SecuritySettings({
  record,
  updatedAt,
  recoveryCreatedAt,
}: {
  record: KeyringRecord;
  updatedAt: string;
  recoveryCreatedAt: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <AutoLockSetting />
      <ChangePassphrase record={record} updatedAt={updatedAt} />
      <RegenerateRecovery record={record} updatedAt={updatedAt} recoveryCreatedAt={recoveryCreatedAt} />
    </div>
  );
}

function AutoLockSetting() {
  const { autoLockMinutes, setAutoLockMinutes } = useVault();
  const id = useId();
  return (
    <Section title="Bloqueo automático">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          Bloquear el diario tras este tiempo sin actividad
        </label>
        <select
          id={id}
          value={autoLockMinutes}
          onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
          className="min-h-11 w-full max-w-xs rounded-md border border-border-strong bg-surface px-3 text-base"
        >
          {AUTOLOCK_OPTIONS_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m === 1 ? "1 minuto" : `${m} minutos`}
            </option>
          ))}
        </select>
        <p className="text-sm text-text-muted">Se guarda solo en este navegador. Recargar la página también bloquea.</p>
      </div>
    </Section>
  );
}

function ChangePassphrase({ record, updatedAt }: { record: KeyringRecord; updatedAt: string }) {
  const router = useRouter();
  const { userId } = useVault();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [strength, setStrength] = useState<StrengthResult | null>(null);
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirmation?: string; form?: string }>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    const blocked = attemptsBlocked();
    const nextErrors: typeof errors = {};
    if (blocked) nextErrors.form = blocked;
    if (!current) nextErrors.current = "Escribe tu frase actual.";
    if (!strength?.ok) nextErrors.next = "La frase nueva no es lo bastante fuerte todavía.";
    if (next !== confirmation) nextErrors.confirmation = "Las frases no coinciden.";
    if (next && next === current) nextErrors.next = "La frase nueva debe ser distinta de la actual.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const updated = await changePassphrase(record, userId, { kind: "passphrase", passphrase: current }, next, {
        kdf: getBrowserKdf(),
      });
      saveAttempts(NO_ATTEMPTS);
      const result = await updateKeyringAction({ record: updated, expectedUpdatedAt: updatedAt });
      if (!result.ok) {
        setErrors({ form: result.reason === "conflict" ? CONFLICT : "No se ha podido guardar. Inténtalo de nuevo." });
        return;
      }
      setCurrent("");
      setNext("");
      setConfirmation("");
      setDone(true);
      router.refresh();
    } catch (e) {
      if (e instanceof WrongSecretError) {
        recordWrongAttempt();
        setErrors({ current: WRONG_PASSPHRASE });
      } else {
        setErrors({ form: "Ha ocurrido un error. Inténtalo de nuevo." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Cambiar la frase secreta">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <p className="text-sm text-text-muted">
          Tus entradas no se vuelven a cifrar: solo cambia la llave que protege la clave del diario. La clave de
          recuperación sigue sirviendo.
        </p>
        {done && <Alert tone="success">Frase secreta cambiada.</Alert>}
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <TextField
          label="Frase actual"
          name="currentPassphrase"
          type="password"
          autoComplete="off"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
        />
        <PassphraseField
          label="Frase nueva"
          name="newPassphrase"
          value={next}
          onChange={setNext}
          onAssessment={setStrength}
          error={errors.next}
        />
        <TextField
          label="Repite la frase nueva"
          name="newPassphraseConfirm"
          type="password"
          autoComplete="off"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={errors.confirmation}
        />
        <Button type="submit" pending={busy} pendingLabel="Cambiando…" className="self-start">
          Cambiar la frase
        </Button>
      </form>
    </Section>
  );
}

function RegenerateRecovery({
  record,
  updatedAt,
  recoveryCreatedAt,
}: {
  record: KeyringRecord;
  updatedAt: string;
  recoveryCreatedAt: string;
}) {
  const router = useRouter();
  const { userId } = useVault();
  const [step, setStep] = useState<"inicio" | "mostrar" | "verificar" | "hecho">("inicio");
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState<{ record: KeyringRecord; recoveryPhrase: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const created = new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(recoveryCreatedAt));

  async function generate(event: FormEvent) {
    event.preventDefault();
    const blocked = attemptsBlocked();
    if (blocked) return setError(blocked);
    setBusy(true);
    setError(null);
    try {
      setPending(
        await regenerateRecoveryKey(record, userId, { kind: "passphrase", passphrase }, { kdf: getBrowserKdf() }),
      );
      saveAttempts(NO_ATTEMPTS);
      setPassphrase("");
      setStep("mostrar");
    } catch (e) {
      if (e instanceof WrongSecretError) recordWrongAttempt();
      setError(e instanceof WrongSecretError ? WRONG_PASSPHRASE : "Ha ocurrido un error. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!pending) return;
    setBusy(true);
    const result = await updateKeyringAction({ record: pending.record, expectedUpdatedAt: updatedAt });
    setBusy(false);
    if (!result.ok) {
      setError(result.reason === "conflict" ? CONFLICT : "No se ha podido guardar. Inténtalo de nuevo.");
      return;
    }
    setPending(null);
    setStep("hecho");
    router.refresh();
  }

  return (
    <Section title="Clave de recuperación">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-text-muted">
          Tu clave actual se creó el {created}. Si crees que alguien la ha visto, genera una nueva: la anterior dejará
          de servir en cuanto confirmes que has guardado la nueva.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        {step === "hecho" && (
          <Alert tone="success">Clave de recuperación nueva guardada. La anterior ya no sirve.</Alert>
        )}
        {(step === "inicio" || step === "hecho") && (
          <form onSubmit={generate} className="flex flex-col gap-5" noValidate>
            <TextField
              label="Frase secreta"
              name="passphraseForRecovery"
              type="password"
              autoComplete="off"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              pending={busy}
              pendingLabel="Generando…"
              disabled={!passphrase}
              className="self-start"
            >
              Generar una clave nueva
            </Button>
          </form>
        )}
        {step === "mostrar" && pending && (
          <>
            <RecoveryKeyCard phrase={pending.recoveryPhrase} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStep("verificar")}>Ya la he guardado</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPending(null);
                  setStep("inicio");
                }}
              >
                Cancelar (se mantiene la anterior)
              </Button>
            </div>
          </>
        )}
        {step === "verificar" && pending && (
          <RecoveryWordCheck
            phrase={pending.recoveryPhrase}
            onConfirmed={save}
            onBack={() => setStep("mostrar")}
            pending={busy}
            submitLabel="Guardar la clave nueva"
          />
        )}
      </div>
    </Section>
  );
}
