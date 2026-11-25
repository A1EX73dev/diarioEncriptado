import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EntryEditor } from "@/components/diary/EntryEditor";
import { VaultGate } from "@/components/vault/VaultGate";
import { requireUser } from "@/lib/auth/session";
import { getKeyring } from "@/lib/dal/keyring";

export const metadata: Metadata = { title: "Nueva entrada" };

export default async function NewEntryPage() {
  const user = await requireUser();
  const keyring = await getKeyring(user.id);
  if (!keyring) redirect("/diario/configurar");

  return (
    <VaultGate record={keyring.record}>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-serif text-3xl">Nueva entrada</h1>
        <EntryEditor />
      </div>
    </VaultGate>
  );
}
