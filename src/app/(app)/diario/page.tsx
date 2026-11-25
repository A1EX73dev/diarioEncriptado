import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DiaryHome } from "@/components/diary/DiaryHome";
import { requireUser } from "@/lib/auth/session";
import { listEntries } from "@/lib/dal/entries";
import { getKeyring } from "@/lib/dal/keyring";

export const metadata: Metadata = { title: "Diario" };

const NOTICES: Record<string, string> = {
  "cuenta-confirmada": "Cuenta confirmada.",
  "contrasena-actualizada": "Contraseña de la cuenta actualizada.",
  "diario-creado": "Diario creado y desbloqueado.",
  "diario-recuperado": "Diario recuperado. Ya puedes usar tu nueva frase secreta.",
  "entrada-borrada": "Entrada borrada.",
};

export default async function DiaryPage({ searchParams }: PageProps<"/diario">) {
  const user = await requireUser();
  const aviso = (await searchParams).aviso;
  const keyring = await getKeyring(user.id);
  if (!keyring) {
    // Conserva el aviso (p. ej. "cuenta confirmada") al pasar a la configuración.
    redirect(
      typeof aviso === "string" ? `/diario/configurar?aviso=${encodeURIComponent(aviso)}` : "/diario/configurar",
    );
  }

  const entries = await listEntries(user.id);
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;

  return <DiaryHome record={keyring.record} entries={entries} notice={notice} />;
}
