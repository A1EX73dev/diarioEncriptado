import { NavLink } from "@/components/NavLink";
import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/vault/SignOutButton";
import { VaultStatus } from "@/components/vault/VaultStatus";
import { requireUser } from "@/lib/auth/session";
import { VaultProvider } from "@/lib/vault/VaultProvider";

/**
 * Zona privada. El proxy ya redirige sin sesión, pero se vuelve a comprobar
 * aquí (y en cada acción): el proxy es una comodidad, no la barrera.
 *
 * VaultProvider vive en este layout, así que la clave sigue en memoria al
 * navegar entre /diario y /ajustes, y se pierde al salir de la zona privada
 * o al recargar.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <VaultProvider userId={user.id}>
      <SiteHeader
        homeHref="/diario"
        status={<VaultStatus />}
        nav={
          <>
            <NavLink href="/diario">Diario</NavLink>
            <NavLink href="/ajustes">Ajustes</NavLink>
            <SignOutButton />
          </>
        }
      />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 outline-none">
        {children}
      </main>
    </VaultProvider>
  );
}
