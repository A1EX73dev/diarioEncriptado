import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { buttonClasses } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="contenido" tabIndex={-1} className="outline-none mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:py-24">
        <h1 className="font-serif text-4xl leading-tight text-text sm:text-5xl">
          Un cuaderno que solo tú puedes leer.
        </h1>
        <p className="mt-6 font-serif text-lg leading-relaxed text-text-muted">
          Tus entradas se cifran en tu navegador con una frase secreta que nunca sale de tu equipo. El servidor guarda
          únicamente texto ilegible.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/registro" className={buttonClasses("primary")}>
            Crear una cuenta
          </Link>
          <Link href="/login" className={buttonClasses("secondary")}>
            Iniciar sesión
          </Link>
        </div>
        <p className="mt-12 border-t border-border pt-6 text-sm text-text-muted">
          Proyecto educativo sin auditoría de seguridad independiente. No lo uses para secretos críticos.
        </p>
      </main>
    </>
  );
}
