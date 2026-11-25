import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { UpdatePasswordForm } from "@/components/auth/AuthForms";
import { Alert } from "@/components/ui/Alert";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Contraseña nueva" };

export default async function UpdatePasswordPage() {
  const user = await getSessionUser();
  return (
    <AuthCard title="Elige una contraseña nueva">
      {user ? (
        <UpdatePasswordForm />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone="error">El enlace no es válido o ha caducado.</Alert>
          <Link href="/recuperar-contrasena" className="font-medium text-accent underline underline-offset-4">
            Solicitar un enlace nuevo
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
