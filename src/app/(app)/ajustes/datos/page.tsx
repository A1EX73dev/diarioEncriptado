import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DataSettings } from "@/components/settings/DataSettings";
import { VaultGate } from "@/components/vault/VaultGate";
import { requireUser } from "@/lib/auth/session";
import { listEntries } from "@/lib/dal/entries";
import { getKeyring } from "@/lib/dal/keyring";

export const metadata: Metadata = { title: "Exportar e importar" };

export default async function DataPage() {
  const user = await requireUser();
  const keyring = await getKeyring(user.id);
  if (!keyring) redirect("/diario/configurar");
  const rows = await listEntries(user.id);

  return (
    <>
      <h1 className="font-serif text-3xl">Exportar e importar</h1>
      <VaultGate record={keyring.record}>
        <DataSettings record={keyring.record} rows={rows} />
      </VaultGate>
    </>
  );
}
