import type { Metadata } from "next";
import Link from "next/link";
import { DeleteAccountForm } from "@/components/settings/DeleteAccountForm";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Cuenta" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <h1 className="font-serif text-3xl">Cuenta</h1>
      <section aria-labelledby="datos-cuenta" className="rounded-lg border border-border bg-surface p-6">
        <h2 id="datos-cuenta" className="font-serif text-xl">
          Tus datos
        </h2>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-text-muted">Correo</dt>
          <dd>{user.email}</dd>
        </dl>
        <p className="mt-4 text-sm text-text-muted">
          Para llevarte tu diario, usa{" "}
          <Link href="/ajustes/datos" className="text-accent underline underline-offset-4">
            Exportar e importar
          </Link>
          . Qué guarda el servidor y qué no está explicado en{" "}
          <Link href="/privacidad" className="text-accent underline underline-offset-4">
            Privacidad
          </Link>
          .
        </p>
      </section>
      <section aria-labelledby="borrar-cuenta" className="rounded-lg border border-danger bg-surface p-6">
        <h2 id="borrar-cuenta" className="font-serif text-xl">
          Borrar la cuenta
        </h2>
        <p className="mt-2 mb-5 text-sm text-text-muted">
          Se eliminan de inmediato tu cuenta, tu llavero y todas tus entradas. No se puede deshacer y nadie podrá
          recuperarlas. Si quieres conservar algo, exporta antes una copia.
        </p>
        <DeleteAccountForm />
      </section>
    </>
  );
}
