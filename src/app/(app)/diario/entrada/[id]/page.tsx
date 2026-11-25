import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EntryView } from "@/components/diary/EntryView";
import { VaultGate } from "@/components/vault/VaultGate";
import { requireUser } from "@/lib/auth/session";
import { getEntry } from "@/lib/dal/entries";
import { getKeyring } from "@/lib/dal/keyring";
import { entryIdSchema } from "@/lib/entries/types";

// El título de la entrada está cifrado: la pestaña nunca lo muestra.
export const metadata: Metadata = { title: "Entrada" };

const NOTICES: Record<string, string> = { guardada: "Entrada cifrada y guardada." };

export default async function EntryPage({ params, searchParams }: PageProps<"/diario/entrada/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!entryIdSchema.safeParse(id).success) notFound();

  const keyring = await getKeyring(user.id);
  if (!keyring) redirect("/diario/configurar");
  const row = await getEntry(user.id, id);
  if (!row) notFound();

  const aviso = (await searchParams).aviso;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;

  return (
    <VaultGate record={keyring.record}>
      <EntryView key={row.updatedAt} row={row} notice={notice} />
    </VaultGate>
  );
}
