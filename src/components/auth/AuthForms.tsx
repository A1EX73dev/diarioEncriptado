"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { requestPasswordResetAction, signInAction, signUpAction, updatePasswordAction } from "@/lib/auth/actions";
import { initialFormState, PASSWORD_MIN_LENGTH } from "@/lib/auth/schemas";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useFocusFirstError } from "@/components/ui/useFocusFirstError";

const linkClass = "font-medium text-accent underline underline-offset-4 hover:text-accent-hover";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, state.status === "error" ? state : null);
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <TextField
        label="Correo electrónico"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Button type="submit" pending={pending} pendingLabel="Entrando…">
        Iniciar sesión
      </Button>
      <p className="text-sm text-text-muted">
        <Link href="/recuperar-contrasena" className={linkClass}>
          He olvidado la contraseña
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, state.status === "error" ? state : null);
  if (state.status === "success") {
    return <Alert tone="success">{state.message}</Alert>;
  }
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <TextField
        label="Correo electrónico"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres. Sirve para entrar en la cuenta; la frase secreta del diario la crearás después y debe ser distinta.`}
        error={state.fieldErrors?.password}
      />
      <TextField
        label="Repite la contraseña"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.passwordConfirm}
      />
      <Button type="submit" pending={pending} pendingLabel="Creando la cuenta…">
        Crear cuenta
      </Button>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, state.status === "error" ? state : null);
  if (state.status === "success") {
    return <Alert tone="success">{state.message}</Alert>;
  }
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <TextField
        label="Correo electrónico"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Button type="submit" pending={pending} pendingLabel="Enviando…">
        Enviar enlace
      </Button>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, state.status === "error" ? state : null);
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <TextField
        label="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres.`}
        error={state.fieldErrors?.password}
      />
      <TextField
        label="Repite la contraseña nueva"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.passwordConfirm}
      />
      <Button type="submit" pending={pending} pendingLabel="Guardando…">
        Guardar contraseña
      </Button>
    </form>
  );
}
