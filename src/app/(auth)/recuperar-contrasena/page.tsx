import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetRequestForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ResetRequestPage() {
  return (
    <AuthCard
      title="Recuperar la contraseña"
      intro={
        <p>
          Esto recupera el acceso a la cuenta, <strong className="font-medium text-text">no</strong> la frase secreta
          del diario. Si olvidaste la frase, necesitarás tu clave de recuperación.
        </p>
      }
      footer={
        <Link href="/login" className="font-medium text-accent underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      }
    >
      <ResetRequestForm />
    </AuthCard>
  );
}
