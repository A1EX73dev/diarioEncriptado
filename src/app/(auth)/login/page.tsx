import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignInForm } from "@/components/auth/AuthForms";
import { Alert } from "@/components/ui/Alert";
import { safeNextPath } from "@/lib/auth/paths";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = one(params.next);

  return (
    <AuthCard
      title="Iniciar sesión"
      intro="Primer paso: entra en tu cuenta. Verás tus entradas cifradas; para leerlas, después desbloquearás el diario con tu frase secreta."
      footer={
        <>
          ¿Aún no tienes cuenta?{" "}
          <Link href="/registro" className="font-medium text-accent underline underline-offset-4">
            Crear una cuenta
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {one(params.error) === "enlace" && (
          <Alert tone="error">El enlace no es válido o ha caducado. Solicita uno nuevo.</Alert>
        )}
        {one(params.sesion) === "cerrada" && <Alert tone="info">Has cerrado sesión. El diario se ha bloqueado.</Alert>}
        <SignInForm next={next ? safeNextPath(next) : undefined} />
      </div>
    </AuthCard>
  );
}
