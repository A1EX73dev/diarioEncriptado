import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SecuritySettings } from "@/components/vault/SecuritySettings";
import { requireUser } from "@/lib/auth/session";
import { getKeyring } from "@/lib/dal/keyring";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const user = await requireUser();
  const keyring = await getKeyring(user.id);
  if (!keyring) redirect("/diario/configurar");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <h1 className="font-serif text-3xl">Ajustes de seguridad</h1>
      <SecuritySettings
        record={keyring.record}
        updatedAt={keyring.updatedAt}
        recoveryCreatedAt={keyring.recoveryCreatedAt}
      />
    </div>
  );
}
