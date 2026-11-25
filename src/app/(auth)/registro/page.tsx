import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignUpForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Crear cuenta"
      intro="Te enviaremos un enlace para confirmar el correo. Después configurarás la frase secreta que cifra tu diario."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-accent underline underline-offset-4">
            Iniciar sesión
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
