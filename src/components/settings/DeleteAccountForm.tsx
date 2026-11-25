"use client";

import { useActionState, useRef } from "react";
import { deleteAccountAction } from "@/lib/auth/account-actions";
import { initialFormState } from "@/lib/auth/schemas";
import { useVault } from "@/lib/vault/VaultProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccountAction, initialFormState);
  const { lock } = useVault();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, state.status === "error" ? state : null);

  return (
    <form ref={formRef} action={action} onSubmit={() => lock("sesion")} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <TextField
        label="Contraseña de la cuenta"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />
      <TextField
        label="Escribe BORRAR para confirmar"
        name="confirmation"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        error={state.fieldErrors?.confirmation}
      />
      <Button type="submit" variant="danger" pending={pending} pendingLabel="Borrando…" className="self-start">
        Borrar mi cuenta y todo el diario
      </Button>
    </form>
  );
}
