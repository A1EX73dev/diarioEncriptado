import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-text-muted">
        <p>Proyecto educativo sin auditoría de seguridad. No lo uses para secretos críticos.</p>
        <Link href="/privacidad" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Privacidad
        </Link>
      </div>
    </footer>
  );
}
