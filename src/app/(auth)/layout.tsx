import { SiteHeader } from "@/components/SiteHeader";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="contenido" tabIndex={-1} className="outline-none flex-1 px-4 py-12 sm:py-16">
        {children}
      </main>
    </>
  );
}
