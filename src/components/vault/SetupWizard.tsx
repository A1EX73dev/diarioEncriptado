"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { createKeyring, type CreatedKeyring } from "@/lib/crypto";
import { createKeyringAction } from "@/lib/dal/keyring-actions";
import type { StrengthResult } from "@/lib/passphrase/strength";
import { getBrowserKdf } from "@/lib/vault/browser-kdf";
import { useVault } from "@/lib/vault/VaultProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";
import { PassphraseField } from "./PassphraseField";
import { RecoveryKeyCard } from "./RecoveryKeyCard";
import { RecoveryWordCheck } from "./RecoveryWordCheck";

type Step = "frase" | "clave" | "verificar";

/**
 * Configuración inicial del diario, en el navegador:
 *   1. Elegir la frase secreta (con medidor de fortaleza) y aceptar que perderla
 *      junto con la clave de recuperación hace los datos irrecuperables.
 *   2. Generar DEK + clave de recuperación y mostrarla una sola vez.
 *   3. Comprobar 3 palabras; solo entonces se envía el llavero (cifrado) al servidor.
 * Si se abandona antes del paso 3 no se guarda nada.
 */
export function SetupWizard({ userEmail }: { userEmail: string | null }) {
  const router = useRouter();
  const { userId, unlock } = useVault();
  const [step, setStep] = useState<Step>("frase");
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [strength, setStrength] = useState<StrengthResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<{ passphrase?: string; confirmation?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedKeyring | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusFirstError(rootRef, Object.keys(errors).length > 0 ? errors : null);

  async function generate(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!strength?.ok) next.passphrase = "La frase no es lo bastante fuerte todavía.";
    if (passphrase !== confirmation) next.confirmation = "Las frases no coinciden.";
    if (!acknowledged) next.form = "Debes confirmar que entiendes que la pérdida es irrecuperable.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      setCreated(await createKeyring(userId, passphrase, { kdf: getBrowserKdf() }));
      setPassphrase("");
      setConfirmation("");
      setStep("clave");
    } catch {
      setErrors({ form: "No se han podido generar las claves. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!created) return;
    setBusy(true);
    const result = await createKeyringAction(created.record);
    if (result.ok) {
      unlock(created.dek);
      router.replace("/diario?aviso=diario-creado");
      router.refresh();
      return;
    }
    setBusy(false);
    setErrors({
      form:
        result.reason === "exists"
          ? "Este diario ya estaba configurado. Vuelve al diario para desbloquearlo."
          : "No se ha podido guardar. Inténtalo de nuevo.",
    });
  }

  return (
    <div ref={rootRef} className="mx-auto flex max-w-2xl flex-col gap-8">
      <header>
        <p className="text-sm text-text-muted">Paso {step === "frase" ? 1 : step === "clave" ? 2 : 3} de 3</p>
        <h1 className="mt-1 font-serif text-3xl">
          {step === "frase" && "Crea tu frase secreta"}
          {step === "clave" && "Guarda tu clave de recuperación"}
          {step === "verificar" && "Comprueba que la has guardado"}
        </h1>
      </header>

      {errors.form && <Alert tone="error">{errors.form}</Alert>}

      {step === "frase" && (
        <form onSubmit={generate} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-3 font-serif leading-relaxed text-text-muted">
            <p>
              La frase secreta cifra tu diario en este navegador. Es distinta de tu contraseña y{" "}
              <strong className="font-medium text-text">nunca sale de tu equipo</strong>: ni el servidor ni nadie puede
              recuperarla por ti.
            </p>
            <p>
              Es tu protección principal. Si alguien copiara la base de datos, solo podría intentar adivinarla probando
              combinaciones, y cada intento le obliga a gastar 64 MiB de memoria. Con una frase larga y poco común, eso
              es inviable; con una corta o conocida, no.
            </p>
          </div>
          <PassphraseField
            label="Frase secreta"
            name="passphrase"
            value={passphrase}
            onChange={setPassphrase}
            onAssessment={setStrength}
            userInputs={userEmail ? [userEmail, ...userEmail.split(/[@.]/)] : []}
            error={errors.passphrase}
          />
          <TextField
            label="Repite la frase secreta"
            name="passphraseConfirm"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            error={errors.confirmation}
          />
          <label className="flex items-start gap-3 rounded-md border border-border-strong bg-surface p-4 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              Entiendo que si pierdo <strong>la frase y la clave de recuperación</strong>, mis entradas serán
              irrecuperables. Nadie, ni siquiera el administrador del servidor, puede descifrarlas.
            </span>
          </label>
          <Button type="submit" pending={busy} pendingLabel="Generando claves… (unos segundos)">
            Continuar
          </Button>
        </form>
      )}

      {step === "clave" && created && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 font-serif leading-relaxed text-text-muted">
            <p>
              Estas 24 palabras abren tu diario si olvidas la frase.{" "}
              <strong className="text-text">Solo se muestran ahora.</strong> Anótalas a mano o descárgalas y guárdalas
              fuera de este equipo.
            </p>
            <p>
              Cualquiera que tenga estas palabras y acceso a tu cuenta puede leer tu diario: trátalas como una llave.
            </p>
          </div>
          <RecoveryKeyCard phrase={created.recoveryPhrase} />
          <Button onClick={() => setStep("verificar")}>Ya la he guardado</Button>
        </div>
      )}

      {step === "verificar" && created && (
        <RecoveryWordCheck
          phrase={created.recoveryPhrase}
          onConfirmed={save}
          onBack={() => setStep("clave")}
          pending={busy}
          submitLabel="Crear el diario"
        />
      )}
    </div>
  );
}
