import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Privacidad" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="flex flex-col gap-3 font-serif text-lg leading-relaxed text-text-muted">{children}</div>
    </section>
  );
}

const item = "pl-1";

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 outline-none">
        <article className="flex flex-col gap-10">
          <header>
            <h1 className="font-serif text-4xl">Privacidad</h1>
            <p className="mt-4 font-serif text-lg leading-relaxed text-text-muted">
              Qué datos existen, dónde están y quién puede verlos, sin letra pequeña.
            </p>
          </header>

          <Section title="Lo que el servidor NO puede ver">
            <ul className="list-disc pl-6">
              <li className={item}>El título, el texto, el estado de ánimo y las etiquetas de tus entradas.</li>
              <li className={item}>Tu frase secreta ni tu clave de recuperación: nunca salen de tu navegador.</li>
              <li className={item}>La clave que descifra el diario: el servidor solo la guarda cifrada.</li>
              <li className={item}>Lo que buscas en el diario: la búsqueda se hace en tu navegador.</li>
            </ul>
            <p>
              Todo se cifra en tu navegador con AES-256-GCM antes de enviarse. Ni el administrador de la base de datos
              ni quien la robara podría leer tus entradas sin adivinar tu frase.
            </p>
          </Section>

          <Section title="Lo que el servidor SÍ ve (metadatos)">
            <ul className="list-disc pl-6">
              <li className={item}>Tu correo electrónico y la fecha en que creaste la cuenta.</li>
              <li className={item}>Cuántas entradas tienes y la fecha de cada una.</li>
              <li className={item}>Cuándo se creó y se modificó cada entrada.</li>
              <li className={item}>
                El tamaño aproximado de cada entrada, redondeado a bloques de 512 bytes para revelar menos.
              </li>
              <li className={item}>Los parámetros públicos del cifrado (sal, coste de Argon2id).</li>
              <li className={item}>
                Los intentos fallidos de inicio de sesión, guardados como huellas (HMAC) del correo y de la IP, no en
                claro, y borrados a las 24 horas.
              </li>
            </ul>
          </Section>

          <Section title="Lo que se guarda en tu navegador">
            <ul className="list-disc pl-6">
              <li className={item}>
                Cookies de sesión de la cuenta (HttpOnly: ningún script de la página puede leerlas).
              </li>
              <li className={item}>Una cookie con tu tema preferido (claro, oscuro o del sistema).</li>
              <li className={item}>
                En el almacenamiento local: el tiempo de bloqueo automático y el contador de intentos de desbloqueo.
              </li>
            </ul>
            <p>
              Nunca se guardan la frase, la clave del diario ni el texto de tus entradas: sin borradores, sin caché. Por
              eso recargar la página bloquea el diario.
            </p>
          </Section>

          <Section title="Sin terceros">
            <p>
              No hay analíticas, publicidad, rastreadores ni fuentes o scripts de otros servidores. La aplicación está
              pensada para usarse en tu propio equipo, con una base de datos local.
            </p>
          </Section>

          <Section title="Tus derechos">
            <ul className="list-disc pl-6">
              <li className={item}>
                Llevarte tus datos: en{" "}
                <Link href="/ajustes/datos" className="text-accent underline underline-offset-4">
                  Ajustes → Exportar e importar
                </Link>{" "}
                puedes descargar el diario cifrado o descifrado.
              </li>
              <li className={item}>
                Borrarlo todo: en{" "}
                <Link href="/ajustes/cuenta" className="text-accent underline underline-offset-4">
                  Ajustes → Cuenta
                </Link>{" "}
                se eliminan de inmediato la cuenta, la clave cifrada y todas las entradas.
              </li>
            </ul>
          </Section>

          <Section title="Límites honestos">
            <p>
              El cifrado no te protege si tu equipo tiene malware o extensiones del navegador maliciosas, si alguien usa
              tu equipo mientras el diario está desbloqueado, ni si el código que sirve la aplicación se modificara. Una
              frase corta o conocida se puede adivinar. Si pierdes la frase y la clave de recuperación, tus entradas son
              irrecuperables.
            </p>
            <p>Es un proyecto educativo sin auditoría de seguridad independiente: no lo uses para secretos críticos.</p>
          </Section>
        </article>
      </main>
    </>
  );
}
