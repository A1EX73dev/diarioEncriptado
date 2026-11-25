import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RecoverForm } from "@/components/vault/RecoverForm";
import { requireUser } from "@/lib/auth/session";
import { getKeyring } from "@/lib/dal/keyring";

export const metadata: Metadata = { title: "Recuperar el diario" };

export default async function RecoverPage() {
  const user = await requireUser();
  const keyring = await getKeyring(user.id);
  if (!keyring) redirect("/diario/configurar");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-serif text-3xl">Recuperar el diario</h1>
      <p className="font-serif leading-relaxed text-text-muted">
        Con tu clave de recuperación puedes abrir el diario y elegir una frase secreta nueva. Sin la frase ni la clave,
        las entradas no se pueden recuperar: nadie más tiene una copia.
      </p>
      <RecoverForm record={keyring.record} updatedAt={keyring.updatedAt} />
      <Link href="/diario" className="text-sm font-medium text-accent underline underline-offset-4">
        Volver al diario
      </Link>
    </div>
  );
}
