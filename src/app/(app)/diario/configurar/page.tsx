import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { SetupWizard } from "@/components/vault/SetupWizard";
import { requireUser } from "@/lib/auth/session";
import { getKeyring } from "@/lib/dal/keyring";

export const metadata: Metadata = { title: "Configurar el diario" };

const NOTICES: Record<string, string> = {
  "cuenta-confirmada": "Cuenta confirmada. Ahora configura tu diario cifrado.",
  "contrasena-actualizada": "Contraseña de la cuenta actualizada.",
};

export default async function SetupPage({ searchParams }: PageProps<"/diario/configurar">) {
  const user = await requireUser();
  if (await getKeyring(user.id)) redirect("/diario");
  const aviso = (await searchParams).aviso;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;

  return (
    <div className="flex flex-col gap-8">
      {notice && (
        <div className="mx-auto w-full max-w-2xl">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      <SetupWizard userEmail={user.email} />
    </div>
  );
}
